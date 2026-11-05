#!/usr/bin/env node
// Starlight Burst: one task in, a plan of subtasks out, each admitted to a lane.
// Local Claude (subscription) gets slots only while free RAM stays above the floor;
// everything else bursts to Cloudflare (Durable Object + Workers AI) and Vercel (AI Gateway -> Claude).
// A different provider checks the synthesis than the one that wrote it, and every event lands in a receipt.
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BURST_PORT ?? 4777);
const FLOOR_GIB = Number(process.env.BURST_FLOOR_GIB ?? 4);
const LOCAL_PROC_GIB = 0.6;
const LOCAL_MAX = 4;
const GIB = 1024 ** 3;
const CF_URL = process.env.BURST_CF_URL ?? "https://starlight-burst-agent.frankxai.workers.dev";
const VC_URL = process.env.BURST_VERCEL_URL ?? "https://starlight-burst-lane.vercel.app";
const TOKEN = (process.env.BURST_TOKEN ?? readTokenFile()).trim();

function readTokenFile() {
  const f = process.env.BURST_TOKEN_FILE;
  if (!f || !fs.existsSync(f)) throw new Error("Set BURST_TOKEN or BURST_TOKEN_FILE (shared secret for the cloud lanes)");
  return fs.readFileSync(f, "utf8");
}

const freeGiB = () => os.freemem() / GIB;
const localSlots = () => Math.max(0, Math.min(LOCAL_MAX, Math.floor((freeGiB() - FLOOR_GIB) / LOCAL_PROC_GIB)));

// ---------- lanes ----------
const authHeaders = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

async function postJson(url, body) {
  const r = await fetch(url, { method: "POST", headers: authHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
  const j = await r.json().catch(() => ({ status: "failed", error: `HTTP ${r.status}` }));
  if (!r.ok || j.status !== "done") throw new Error(j.error ?? `HTTP ${r.status}`);
  // Workers AI hands back already-parsed JSON when the model emits JSON; keep output a string everywhere.
  return { ...j, output: typeof j.output === "string" ? j.output : JSON.stringify(j.output) };
}

function runLocalClaude(job) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    // Subtask text comes from a model plan, so the local agent gets no tools, no MCP servers and an empty cwd.
    const win = process.platform === "win32";
    const noTools = win ? '""' : "";
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "burst-"));
    const child = spawn("claude", ["-p", "--output-format", "text", "--tools", noTools, "--strict-mcp-config"], { shell: win, cwd });
    let out = "";
    let err = "";
    const kill = setTimeout(() => child.kill(), 120_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(kill);
      fs.rmSync(cwd, { recursive: true, force: true });
      if (code !== 0) return reject(new Error(err.slice(0, 200) || `claude exited ${code}`));
      resolve({ status: "done", ms: Date.now() - started, model: "claude (Max subscription)", output: out.trim(), where: os.hostname() });
    });
    child.stdin.end(`${job.system ?? ""}\n\n${job.prompt}`);
  });
}

async function runAnthropic(job) {
  const started = Date.now();
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: job.maxTokens ?? 700, system: job.system, messages: [{ role: "user", content: job.prompt }] }),
    signal: AbortSignal.timeout(90_000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
  return { status: "done", ms: Date.now() - started, model: "claude-haiku-5-5", output: j.content?.map((c) => c.text ?? "").join("") ?? "" };
}

const LANES = {
  local: {
    label: "Local Claude Code", provider: "anthropic", meter: "Max subscription",
    capacity: () => localSlots(), enabled: () => true,
    run: runLocalClaude,
  },
  cloudflare: {
    label: "Cloudflare Agents", provider: "meta-llama@workers-ai", meter: "Workers AI",
    capacity: () => 12, enabled: () => true,
    run: (job, id) => postJson(`${CF_URL}/run/${id}`, job).then((j) => ({ ...j, where: `CF ${j.colo ?? "edge"}` })),
  },
  vercel: {
    label: "Vercel Fluid + AI Gateway", provider: "anthropic@vercel", meter: "AI Gateway",
    capacity: () => 8, enabled: () => true,
    run: (job) => postJson(`${VC_URL}/api/run`, job).then((j) => ({ ...j, where: `Vercel ${j.region ?? ""}` })),
  },
  anthropic: {
    label: "Claude API", provider: "anthropic", meter: "API key",
    capacity: () => 6, enabled: () => Boolean(process.env.ANTHROPIC_API_KEY),
    run: runAnthropic,
  },
};

// ---------- events + receipt ----------
const clients = new Set();
let receipt = null;

function emit(type, data = {}) {
  const ev = { type, t: Date.now(), ...data };
  if (receipt) receipt.events.push(ev);
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) res.write(line);
}

