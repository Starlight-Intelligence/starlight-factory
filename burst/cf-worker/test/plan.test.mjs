import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { addEventCost, agentFromId, fanoutFor, laneFor, MISSION_ID_RE, newMissionId, parsePlan, resolveMissionId } from "../src/plan.js";

test("mission cost counts each charge once and never the receipt summary (factory#3 P1)", () => {
  const events = [
    ["plan", { costUsd: 0.01 }], ["admit", {}], ["done", { costUsd: 0 }], ["done", { costUsd: 0.02 }],
    ["synth", { costUsd: 0.2 }], ["verify", { costUsd: 0.05 }],
  ];
  let total = 0;
  for (const [type, data] of events) total = addEventCost(total, type, data);
  const receiptCost = +total.toFixed(4);
  const final = addEventCost(total, "receipt", { costUsd: receiptCost });
  assert.equal(final, total, "receipt must not add its own total again");
  assert.equal(+final.toFixed(4), receiptCost);
  assert.equal(addEventCost(0.1, "done", { costUsd: -5 }), 0.1);
  assert.equal(addEventCost(0.1, "done", { costUsd: Number.NaN }), 0.1);
  assert.equal(addEventCost(0.1, "done", { costUsd: "0.3" }), 0.1);
});

const team = ["meridian-venture-conductor", "ledger-unit-economist", "vera-decision-verifier"].map(agentFromId);

test("agentFromId derives name and role from the registry id", () => {
  assert.deepEqual(agentFromId("meridian-venture-conductor"), { id: "meridian-venture-conductor", name: "Meridian", role: "venture conductor" });
  assert.equal(agentFromId("solo").role, "specialist");
});

test("parsePlan tolerates prose around the JSON and maps agents case-insensitively", () => {
  const out = parsePlan('Here you go:\n[{"title":"Price","agent":"LEDGER","prompt":"model it"},{"agent":"vera","prompt":"check it"}] done', team, 8);
  assert.equal(out.length, 2);
  assert.equal(out[0].agent.name, "Ledger");
  assert.equal(out[1].agent.name, "Vera");
  assert.equal(out[1].title, "Subtask 2");
  assert.deepEqual(out.map((s) => s.id), ["s1", "s2"]);
});

test("parsePlan falls back to round-robin for unknown agents and caps at fanout", () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ agent: "nobody", prompt: `p${i}` }));
  const out = parsePlan(JSON.stringify(items), team, 4);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map((s) => s.agent.name), ["Meridian", "Ledger", "Vera", "Meridian"]);
});

test("parsePlan drops items without a prompt and fails closed on unusable output", () => {
  assert.equal(parsePlan('[{"title":"x"},{"prompt":"y"}]', team, 4).length, 1);
  assert.throws(() => parsePlan("no json here", team, 4), /no JSON array/);
  assert.throws(() => parsePlan("[{bad json}]", team, 4), /did not parse/);
  assert.throws(() => parsePlan('[{"title":"only"}]', team, 4), /no usable subtasks/);
});

test("fanoutFor clamps to 2..16 and defaults to twice the team (min 6)", () => {
  assert.equal(fanoutFor(undefined, 7), 14);
  assert.equal(fanoutFor(undefined, 1), 6);
  assert.equal(fanoutFor(99, 3), 16);
  assert.equal(fanoutFor(1, 3), 2);
});

test("laneFor alternates edge and gateway and rotates gateway models", () => {
  const workers = ["a", "b", "c"];
  assert.deepEqual(laneFor(0, 0, workers), { lane: "cloudflare", model: null });
  assert.deepEqual(laneFor(1, 0, workers), { lane: "vercel", model: "a" });
  assert.deepEqual(laneFor(3, 1, workers), { lane: "vercel", model: "b" });
  assert.deepEqual(laneFor(5, 3, workers), { lane: "vercel", model: "a" });
});

test("mission ids follow the hub #351 format and a valid given id is kept", () => {
  const fixed = newMissionId(new Date("2026-11-05T12:00:00Z"), () => 0);
  assert.equal(fixed, "M-20261105-aaaaaa");
  assert.match(newMissionId(), MISSION_ID_RE);
  assert.equal(resolveMissionId("M-20261105-a1b2c3"), "M-20261105-a1b2c3");
  assert.match(resolveMissionId("mc-7"), MISSION_ID_RE);
});

test("receipt.schema.json declares every event type the engine emits", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../../receipt.schema.json", import.meta.url), "utf8"));
  const types = schema.$defs.event.oneOf.map((b) => b.properties.type.const).sort();
  assert.deepEqual(types, ["admit", "done", "error", "fail", "plan", "receipt", "start", "synth", "verify"]);
  const engine = fs.readFileSync(new URL("../src/mission.js", import.meta.url), "utf8");
  const emitted = [...new Set([...engine.matchAll(/emit\(s, "(\w+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(emitted, types, "engine emits an event type the schema does not declare, or vice versa");
});
