#!/usr/bin/env node
// Prints a run receipt as a short audit trail: plan, every admission decision, failures, verdict.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "runs");
const file = process.argv[2] ?? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().at(-1);
if (!file) throw new Error(`no receipts in ${dir}`);
const r = JSON.parse(fs.readFileSync(path.isAbsolute(file) ? file : path.join(dir, file), "utf8"));
const of = (t) => r.events.filter((e) => e.type === t);

console.log(`${r.runId}  task: ${r.task.slice(0, 90)}`);
const plan = of("plan")[0];
console.log(`plan: ${plan?.subtasks.length ?? 0} subtasks by ${plan?.lane ?? "-"}`);
for (const a of of("admit")) {
  const d = of("done").find((x) => x.id === a.id && x.lane === a.lane);
  console.log(`  ${a.id.padEnd(4)} ${a.lane.padEnd(10)} ${d ? `${(d.ms / 1000).toFixed(1)}s ${d.where ?? ""}` : "-"}  | ${a.reason}`);
}
for (const f of of("fail")) console.log(`  FAIL ${f.id} on ${f.lane}: ${f.error}`);
for (const l of of("log")) console.log(`  log: ${l.msg}`);
for (const e of of("error")) console.log(`  ERROR ${e.msg}`);
const c = of("complete")[0];
if (c) console.log(`complete: ${(c.ms / 1000).toFixed(1)}s wall, peak ${c.peak} parallel, lanes ${JSON.stringify(c.byLane)}, verdict ${c.verdict}, metered $${c.costUsd ?? "-"}`);
for (const v of of("verify")) console.log(`check round ${v.round ?? 1} (${v.model}): ${v.verdict}\n${v.output.slice(0, 300)}`);