setInterval(() => {
  emit("ram", { freeGiB: +freeGiB().toFixed(2), totalGiB: +(os.totalmem() / GIB).toFixed(1), floorGiB: FLOOR_GIB, localSlots: localSlots() });
}, 1000).unref();

// ---------- planning ----------
const PLANNER_SYSTEM = `You are the Starlight chair. Decompose the user's task into independent subtasks that specialist agents can run in parallel with no shared state.
Return ONLY a JSON array, no prose, no code fence. Each item: {"title": string (max 6 words), "role": string (the specialist), "prompt": string (self-contained instruction under 50 words, naming the product and the exact output wanted)}.`;

function parsePlan(text, n) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("planner returned no JSON array");
  const arr = JSON.parse(m[0]).filter((s) => s && s.prompt).slice(0, n);
  if (arr.length === 0) throw new Error("planner returned an empty plan");
  return arr.map((s, i) => ({ id: `s${i + 1}`, title: String(s.title ?? `Subtask ${i + 1}`), role: String(s.role ?? "specialist"), prompt: String(s.prompt) }));
}

async function plan(task, n) {
  const job = { system: PLANNER_SYSTEM, prompt: `Task: ${task}\n\nProduce exactly ${n} subtasks.`, maxTokens: 4000 };
  for (const lane of ["vercel", "cloudflare"]) {
    try {
      const r = await LANES[lane].run(job, `plan-${receipt.runId}`);
      return { lane, subtasks: parsePlan(r.output, n) };
    } catch (e) {
      emit("log", { msg: `planner on ${lane} failed: ${e.message}` });
    }
  }
  throw new Error("no lane could plan this task");
}

// ---------- scheduling ----------
function pickLane(load) {
  const free = Object.entries(LANES)
    .filter(([, l]) => l.enabled())
    .map(([name, l]) => ({ name, cap: l.capacity(), used: load[name] ?? 0 }))
    .filter((x) => x.used < x.cap);
  if (free.length === 0) return null;
  const local = free.find((x) => x.name === "local");
  if (local) return { name: "local", reason: `RAM ${freeGiB().toFixed(1)} GiB > floor ${FLOOR_GIB} GiB: subscription slot ${local.used + 1}/${local.cap}` };
  free.sort((a, b) => a.used / a.cap - b.used / b.cap);
  const why = localSlots() === 0 ? `local at floor (${freeGiB().toFixed(1)}/${FLOOR_GIB} GiB): burst` : "local slots full: burst";
  return { name: free[0].name, reason: `${why} -> ${LANES[free[0].name].label} ${free[0].used + 1}/${free[0].cap}` };
}

async function execute(subtasks, task) {
  const load = {};
  const queue = [...subtasks];
  const results = [];
  let peak = 0;
  await new Promise((resolveAll) => {
    let running = 0;
    const pump = () => {
      while (queue.length) {
        const choice = pickLane(load);
        if (!choice) break;
        const st = queue.shift();
        load[choice.name] = (load[choice.name] ?? 0) + 1;
        running++;
        peak = Math.max(peak, running);
        emit("admit", { id: st.id, lane: choice.name, reason: choice.reason, running, peak });
        const job = { system: `You are the ${st.role} on a parallel agent team working on: "${task}". Do only your part, concretely, in compact markdown (max ~200 words).`, prompt: st.prompt, maxTokens: 600 };
        LANES[choice.name]
          .run(job, `${receipt.runId}-${st.id}`)
          .then((r) => {
            results.push({ ...st, lane: choice.name, ...r });
            emit("done", { id: st.id, lane: choice.name, ms: r.ms, model: r.model, where: r.where, output: r.output });
          })
          .catch((e) => {
            emit("fail", { id: st.id, lane: choice.name, error: e.message });
            if (!st.retried) queue.push({ ...st, retried: true });
            else results.push({ ...st, lane: choice.name, status: "failed", error: e.message });
          })
          .finally(() => {
            load[choice.name]--;
            running--;
            if (queue.length === 0 && running === 0) resolveAll();
            else pump();
          });
      }
      if (queue.length === 0 && running === 0) resolveAll();
    };
    pump();
  });
  return { results, peak };
}

