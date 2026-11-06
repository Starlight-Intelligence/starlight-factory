#!/usr/bin/env node
// Copies the Mission Control page from its source of truth so Burst Console never forks the design.
// The page itself carries the live-execution hook and live.js (starlight-command-center, same branch);
// this fails loudly if either is missing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Canonical page: starlight-command-center apps/mission-control-edge (branch agent/claude/mission-control-edge).
// scratch/mission-control-edge is a stale pre-fix copy; never sync from it.
const SRC = process.env.MC_UI_SRC ?? "C:/Users/frank/starlight/repos/starlight-command-center/.claude/worktrees/agent+claude+mission-control-edge/apps/mission-control-edge/public";
const OUT = path.join(HERE, "public");

const html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
if (!html.includes("burstFollow(rc)") || !html.includes('src="live.js"')) throw new Error("canonical page lacks the live-execution hook");
if (!fs.existsSync(path.join(SRC, "live.js"))) throw new Error("canonical page lacks live.js");

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
console.log(`synced ${SRC} -> ${OUT}`);
