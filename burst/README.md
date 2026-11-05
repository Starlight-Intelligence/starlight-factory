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

## Deploy

```bash
cd burst/cf-worker && wrangler deploy && wrangler secret put BURST_TOKEN
cd burst/vercel-lane && vercel deploy --prod && vercel env add BURST_TOKEN production --sensitive
```
