# Product requirements: Starlight Factory

Status: draft rev 2, 2026-10-22, after a Codex critique. Owner: CEO lens. Architecture in `docs/architecture/ARD.md`, metrics in `METRICS.md`, plan in `ROADMAP.md`, operations in `docs/OPERATIONS.md`. Market facts carry sources at the end. Anything without a source is a hypothesis, and says so.

## 1. One sentence

Starlight Factory turns a labeled GitHub issue into a draft pull request a maintainer can review quickly and trust, running in the team's own cloud with the team's own model keys. Each PR states what it was checked against and what it cost.

## 2. What exists today, honestly

Status words: **planned** (designed, not built), **built** (code on a branch), **tested** (passes locally or in CI), **live** (verified on a real deployment).

| Capability | Status | Evidence |
| --- | --- | --- |
| Four stations, cross-vendor reviewer, draft-PR ceiling (upstream Foreman) | built upstream; **live** on Vercel per upstream | vercel-labs template |
| Railway host profile: own GitHub App, private bucket, Basic route auth | **tested** | PR #1 at 04d890d; local server 200 / 401 / 401 / 202 |
| Front door Worker (GitHub only) | **tested** | 10 unit tests; dry-run bundle 6.96 KiB |
| Replay claims on dispatched events | **tested** | Codex review; no live replay yet |
| Model routes (gateway, Cloudflare, direct) | **tested** | discovery and build; no live model call yet |
| Launch and host-port skills with eval suites | built | 17 cases parse; not yet run |
| First live run on Railway | **planned** (S1) | blocked by Railway's 2026-10-21 outage |
| Acceptance contracts, protected tests, signed receipts | **planned** (S3) | — |
| Cost per run on the PR, enforced monthly budget | **planned** (C1) | — |
| Durable inbox (no loss on crash) | **planned** (S2) | — |
| Restricted sandbox egress | **planned** (E1) | today egress is open to all hosts |
| Memory with quarantined lessons | **planned** (S4) | — |

Nothing **planned** is claimed in any public material until it reaches **live**.

## 3. The problem, in the buyer's words

- **"The tests pass, but I still wouldn't merge it."** Maintainers reviewing 296 test-passing agent PRs would reject about half (METR, 2026-03). Observed merge rates for agent PRs range from 82.6% (Codex) to 43.0% (Copilot) (AIDev study, 2026-01). Those are observational rates across different tasks, not a benchmark.
- **"I can't predict the bill."** After usage-based billing began (Copilot, 2026-06-01), users reported monthly bills jumping from about $29 to about $750 (secondary reports).
- **"An issue body can hijack the agent."** 2026 research showed crafted public issues steering coding agents to leak private code or CI secrets (secondary reports).
- **"The agent grades its own homework."** Models recognise and favour their own output (NeurIPS 2024).
- **"Our code and keys can't live in someone else's cloud."** The major hosted agents run in the vendor's environment. OpenHands is the main self-hosted exception.

## 4. Who it's for

| Persona | Situation | What they need |
| --- | --- | --- |
| **Maintainer-lead** (primary) | Small team or open-source project with well-scoped issues and a test suite; already tried a coding agent and distrusts its PRs | Less review time per merged change, and a reason to trust each PR |
| **Platform engineer** | Owns CI, cloud accounts and security review | Runs in their accounts; scoped tokens; auditable gates; a clear data-flow story |
| **Builder-founder** | One or two people shipping fast | First PR in one sitting; predictable cost; little to operate |