async function synthesizeAndCheck(task, results) {
  const done = results.filter((r) => r.status === "done");
  const body = done.map((r) => `### ${r.title} (${r.role}, via ${r.lane})\n${r.output}`).join("\n\n");
  emit("phase", { phase: "synthesis", lane: "vercel" });
  const synth = await LANES.vercel.run({
    system: "You are the integrator. Merge specialist outputs into one coherent, decision-ready deliverable in markdown. Resolve contradictions explicitly. No filler.",
    prompt: `Task: ${task}\n\nSpecialist outputs:\n\n${body}`, maxTokens: 1500,
  }, `${receipt.runId}-synth`);
  emit("synth", { lane: "vercel", model: synth.model, ms: synth.ms, output: synth.output });
  emit("phase", { phase: "verification", lane: "cloudflare" });
  const check = await LANES.cloudflare.run({
    system: "You are an independent checker from a different model provider. Judge the deliverable against the task. Reply with a first line 'VERDICT: PASS' or 'VERDICT: REVISE', then at most 5 bullet findings.",
    prompt: `Task: ${task}\n\nDeliverable:\n${synth.output}`, maxTokens: 400,
  }, `${receipt.runId}-check`);
  emit("verify", { lane: "cloudflare", model: check.model, ms: check.ms, output: check.output, verdict: /VERDICT:\s*PASS/i.test(check.output) ? "PASS" : "REVISE" });
  return { synth, check };
}

let busy = false;
async function runTask(task, fanout) {
  busy = true;
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  receipt = { schema: "starlight.burst-receipt.v1", runId, task, fanout, floorGiB: FLOOR_GIB, host: os.hostname(), startedAt: new Date().toISOString(), events: [] };
  const t0 = Date.now();
  try {
    emit("start", { runId, task, fanout, lanes: Object.fromEntries(Object.entries(LANES).map(([k, l]) => [k, { label: l.label, provider: l.provider, meter: l.meter, enabled: l.enabled(), capacity: l.capacity() }])) });
    emit("phase", { phase: "planning", lane: "vercel" });
    const p = await plan(task, fanout);
    emit("plan", { lane: p.lane, subtasks: p.subtasks });
    emit("phase", { phase: "execution" });
    const { results, peak } = await execute(p.subtasks, task);
    const { check } = await synthesizeAndCheck(task, results);
    const byLane = results.reduce((a, r) => ({ ...a, [r.lane]: (a[r.lane] ?? 0) + 1 }), {});
    emit("complete", { runId, ms: Date.now() - t0, peak, byLane, verdict: /VERDICT:\s*PASS/i.test(check.output) ? "PASS" : "REVISE" });
  } catch (e) {
    emit("error", { msg: e.message });
  } finally {
    const dir = path.join(HERE, "runs");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify({ ...receipt, finishedAt: new Date().toISOString() }, null, 2));
    emit("receipt", { path: `burst/runs/${runId}.json`, events: receipt.events.length });
    busy = false;
  }
}

// ---------- http ----------
// Loopback only, and same-origin only: blocks DNS rebinding (Host) and cross-site POSTs (Origin + JSON preflight).
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
function sameOrigin(req) {
  if (!ALLOWED_HOSTS.has(req.headers.host)) return false;
  const origin = req.headers.origin;
  return !origin || ALLOWED_HOSTS.has(origin.replace(/^http:\/\//, ""));
}

const server = http.createServer((req, res) => {
  if (!sameOrigin(req)) return res.writeHead(403).end("forbidden");
  if (req.url === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (req.url === "/run" && req.method === "POST") {
    if (!String(req.headers["content-type"]).startsWith("application/json")) return res.writeHead(415).end("application/json required");
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      if (busy) return res.writeHead(409).end("a run is in progress");
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        return res.writeHead(400).end("invalid JSON");
      }
      const { task, fanout } = body;
      if (!task || typeof task !== "string" || task.length > 2000) return res.writeHead(400).end("task required (max 2000 chars)");
      const n = Math.max(2, Math.min(24, Number(fanout) || 10));
      runTask(task, n);
      res.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ accepted: true, fanout: n }));
    });
    return;
  }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return fs.createReadStream(path.join(HERE, "public", "index.html")).pipe(res);
  }
  res.writeHead(404).end();
});

if (process.argv.includes("--smoke")) {
  const job = { prompt: "In one sentence: why route agent work across lanes?", maxTokens: 80 };
  const out = await Promise.allSettled([LANES.cloudflare.run(job, "smoke"), LANES.vercel.run(job)]);
  out.forEach((o, i) => console.log(["cloudflare", "vercel"][i], o.status === "fulfilled" ? `${o.value.ms}ms ${o.value.where} :: ${o.value.output.slice(0, 140)}` : `FAILED ${o.reason.message}`));
  console.log(`local slots now: ${localSlots()} (free ${freeGiB().toFixed(2)} GiB, floor ${FLOOR_GIB})`);
} else {
  server.listen(PORT, "127.0.0.1", () => console.log(`Starlight Burst on http://127.0.0.1:${PORT}  (floor ${FLOOR_GIB} GiB, local slots ${localSlots()})`));
}
