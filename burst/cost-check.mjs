#!/usr/bin/env node
// Live regression for factory#3 P1: a finished mission's stored cost must equal its receipt cost.
// BURST_TOKEN_FILE=... node burst/cost-check.mjs [missionRunId]
import fs from "node:fs";

const BASE = process.env.BURST_CF_URL ?? "https://starlight-burst-agent.frankxai.workers.dev";
const token = fs.readFileSync(process.env.BURST_TOKEN_FILE, "utf8").trim();
const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
let id = process.argv[2];

if (!id) {
  id = `cost-${Date.now()}`;
  const r = await fetch(`${BASE}/mission/${id}`, { method: "POST", headers: h, body: JSON.stringify({ mission: "Name three risks of launching a paid developer tool without a waitlist, one line each.", fanout: 2 }) });
  if (!r.ok) throw new Error(`start failed: ${r.status} ${await r.text()}`);
}
for (;;) {
  const s = await (await fetch(`${BASE}/mission/${id}`, { headers: h })).json();
  if (s.status === "complete" || s.status === "failed") {
    const receipt = s.events.find((e) => e.type === "receipt");
    const charged = s.events.filter((e) => e.type !== "receipt").reduce((t, e) => t + (typeof e.costUsd === "number" ? e.costUsd : 0), 0);
    const ok = receipt && +s.costUsd.toFixed(4) === receipt.costUsd && +charged.toFixed(4) === receipt.costUsd;
    console.log(`${id} ${s.status}: state $${s.costUsd.toFixed(4)} receipt $${receipt?.costUsd} sum-of-charges $${charged.toFixed(4)} -> ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 3000));
}