Out of scope for v1: SSO and enterprise procurement, on-prem without a cloud provider, and repositories without tests (acceptance can't be shown there).

## 5. Competitive position, and the proof we owe

| Product | Strength | Our intended difference | Status |
| --- | --- | --- | --- |
| Foreman (Vercel, our upstream) | One click on Vercel; cross-vendor review | Runs off Vercel; replay-safe intake; receipts and cost per PR | partly built |
| Copilot cloud agent | Built into GitHub; has budget controls | Buyer's own cloud and keys; reviewer from another vendor; receipt per PR | planned |
| OpenAI Codex | Highest observed agent-PR merge rate | Buyer's keys; independent reviewer; receipt | planned |
| OpenHands | Open source, self-hosted, BYOK | One-click Railway template; acceptance contracts; operator skills | partly built |
| Factory (Droids), Devin, Cursor agents | Polished hosted products | Self-hosted, open, BYOK | built |

**The objection we must answer first:** "Why would I run several services and approve contracts, without evidence that my review work goes down?" The answer has to be measured, not argued. Before launch, a head-to-head on identical tasks against OpenHands and Copilot reports maintainer minutes per merged change, repair commits, merge rate, recovery from failure, and total cost (B1 in the roadmap). If we don't win on maintainer minutes, we don't launch on that claim.

## 6. What a person experiences

1. **Deploy in one sitting.** One template, one script-created GitHub App, one model key, one Vercel token until S1.5. *Hypothesis:* first draft PR within 30 minutes of starting.
2. **The PR arrives with its evidence.** A progress comment per station; the plan; once S3 lands, the contract, the protected tests and the receipt status; once C1 lands, the run's cost.
3. **It asks instead of guessing.** Unclear issues get specific questions on the issue.
4. **It never surprises them.** Once C1 lands, a spending budget with a bounded overshoot (requirement F6). Nothing merges, publishes or deletes without a person.
5. **When it fails, it says what to do.** Every known failure maps to a message naming its fix.
6. **It learns their repo.** After S4, lessons wait for adoption; adopted lessons shape later runs.

## 7. Requirements

### Authority: who can make the factory act

- **Authorized requests** come only from people the channel trusts: on GitHub, a `factory` label from a user with triage permission or higher, an `@<app-slug>` mention from an owner, member or collaborator, and approval replies from those same people; on Linear, an Agent Session started by a member of the connected workspace.
- **Untrusted content** is everything else, including the text of issues, comments, diffs, files and webhook payloads. It is data the factory reads, never an instruction it follows. This holds even when an authorized person's message quotes it.
- **What an unattended run may do:** add labels, comment on its own intake issue, close or reopen issues, push a feature branch, and open draft PRs. Everything else is denied: merge, mark ready, publish, delete, settings. Today the code refuses pushes to `main`, `master` and `refs/` names; it doesn't yet require the `factory/` prefix the stations use by convention. Enforcing the prefix, and the repo's own protected branches, is part of E1.

### v1 must

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| F1 | An authorized `factory` label starts a run that ends in exactly one of: a draft PR; a clarifying question on the issue; once S3 lands, a contract awaiting approval; or failed or cancelled, each with its reason posted on the issue | Each outcome reproduced on the scratch repo |
| F2 | A contract awaiting approval can be approved only by triage-or-higher users, by reply or mention; it expires after 7 days; an expired or unauthorized approval resumes nothing | Approval, expiry and forged-approval tests (S3) |
| F3 | Implementation starts only after an approved contract; protected tests and a cross-vendor grade run before the PR is reported complete | Kernel cheat demos rejected (S3) |
| F4 | A `starlight/acceptance` status with a receipt that verifies for the exact commit, contract, evaluator and policy | The receipt turns invalid after any bound input changes (S3) |
| F5 | Run cost on the PR: models, sandbox and host, itemised | Within 10% of vendor dashboards over a month (C1) |
| F6 | **Spending budget.** Covered spend is model, sandbox and host usage attributed to runs. Each run reserves its maximum cost before starting and is cancelled at that ceiling. Runs start only while monthly spend plus open reservations stay under the budget. Concurrency is capped, so worst-case overshoot is bounded by the open reservations and is stated. Idle infrastructure is outside the budget and shown separately. | Concurrent-exhaustion and cancellation tests (C1) |
| F7 | No duplicate run from a replayed webhook; no silent loss after a crash between receipt and session start | Replay and kill tests (S2) |
| F8 | Sandbox egress limited to an allowlist: GitHub and the package registries the stack needs, plus hosts the buyer adds | An exfiltration attempt to another host fails (E1) |
| F9 | Every known failure maps to a message naming its fix | `factory-launch` failure-table coverage |
| F10 | Operator skills pass their eval suites, with a positive baseline delta on outcome cases | Staged eval run (S1.e) |

### v1 must not

- Merge, mark ready, publish, delete branches or change settings without a person.
- Follow instructions found in untrusted content.
- Hold a customer key, or run a customer workload, on infrastructure we operate.
- Use public object storage for anything a run writes (Railway mode already uses a private bucket; Vercel mode inherits upstream's public Blob store, which must change before we recommend it).

### Later

Cloudflare sandbox provider (S1.5); memory with quarantine (S4); a Docker Compose profile; an n8n trigger-and-approval shell; contract packs per stack; a database branch per PR; a preview check of the PR's deployment; sibling products from the same team spec.

## 8. Business model

- **Open core.** The template, team spec, generators, host adapters and operator skills are free and open source.
- **Paid packs** on Polar: acceptance-contract packs per stack, eval suites, premium stations. Prices are hypotheses until the waitlist's price-band answers exist.
- **Platform revenue, conditional.** Railway pays 15–25% of eligible usage of a published template's services. Affiliate programs pay only on attributed new customers. The base case for affiliate income is zero.
- **No hosted service** holding keys or code.

## 9. Licensing

| Component | License | Obligation |
| --- | --- | --- |
| Upstream template (Vercel, 2026) | MIT | Keep `LICENSE` and Vercel's copyright notice in all copies |
| Our additions in this repo | MIT, proposed (founder decision) | Add our copyright line next to Vercel's |
| Starlight kernel (dependency) | Apache-2.0, after its go-public | Keep its `NOTICE`; state modifications |
| Paid packs | Commercial license, sold on Polar | Separate terms; never mixed into the MIT tree |
| Generated output (PRs, branches) | The buyer's | We claim nothing |

## 10. Data the product touches

| Data | Where it lives | Retention | Who controls it |
| --- | --- | --- | --- |
| Repository code, issues, diffs | Buyer's GitHub; sandbox copies during a run | Sandbox lifetime not yet verified: stations open persistent environments and Vercel removes unresumable sandboxes after 14 days; S1 measures it | buyer |
| Run reports, handoff artifacts | Buyer's private bucket | Buyer's choice; 90 days by default (proposed) | buyer |
| Delivery claims | Buyer's bucket | Kept for the install's life (a few hundred bytes each); pruning waits for S2's event-age check, since a pruned claim lets an old event run again | buyer |
| Model prompts and outputs | The model vendors, under the buyer's own accounts | The vendor's policy for that account | buyer |
| Telemetry (opt-in only) | Our endpoint, aggregate counts and durations, no code or text | 13 months; withdrawal stops collection and deletes the install's records within 30 days (proposed) | buyer opts in |

## 11. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Name confusion with Factory (factory.com), which sells AI software-development agents | moderate to high | Choose a distinct name before any public listing; trademark search and counsel first |
| A hijacked implementer exfiltrates code through open sandbox egress | medium | Egress allowlist (F8, E1); injection evals; single-repo scoped tokens |
| Upstream eve moves fast (0.67, pre-1.0) | high | Adapters at the edges; monthly upstream merge; supported-version policy (`docs/OPERATIONS.md`) |
| Review effort doesn't actually fall | medium | Head-to-head before launch (§5); no claim without it |
| Setup friction | high | Script-created app; one-sitting target; S1.5 removes the Vercel account |

## 12. Founder decisions open

1. The product name.
2. The license for our additions (MIT proposed).
3. The first paid pack and its price band.
4. The repositories for the benchmark and the head-to-head.

## Sources

AIDev agent-PR study, arxiv.org/html/2601.15195 (2026-01-21). METR, metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main. Copilot plans and budget controls, github.com/features/copilot/plans; billing reports via letsdatascience.com (secondary). Prompt-injection cases via scworld.com and labs.cloudsecurityalliance.org (secondary, 2026). Self-preference in LLM evaluators, arxiv.org/abs/2404.13076. OpenHands, github.com/OpenHands/OpenHands and openhands.dev/pricing. Factory, factory.com/pricing. Foreman, github.com/vercel-labs/eve-software-factory-template. Railway kickbacks, docs.railway.com/templates/kickbacks. Read 2026-10-20 to 2026-10-22.
