// Cloudflare burst lane: one Durable Object per subtask, executed on Workers AI.
// The DO keeps the subtask's state so a run can be inspected after the fact (GET /run/:id).
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
export { MissionAgent } from "./mission.js";

const MISSION_ID = /^[\w.-]{1,80}$/;

// Reachable only through a service binding (e.g. Mission Control's env.BURST), never over public HTTP,
// so a bound worker can start and read missions without holding the shared token.
export class MissionAPI extends WorkerEntrypoint {
  async start({ id, missionId, mission, swarm, team, fanout }) {
    if (!mission || typeof mission !== "string") throw new Error("mission required");
    const runId = MISSION_ID.test(String(id ?? "")) ? String(id) : crypto.randomUUID();
    const stub = this.env.MISSION.get(this.env.MISSION.idFromName(runId));
    if (!(await stub.get(0))) {
      const day = new Date().toISOString().slice(0, 10);
      const budget = await this.env.MISSION.get(this.env.MISSION.idFromName(`budget:${day}`)).take(Number(this.env.MISSION_DAILY_CAP ?? 25));
      if (!budget.ok) throw new Error(`daily mission cap reached (${budget.limit})`);
    }
    const s = await stub.start({ id: runId, missionId, mission, swarm, team: Array.isArray(team) ? team : [], fanout });
    return { id: runId, missionId: s.missionId, status: s.status };
  }
  async get(id, since = 0) {
    if (!MISSION_ID.test(String(id))) throw new Error("bad mission id");
    return this.env.MISSION.get(this.env.MISSION.idFromName(String(id))).get(since);
  }
}

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export class BurstAgent extends DurableObject {
  async fetch(request) {
    if (request.method === "GET") {
      return Response.json((await this.ctx.storage.get("state")) ?? { status: "unknown" });
    }
    const job = await request.json();
    const started = Date.now();
    await this.ctx.storage.put("state", { status: "running", job, started });
    try {
      const out = await this.env.AI.run(MODEL, {
        messages: [
          { role: "system", content: job.system ?? "You are a precise specialist agent. Answer the subtask only, in compact markdown." },
          { role: "user", content: job.prompt },
        ],
        max_tokens: job.maxTokens ?? 700,
      });
      const state = { status: "done", job, started, ms: Date.now() - started, model: MODEL, output: out.response ?? "", colo: job.colo };
      await this.ctx.storage.put("state", state);
      return Response.json(state);
    } catch (err) {
      const state = { status: "failed", job, started, ms: Date.now() - started, error: String(err) };
      await this.ctx.storage.put("state", state);
      return Response.json(state, { status: 502 });
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, colo: request.cf?.colo });
    if (request.headers.get("authorization") !== `Bearer ${env.BURST_TOKEN}`) {
      return new Response("unauthorized", { status: 401 });
    }
    const mm = url.pathname.match(/^\/mission\/([\w.-]{1,80})$/);
    if (mm) {
      const stub = env.MISSION.get(env.MISSION.idFromName(mm[1]));
      if (request.method === "POST") {
        const b = await request.json().catch(() => null);
        if (!b?.mission) return new Response("mission required", { status: 400 });
        try {
          return Response.json(await new MissionAPI(ctx, env).start({ ...b, id: mm[1] }), { status: 202 });
        } catch (e) {
          return new Response(e.message, { status: 429 });
        }
      }
      const s = await stub.get(Number(url.searchParams.get("since") ?? 0));
      return s ? Response.json(s) : new Response("not found", { status: 404 });
    }
    const m = url.pathname.match(/^\/run\/([\w.-]{1,120})$/);
    if (!m) return new Response("not found", { status: 404 });
    const stub = env.AGENT.get(env.AGENT.idFromName(m[1]));
    if (request.method === "GET") return stub.fetch(new Request(request.url));
    const job = await request.json();
    job.colo = request.cf?.colo;
    return stub.fetch(new Request(request.url, { method: "POST", body: JSON.stringify(job) }));
  },
};
