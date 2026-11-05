#!/usr/bin/env node
// Proves the gate both ways: no key -> receipt only; key -> real run streamed to completion.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.MC_URL ?? "https://starlight-mission-control-live.frankxai.workers.dev";
const key = fs.readFileSync(path.join(os.homedir(), ".starlight", "burst", "mission.key"), "utf8").trim();
const body = {
  mission: "Validate a new product idea with real customers before we build it",
  swarm: "Product Forge",
  team: ["astra-sovereign", "ignis-product-conductor", "nova-customer-discovery", "tess-system-designer", "prism-quality-critic", "vera-decision-verifier"],
  lane: "agent/claude/validate-product-idea",
};
const post = (headers) => fetch(`${BASE}/api/mission`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, ...(await r.json()) }));

const locked = await post({});
console.log(`no key   -> HTTP ${locked.status}, run #${locked.id ?? "none written"}, burst ${locked.burst ? "STARTED (gate failed open!)" : `null (${locked.reason})`}`);
const badKey = await post({ "x-mission-key": "wrong" });
console.log(`bad key  -> HTTP ${badKey.status}, run #${badKey.id ?? "none written"}, burst ${badKey.burst ? "STARTED (gate failed open!)" : `null (${badKey.reason})`}`);
const live = await post({ "x-mission-key": key });
if (!live.burst) throw new Error(`live run did not start: ${live.reason}`);
console.log(`good key -> run #${live.id}, burst ${live.burst.id} ${live.burst.status}`);

const anon = await fetch(`${BASE}/api/mission/${live.burst.id}`);
console.log(`read without key -> ${anon.status}${anon.status === 401 ? "" : " (gate failed open!)"}`);

let since = 0;
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const s = await fetch(`${BASE}/api/mission/${live.burst.id}?since=${since}`, { headers: { "x-mission-key": key } }).then((r) => r.json());
  for (const e of s.events) {
    if (e.type === "plan") console.log(`  plan ${e.subtasks.length} subtasks`);
    if (e.type === "verify") console.log(`  check ${e.round}: ${e.verdict}`);
    if (e.type === "receipt") console.log(`  receipt ${e.schema} ${e.missionId} ${(e.ms / 1000).toFixed(1)}s $${e.costUsd}`);
  }
  since = s.next;
  if (s.status === "complete" || s.status === "failed") {
    const done = s.events.length;
    console.log(`status ${s.status}, verdict ${s.verdict}, ${s.team.length} agents\n${(s.deliverable ?? "").slice(0, 400)}`);
    break;
  }
}
