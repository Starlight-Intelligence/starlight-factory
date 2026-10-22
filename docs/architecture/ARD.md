# Architecture requirements: Starlight Factory

Status: draft rev 2, 2026-10-22, after a Codex critique. Owner: CTO lens. Companion to `docs/product/PRD.md`. Decisions are recorded one per file in `docs/architecture/adr/`.

## 1. What the architecture must make true

Starlight Factory turns a labeled issue into a draft pull request that a person can trust, running entirely in the buyer's own accounts. Every requirement below serves one of four promises.

| Promise | Means in architecture |
| --- | --- |
| **The buyer owns everything** | No service we operate sits in the request path. Keys, bills and merges stay in the buyer's accounts. Data leaves them only to the vendors the buyer chose (model, sandbox, Cloudflare when the front door is used), under the buyer's own accounts; §4a lists every flow and its current gaps. |
| **A PR is trustworthy, not just plausible** | Maker and checker are different vendors, acceptance is a contract written before work, and the result carries a receipt bound to the exact commit. |
| **Nothing ships without a person; spend and data exposure are bounded** | Draft PR is the unattended ceiling, enforced in code today. Spend is bounded once C1 lands and sandbox egress once E1 lands; until then both are documented gaps (§4a, `SECURITY.md`). |
| **It runs where the buyer already is** | One codebase, several hosts, chosen by one explicit switch; Vercel's upstream path keeps working. |

## 2. Quality attributes, with measurable targets

| Attribute | Requirement | How it's measured | Target for v1 |
| --- | --- | --- | --- |
| Safety | No secret enters a sandbox, a log line or a model prompt | Static review plus a canary-token test in CI | zero findings |
| Safety | Unattended runs can't merge, mark ready, publish or delete | Safety evals (`evals/safety/*`) | 100% pass, every PR |
| Integrity | A receipt verifies only for the exact artifact, contract, evaluator and policy | Kernel `check` on mutated inputs | invalid on every mutation |
| Durability | A restart mid-run never duplicates a PR or silently drops a labeled issue | Kill test during the implementer step | resumes or reports; never silent |
| Idempotency | A replayed webhook starts no second run | Replay test via the front door | 0 duplicates |
| Latency | Label to draft PR on a small change | First-run measurement | ≤ 15 min p50 |
| Safety | Sandboxes reach only allowlisted hosts | Exfiltration test to a non-allowlisted host (E1) | blocked |
| Cost | Visible per run; monthly budget with per-run reservations and a stated maximum overshoot (PRD F6) | Run report plus concurrent-exhaustion test | shown on every PR; overshoot within the stated bound |
| Portability | Same code runs on Railway, Vercel and Docker Compose hosts | `pnpm validate` per host profile, one live run per host | Railway and Vercel live in v1 |
| Operability | Every failure names its fix | Failure table coverage in `factory-launch` | every known error string mapped |
| Upgradability | Upstream template changes merge in under an hour | Monthly upstream merge PR | ≤ 1 conflict file |

## 3. Constraints

- **eve 0.67** is the runtime. Self-hosting means a Node server, a workflow world, and explicit adapters for what Vercel provided ([ADR-0001](adr/0001-host-profiles.md)).
- **BYOK, no multi-tenant service.** The estate doctrine forbids us from holding customer keys or running their workloads.
- **Fork discipline.** Upstream files are touched only to call new adapters; renames happen at the edges ([ADR-0009](adr/0009-fork-discipline.md)).
- **Budget is a gate, not a report.** A team spec's `monthlyUsd` must be enforced by code (reservation before start, cancellation at the run ceiling, capped concurrency) before the product claims a budget.

## 4. System context

```text
GitHub ──webhook──▶ [front door Worker, optional] ──▶ factory service (eve, Node)
Linear ──webhook──────────────────────────────────▶   │
                                                      ├─ stations: classifier · analyst · implementer · reviewer
                                                      ├─ kernel: contract → protected tests → signed receipt (S3)
                                                      ├─ memory provider: scoped, quarantined lessons (S4)
                                                      └─ adapters: credentials · storage · route auth · model route
                                                      ├──▶ sandbox API (Vercel Sandbox; Cloudflare Sandbox in S1.5)
                                                      ├──▶ model vendors (buyer's keys, gateway or direct)
                                                      └──▶ volume + private bucket (buyer's Railway project)
```

The front door covers GitHub only. Linear posts straight to the service and has no queue; a dropped Linear webhook is recovered by re-triggering the session.

## 4a. Data flows and current gaps

| Flow | Leaves the buyer's accounts? | Today | Gap and fix |
| --- | --- | --- | --- |
| Code into the sandbox | to the sandbox vendor, under the buyer's account | Vercel Sandbox, single-repo installation token injected at egress | **Sandbox egress is open to every host** (`"*": []` in `agent/lib/github/git-remote.ts`): a hijacked implementer can send code anywhere. Fix: allowlist (E1, PRD F8) |
| Prompts and diffs to models | to the model vendors, under the buyer's keys | gateway, Cloudflare or direct route | vendor retention follows the buyer's account settings; we document it, we don't control it |
| Run state and artifacts | no | Railway mode: private S3-compatible bucket | **Vercel mode inherits upstream's public Blob store with predictable keys.** Fix before we recommend Vercel mode: private Blob store (V1) |
| GitHub webhooks through the front door | to Cloudflare, under the buyer's account | payload queued up to 24 h (Workers Free) or 4 days by default (Workers Paid) | queue retention documented in `docs/OPERATIONS.md` |
| Telemetry | to us, only after opt-in | not built | counts and durations only (PRD §10) |

## 5. Decision index

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](adr/0001-host-profiles.md) | One explicit host switch with adapters; Vercel path unchanged | accepted, built |
| [0002](adr/0002-one-project-many-services.md) | Products start as services in one buyer Railway project with scoped memory | ruled 2026-10-21 |
| [0003](adr/0003-team-spec-generators.md) | Teams generated from one spec (estate ADR-010: eve or Flue) | ruled 2026-10-20 |
| [0004](adr/0004-acceptance-receipts.md) | Acceptance by kernel contract and signed receipt, not reviewer opinion | accepted, S3 |
| [0005](adr/0005-webhook-intake.md) | GitHub front door queue plus content-keyed claims now; durable inbox next; Linear unqueued | partial, S2 |
| [0006](adr/0006-sandbox-strategy.md) | Vercel Sandbox now; Cloudflare Sandbox via a Worker next | accepted, S1.5 |
| [0007](adr/0007-model-routes.md) | Buyer's keys through a chosen route; maker and checker on different vendors | accepted, built |
| [0008](adr/0008-memory.md) | Starlight Memory as an eve memory provider; lessons quarantined | accepted, S4 |
| [0009](adr/0009-fork-discipline.md) | Keep upstream ids; change the edges | accepted |
| [0010](adr/0010-skills-and-evals-ship-with-the-product.md) | Operator skills and their evals ship in the repo | accepted |

## 6. Open architecture questions

1. Which Workflow world for more than one replica: `@workflow/world-postgres`, or a custom world? Decide in S2 with a load test.
2. Does a Basic-auth principal count as a `user` for per-user tools? Test before relying on it.
3. Receipt signing key custody on the buyer's side: environment variable, Railway sealed variable, or KMS. Decide in S3.
4. Egress allowlist mechanics: Vercel Sandbox network policy per host versus a proxy; how package installs (npm, PyPI) stay working. Decide in E1.
5. Spend attribution: model usage comes back per call; sandbox and host usage don't. Decide the estimate and the reconciliation in C1.
