# Starlight Burst

One task in. A chair plans N independent subtasks, an admission controller places each one on a lane, a second provider checks the merged result, and every decision lands in a receipt.

| Lane | Runs on | Model | Admitted when |
| --- | --- | --- | --- |
| `local` | `claude -p` on this machine | Claude Code, Max subscription | free RAM minus the 4 GiB floor leaves room (0.6 GiB per process, max 4) |
| `cloudflare` | Worker + one Durable Object per subtask (`cf-worker/`) | Workers AI `llama-3.3-70b-instruct-fp8-fast` | always, up to 12 in flight |
| `vercel` | Fluid function (`vercel-lane/`) calling AI Gateway with the deployment's OIDC token | workers rotate Claude Sonnet 5.5, GPT-6.1 Sol fast, Gemini 3.8 Flash (allowlisted) | always, up to 8 in flight |
| `anthropic` | Claude API | `claude-sonnet-5-5` | only when `ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY_FILE` is set (read per call) |

Roles: Claude Sonnet 5.5 plans, Claude Opus 5.5 integrates (capped at 1000 words so drafts finish), GPT-6.1 Sol checks. The checker is a different provider from the author; on `REVISE` the integrator gets one rewrite with the findings and is checked again. Each subtask is carried by a member of the seven-agent council from the ACOS artwork (`public/assets/council.png`, from frankx.ai `images/acos/acos-council-agents.png`). A failed subtask is requeued once on whatever lane has room. Metered gateway cost is summed per run.

## Run

```bash
# the shared secret both cloud lanes check (wrangler secret BURST_TOKEN, vercel env BURST_TOKEN)
BURST_TOKEN_FILE=/path/to/burst.token node burst/orchestrator.mjs   # http://127.0.0.1:4777
node burst/orchestrator.mjs --smoke                                 # one call per cloud lane
node burst/receipt.mjs                                              # audit trail of the latest run
```

`BURST_FLOOR_GIB` moves the RAM floor (default 4). Receipts go to `burst/runs/` (git-ignored); `examples/receipt-16way-pass.json` is a kept run.

## Measured, 2026-11-05

- 16 subtasks, peak 16 in flight: 1 local (31.4 s, admitted at 4.7 GiB free), 9 Cloudflare (AMS, LHR), 6 Vercel (iad1). 86.4 s wall including planning, synthesis and check; verdict PASS.
- At 2.6 GiB free the controller gave local 0 slots and sent all 12 subtasks to the cloud (43.6 s wall).
- Frontier roster, 14 subtasks: peak 14 in flight, 8 Cloudflare / 6 Vercel across four model families, 97.7 s wall, $0.1722 metered, PASS on round 1 (`examples/receipt-14way-frontier-pass.json`).
- Before the word cap, an unbounded Opus draft took 272.4 s and $0.6597, and the checker failed both rounds for truncation.

## Hosted missions (no localhost)

`cf-worker/src/mission.js` runs a whole mission inside one `MissionAgent` Durable Object, started from an alarm: plan (Sonnet 5.5) -> subtasks alternate Workers AI and gateway models -> Opus 5.5 integrates -> GPT-6.1 Sol checks, one revise round -> state and receipt in DO storage.

- Bound workers call the `MissionAPI` entrypoint (`start({mission, swarm, team})`, `get(id, since)`) with no token; it is not reachable over public HTTP.
- `POST|GET /mission/:id` is the token-gated HTTP route; `node burst/mission-cli.mjs "<mission>" "<swarm>" "agent-id,..."` drives it.
- Measured 2026-11-05: Mission Control's recorded "Price and launch our first paid offer" with its 7-agent Revenue & Venture team ran as 14 subtasks (7 edge, 7 across Claude/GPT/Gemini) in 157.2 s for $0.3564; the checker returned REVISE twice.

## Mission Control, live (`mission-control/`)

`https://starlight-mission-control-live.frankxai.workers.dev` serves the Mission Control page from `scratch/mission-control-edge` (copied by `sync-ui.mjs`, which fails if the page's hooks move) and executes routed missions on the engine over a service binding.

- Execution needs the mission key (`~/.starlight/burst/mission.key`, set as worker secret `MISSION_KEY`; the page asks once via "Unlock live execution"). Without it the run is recorded in D1 only. The engine also caps new missions at 25 per UTC day.
- `node burst/mission-control/smoke.mjs` proves the gate both ways and runs one live mission. Measured 2026-11-05: no key and wrong key stayed locked; with the key a 6-agent Product Forge team ran 12 subtasks in 135.5 s for $0.3129 (verdict REVISE, deliverable: HOLD, no evidence yet).
- The production worker `starlight-mission-control` (scratch, another writer) is untouched; the 3-line binding in this worker is what it would adopt.

## Deploy

```bash
cd burst/cf-worker && wrangler deploy && wrangler secret put BURST_TOKEN
cd burst/vercel-lane && vercel deploy --prod && vercel env add BURST_TOKEN production --sensitive
```
