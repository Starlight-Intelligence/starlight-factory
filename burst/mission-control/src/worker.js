// Starlight Mission Control on the edge: serves the cockpit page, keeps service state in D1,
// probes Supabase on a cron, and records routed missions as real receipts.

const LOCAL_STALE_MS = 5 * 60 * 1000;
const SUPABASE = [
  { id: "supabase-platform", label: "Supabase · Starlight Platform", ref: "gfrfcqyprekhazzugdkr", key: "SUPABASE_PLATFORM_KEY" },
  { id: "supabase-arcanea", label: "Supabase · Arcanea", ref: "hcfhyssdzphudaqatxbk", key: "SUPABASE_ARCANEA_KEY" },
];
const ORDER = ["supabase-platform", "supabase-arcanea", "sis", "orchestrator", "toolplane", "machine", "observatory-local"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function upsert(env, s, source) {
  const now = Date.now();
  const prev = await env.DB.prepare("SELECT state FROM mc_services WHERE id = ?").bind(s.id).first();
  if (!prev || prev.state !== s.state) {
    await env.DB.prepare("INSERT INTO mc_events (service, from_state, to_state, detail, at) VALUES (?, ?, ?, ?, ?)")
      .bind(s.id, prev ? prev.state : null, s.state, s.detail || "", now).run();
  }
  await env.DB.prepare("INSERT OR REPLACE INTO mc_services (id, label, state, detail, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(s.id, s.label, s.state, s.detail || "", source, now).run();
}

async function probeSupabase(env) {
  for (const p of SUPABASE) {
    let state = "down", detail = "no response";
    try {
      const t0 = Date.now();
      const r = await fetch(`https://${p.ref}.supabase.co/auth/v1/health`, {
        headers: { apikey: env[p.key] || "" }, signal: AbortSignal.timeout(8000),
      });
      const ms = Date.now() - t0;
      state = r.ok ? "ok" : "degraded";
      detail = r.ok ? `auth health 200 · ${ms} ms from the edge` : `auth health ${r.status}`;
    } catch (e) { detail = `probe failed: ${String(e.message || e).slice(0, 80)}`; }
    await upsert(env, { id: p.id, label: p.label, state, detail }, "edge");
  }
}

async function status(env) {
  const { results } = await env.DB.prepare("SELECT * FROM mc_services").all();
  const now = Date.now();
  const services = results.map((r) => {
    const stale = r.source === "local" && now - r.updated_at > LOCAL_STALE_MS;
    return { ...r, state: stale ? "stale" : r.state, age_s: Math.round((now - r.updated_at) / 1000) };
  }).sort((a, b) => (ORDER.indexOf(a.id) + 99) % 99 - (ORDER.indexOf(b.id) + 99) % 99);
  const runs = await env.DB.prepare("SELECT COUNT(*) AS n FROM mc_runs").first();
  return { at: now, services, runs: runs ? runs.n : 0 };
}

const clip = (v, n) => String(v ?? "").slice(0, n);

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (u.pathname === "/api/status") return json(await status(env));

    if (u.pathname === "/api/events") {
      const { results } = await env.DB.prepare("SELECT * FROM mc_events ORDER BY id DESC LIMIT 30").all();
      return json({ events: results });
    }

    if (u.pathname === "/api/runs" && req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM mc_runs ORDER BY id DESC LIMIT 12").all();
      return json({ runs: results });
    }

    if (u.pathname === "/api/heartbeat" && req.method === "POST") {
      if (!env.AGENT_TOKEN || req.headers.get("authorization") !== `Bearer ${env.AGENT_TOKEN}`) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.services)) return json({ error: "expected {services:[...]}" }, 400);
      for (const s of body.services.slice(0, 12)) {
        if (!s || !s.id) continue;
        await upsert(env, { id: clip(s.id, 40), label: clip(s.label, 60), state: clip(s.state, 16), detail: clip(s.detail, 160) }, "local");
      }
      return json({ ok: true });
    }

    if (u.pathname === "/api/mission" && req.method === "POST") {
      // The D1 database is shared with the production cockpit, so anonymous callers must not write to it at all.
      if (!env.MISSION_KEY || (req.headers.get("x-operator-key") ?? req.headers.get("x-mission-key")) !== env.MISSION_KEY) return json({ error: "locked", reason: "locked" }, 401);
      const b = await req.json().catch(() => null);
      if (!b || typeof b.mission !== "string" || !b.mission.trim()) return json({ error: "mission required" }, 400);
      const team = Array.isArray(b.team) ? b.team.slice(0, 10).map((t) => clip(t, 60)) : [];
      const now = Date.now();
      const r = await env.DB.prepare("INSERT INTO mc_runs (mission, swarm, team, lane, at) VALUES (?, ?, ?, ?, ?)")
        .bind(clip(b.mission, 200), clip(b.swarm, 60), JSON.stringify(team), clip(b.lane, 80), now).run();
      ctx.waitUntil(env.DB.prepare("DELETE FROM mc_runs WHERE id <= (SELECT MAX(id) - 500 FROM mc_runs)").run());
      try {
        const started = await env.BURST.start({ id: `mc-${r.meta.last_row_id}`, mission: b.mission, swarm: b.swarm, team });
        return json({ id: r.meta.last_row_id, at: now, burst: started });
      } catch (e) {
        return json({ id: r.meta.last_row_id, at: now, burst: null, reason: String(e.message || e).slice(0, 120) });
      }
    }

    const live = u.pathname.match(/^\/api\/mission\/(mc-\d{1,9})$/);
    if (live && req.method === "GET") {
      // Mission ids are sequential, so reading a run needs the same key that started it.
      if (!env.MISSION_KEY || (req.headers.get("x-operator-key") ?? req.headers.get("x-mission-key")) !== env.MISSION_KEY) return json({ error: "unauthorized" }, 401);
      const s = await env.BURST.get(live[1], Number(u.searchParams.get("since") || 0));
      return s ? json(s) : json({ error: "not found" }, 404);
    }

    if (u.pathname === "/api/probe" && req.method === "POST") {
      if (!env.AGENT_TOKEN || req.headers.get("authorization") !== `Bearer ${env.AGENT_TOKEN}`) return json({ error: "unauthorized" }, 401);
      await probeSupabase(env);
      return json(await status(env));
    }

    return env.ASSETS.fetch(req);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(probeSupabase(env));
  },
};
