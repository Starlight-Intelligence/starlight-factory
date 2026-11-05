#!/usr/bin/env node
// Copies the Mission Control page from its source of truth and applies the live-execution hooks,
// so the preview never forks the design. Fails loudly if the page changed shape under us.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.MC_UI_SRC ?? "C:/Users/frank/starlight/scratch/mission-control-edge/public";
const OUT = path.join(HERE, "public");

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

const file = path.join(OUT, "index.html");
let html = fs.readFileSync(file, "utf8");
const patches = [
  // send the mission key with the routed mission
  ['fetch("/api/mission",{method:"POST",headers:{"content-type":"application/json"}', 'fetch("/api/mission",{method:"POST",headers:{"content-type":"application/json","x-mission-key":(window.missionKey?window.missionKey():"")}'],
  // after the routed-team animation, hand the receipt to the live follower
  ['feed();}else line("k",', 'feed();window.burstFollow&&burstFollow(rc);}else line("k",'],
];
for (const [from, to] of patches) {
  if (!html.includes(from)) throw new Error(`UI changed shape; hook not found: ${from.slice(0, 60)}`);
  html = html.replace(from, to);
}
html = html.replace("dispatch simulated", "dispatching live");
html = html.replace(/<\/body>|$/, `<script>${fs.readFileSync(path.join(HERE, "ui", "live.js"), "utf8")}</script>$&`);
fs.writeFileSync(file, html);
console.log(`synced ${SRC} -> ${OUT} with live hooks`);
