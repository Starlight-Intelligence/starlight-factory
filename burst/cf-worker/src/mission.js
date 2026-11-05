// Hosted mission executor. One Durable Object per mission: plan -> fan out across Workers AI and
// AI Gateway frontier models -> integrate -> cross-provider check (one revise round) -> receipt.
// Runs from an alarm so the request that starts it returns immediately and the run survives disconnects.
import { DurableObject } from "cloudflare:workers";
import { agentFromId, fanoutFor, laneFor, parsePlan, resolveMissionId } from "./plan.js";

export { agentFromId };
export const RECEIPT_SCHEMA = "starlight.burst-receipt.v1";
const EDGE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MODELS = {
  planner: "anthropic/claude-sonnet-5.5",
  integrator: "anthropic/claude-opus-5.5",
  checker: "openai/gpt-6.1-sol",
  workers: ["anthropic/claude-sonnet-5.5", "openai/gpt-6.1-sol-fast", "google/gemini-3.8-flash"],
};
export class MissionAgent extends DurableObject {
  async start(input) {
    const existing = await this.ctx.storage.get("state");
    if (existing) return existing;
    const team = (input.team ?? []).slice(0, 10).map(agentFromId);
    const state = {
      id: input.id, missionId: resolveMissionId(input.missionId), mission: String(input.mission).slice(0, 2000), swarm: input.swarm ?? null, team,
      fanout: fanoutFor(input.fanout, team.length),
      status: "queued", createdAt: Date.now(), events: [], costUsd: 0,
    };
    await this.ctx.storage.put("state", state);
    await this.ctx.storage.setAlarm(Date.now());
    return state;
  }

  // Used on a per-day "budget:YYYY-MM-DD" instance: a hard cap on missions, so a leaked key cannot run up spend.
  async take(limit) {
    const n = (await this.ctx.storage.get("n")) ?? 0;
    if (n >= limit) return { ok: false, used: n, limit };
    await this.ctx.storage.put("n", n + 1);
    return { ok: true, used: n + 1, limit };
  }

  async get(since = 0) {
    const s = await this.ctx.storage.get("state");
    if (!s) return null;
    return { ...s, events: s.events.slice(since), next: s.events.length };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST") return Response.json(await this.start(await request.json()), { status: 202 });
    const s = await this.get(Number(url.searchParams.get("since") ?? 0));
    return s ? Response.json(s) : new Response("not found", { status: 404 });
  }

  async alarm() {
    const s = await this.ctx.storage.get("state");
    if (!s || s.status !== "queued") return;
    s.status = "running";
    await this.ctx.storage.put("state", s);
    try {
      await this.run(s);
      s.status = "complete";
    } catch (e) {
      s.status = "failed";
      await this.emit(s, "error", { msg: String(e?.message ?? e) });
    }
    s.finishedAt = Date.now();
    await this.emit(s, "receipt", { schema: RECEIPT_SCHEMA, missionId: s.missionId, ms: s.finishedAt - s.createdAt, costUsd: +s.costUsd.toFixed(4) });
  }

  async emit(s, type, data = {}) {
    s.events.push({ type, t: Date.now(), ...data });
    if (typeof data.costUsd === "number") s.costUsd += data.costUsd;
    await this.ctx.storage.put("state", s);
  }

