#!/usr/bin/env node
// Start a hosted mission and follow it to its receipt.
// BURST_TOKEN_FILE=... node burst/mission-cli.mjs "<mission>" [swarm] [agent-id,agent-id,...]
import fs from "node:fs";

const BASE = process.env.BURST_CF_URL ?? "https://starlight-burst-agent.frankxai.workers.dev";
const token = (process.env.BURST_TOKEN ?? fs.readFileSync(process.env.BURST_TOKEN_FILE, "utf8")).trim();
const [mission, swarm = null, teamCsv = ""] = process.argv.slice(2);
if (!mission) throw new Error('usage: mission-cli.mjs "<mission>" [swarm] [agent-id,...]');

const id = `m-${Date.now()}`;
const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const started = await fetch(`${BASE}/mission/${id}`, { method: "POST", headers: h, body: JSON.stringify({ mission, swarm, team: teamCsv.split(",").filter(Boolean) }) });
if (!started.ok) throw new Error(`start failed: ${started.status} ${await started.text()}`);
console.log(`mission ${id} accepted`);

let since = 0;
for (;;) {
  await new Promise((r) => setTimeout(r, 2000));
  const s = await (await fetch(`${BASE}/mission/${id}?since=${since}`, { headers: h })).json();
  for (const e of s.events) {
    const who = e.agent ? `${e.agent.name}` : "";
    if (e.type === "plan") console.log(`plan: ${e.subtasks.length} subtasks by ${e.model}`);
    if (e.type === "done") console.log(`  done ${e.id} ${who.padEnd(9)} ${e.lane.padEnd(10)} ${(e.ms / 1000).toFixed(1)}s ${e.model}`);
    if (e.type === "fail") console.log(`  FAIL ${e.id} ${who}: ${e.error}`);
    if (e.type === "synth") console.log(`draft ${e.round} by ${e.model} (${(e.ms / 1000).toFixed(1)}s)`);
    if (e.type === "verify") console.log(`check ${e.round} by ${e.model}: ${e.verdict}`);
    if (e.type === "error") console.log(`ERROR ${e.msg}`);
    if (e.type === "receipt") console.log(`receipt: ${(e.ms / 1000).toFixed(1)}s, $${e.costUsd}`);
  }
  since = s.next;
  if (s.status === "complete" || s.status === "failed") {
    console.log(`status ${s.status}, verdict ${s.verdict ?? "-"}\n---\n${(s.deliverable ?? "").slice(0, 700)}`);
    break;
  }
}
