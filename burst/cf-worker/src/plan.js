// Pure helpers for the mission engine, kept free of Cloudflare APIs so they can be unit-tested in Node.

export const MAX_SUBTASKS = 16;
// Hub #351 mission id format, e.g. M-20261105-a1b2c3.
export const MISSION_ID_RE = /^M-\d{8}-[a-z0-9]{6}$/;

// "meridian-venture-conductor" -> { id, name: "Meridian", role: "venture conductor" }
export function agentFromId(id) {
  const [first, ...rest] = String(id).split("-");
  return { id: String(id), name: first.charAt(0).toUpperCase() + first.slice(1), role: rest.join(" ") || "specialist" };
}

export function newMissionId(now = new Date(), rand = Math.random) {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const tail = Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(rand() * 36)]).join("");
  return `M-${day}-${tail}`;
}

export function resolveMissionId(given, now, rand) {
  return MISSION_ID_RE.test(String(given ?? "")) ? String(given) : newMissionId(now, rand);
}

export function fanoutFor(requested, teamSize) {
  return Math.max(2, Math.min(MAX_SUBTASKS, Number(requested) || Math.max(teamSize * 2, 6)));
}

// Even subtasks run on the Cloudflare edge, odd ones rotate through the gateway models,
// so every mission spans at least two providers.
export function laneFor(index, gatewayTurn, workers) {
  if (index % 2 === 0) return { lane: "cloudflare", model: null };
  return { lane: "vercel", model: workers[gatewayTurn % workers.length] };
}

// Planner output -> subtasks. Accepts prose around the JSON, maps agent names to the team
// (case-insensitive), falls back to round-robin, drops items without a prompt, caps at fanout.
export function parsePlan(text, team, fanout) {
  const m = String(text).match(/\[[\s\S]*\]/);
  if (!m) throw new Error("planner returned no JSON array");
  let items;
  try {
    items = JSON.parse(m[0]);
  } catch (e) {
    throw new Error(`planner JSON did not parse: ${e.message}`);
  }
  if (!Array.isArray(items)) throw new Error("planner JSON is not an array");
  const byName = new Map(team.map((a) => [a.name.toLowerCase(), a]));
  const subtasks = items.filter((x) => x && x.prompt).slice(0, fanout).map((x, i) => ({
    id: `s${i + 1}`,
    title: String(x.title ?? `Subtask ${i + 1}`),
    agent: byName.get(String(x.agent ?? "").toLowerCase()) ?? team[i % Math.max(1, team.length)] ?? agentFromId("specialist"),
    prompt: String(x.prompt),
  }));
  if (subtasks.length === 0) throw new Error("planner returned no usable subtasks");
  return subtasks;
}