  async gateway(job) {
    const r = await fetch(`${this.env.VERCEL_LANE_URL}/api/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.env.BURST_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(job),
    });
    const j = await r.json().catch(() => ({ status: "failed", error: `HTTP ${r.status}` }));
    if (!r.ok || j.status !== "done") throw new Error(j.error ?? `HTTP ${r.status}`);
    return { ...j, where: `Vercel ${j.region ?? ""}`.trim() };
  }

  async edge(job) {
    const started = Date.now();
    const out = await this.env.AI.run(EDGE_MODEL, {
      messages: [{ role: "system", content: job.system }, { role: "user", content: job.prompt }],
      max_tokens: job.maxTokens ?? 600,
    });
    const text = typeof out.response === "string" ? out.response : JSON.stringify(out.response);
    return { status: "done", ms: Date.now() - started, model: EDGE_MODEL, output: text, where: "Cloudflare edge", costUsd: 0 };
  }

  async plan(s) {
    const roster = s.team.map((a) => `${a.name} (${a.role})`).join(", ") || "generalist specialists";
    const r = await this.gateway({
      model: MODELS.planner, maxTokens: 4000,
      system: `You are the mission chair. Split the mission into independent subtasks for this team: ${roster}. Return ONLY a JSON array, no prose, no code fence. Each item: {"title": string (max 6 words), "agent": one team name, "prompt": self-contained instruction under 50 words}.`,
      prompt: `Mission: ${s.mission}\nSwarm: ${s.swarm ?? "unassigned"}\nProduce exactly ${s.fanout} subtasks.`,
    });
    const subtasks = parsePlan(r.output, s.team, s.fanout);
    await this.emit(s, "plan", { model: r.model, costUsd: r.costUsd ?? 0, subtasks });
    return subtasks;
  }

  async run(s) {
    await this.emit(s, "start", { missionId: s.missionId, mission: s.mission, swarm: s.swarm, team: s.team });
    const subtasks = await this.plan(s);
    let turn = 0;
    const results = await Promise.all(subtasks.map(async (st, i) => {
      const pick = laneFor(i, turn, MODELS.workers);
      if (pick.lane === "vercel") turn++;
      const onEdge = pick.lane === "cloudflare";
      const model = onEdge ? EDGE_MODEL : pick.model;
      await this.emit(s, "admit", { id: st.id, agent: st.agent, lane: onEdge ? "cloudflare" : "vercel", model });
      const job = {
        system: `You are ${st.agent.name}, the ${st.agent.role}, on a team working on: "${s.mission}". Do only your part, concretely, in compact markdown (max ~200 words).`,
        prompt: st.prompt, maxTokens: 600, model: onEdge ? undefined : model,
      };
      const run = () => (onEdge ? this.edge(job) : this.gateway(job));
      try {
        const r = await run().catch(run);
        await this.emit(s, "done", { id: st.id, agent: st.agent, lane: onEdge ? "cloudflare" : "vercel", ms: r.ms, model: r.model, where: r.where, costUsd: r.costUsd ?? 0, output: r.output });
        return { ...st, ...r };
      } catch (e) {
        await this.emit(s, "fail", { id: st.id, agent: st.agent, error: String(e.message) });
        return { ...st, status: "failed" };
      }
    }));
    await this.integrateAndCheck(s, results.filter((r) => r.status === "done"));
  }

  async integrateAndCheck(s, done) {
    const body = done.map((r) => `### ${r.title} (${r.agent.name}, ${r.agent.role})\n${r.output}`).join("\n\n");
    const base = {
      model: MODELS.integrator, maxTokens: 4000,
      system: "You are the integrator. Merge specialist outputs into one decision-ready deliverable in markdown. One section per part of the mission. Resolve contradictions explicitly. Hard limit 1000 words; always finish every section.",
      prompt: `Mission: ${s.mission}\n\nSpecialist outputs:\n\n${body}`,
    };
    const integrate = (job) => this.gateway(job).catch(() => this.gateway({ ...job, model: MODELS.planner }));
    const check = async (draft, round) => {
      const c = await this.gateway({
        model: MODELS.checker, maxTokens: 500,
        system: "You are an independent checker from a different model provider than the author. First line 'VERDICT: PASS' or 'VERDICT: REVISE', then at most 5 bullet findings.",
        prompt: `Mission: ${s.mission}\n\nDeliverable:\n${draft}`,
      });
      const verdict = /VERDICT:\s*PASS/i.test(c.output) ? "PASS" : "REVISE";
      await this.emit(s, "verify", { round, model: c.model, ms: c.ms, costUsd: c.costUsd ?? 0, verdict, output: c.output });
      return { c, verdict };
    };
    let draft = await integrate(base);
    await this.emit(s, "synth", { round: 1, model: draft.model, ms: draft.ms, costUsd: draft.costUsd ?? 0, output: draft.output });
    let { c, verdict } = await check(draft.output, 1);
    if (verdict === "REVISE") {
      draft = await integrate({ ...base, prompt: `${base.prompt}\n\nPrevious draft:\n${draft.output}\n\nChecker findings to fix; return the complete revised deliverable:\n${c.output}` });
      await this.emit(s, "synth", { round: 2, model: draft.model, ms: draft.ms, costUsd: draft.costUsd ?? 0, output: draft.output });
      ({ verdict } = await check(draft.output, 2));
    }
    s.verdict = verdict;
    s.deliverable = draft.output;
  }
}
