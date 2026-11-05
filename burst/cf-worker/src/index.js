// Cloudflare burst lane: one Durable Object per subtask, executed on Workers AI.
// The DO keeps the subtask's state so a run can be inspected after the fact (GET /run/:id).
import { DurableObject } from "cloudflare:workers";

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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, colo: request.cf?.colo });
    if (request.headers.get("authorization") !== `Bearer ${env.BURST_TOKEN}`) {
      return new Response("unauthorized", { status: 401 });
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
