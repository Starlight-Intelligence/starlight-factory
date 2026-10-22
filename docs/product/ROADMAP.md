# Roadmap: Starlight Factory

Status: draft rev 2, 2026-10-22, after a Codex critique. Each slice has a done-when that can be checked, and most have a ready brief in `docs/prompts/`. No dates until the first live run measures our pace; order is what matters.

## Leadership calls

**CEO: focus and sequence.**
1. **One product until it's loved.** No sibling product (marketing, assistant, voice) ships before the factory hits its v1 targets on the benchmark set. The architecture keeps them cheap later (ADR-0002, ADR-0003).
2. **Rename before launch.** "Factory" collides with Factory (factory.com), which sells AI software-development agents. Pick a distinct name before the template is listed anywhere public.
3. **Sell proof and price, and earn the claim first.** Competitors sell "it writes code for you". We intend to sell "every PR comes with proof and a price", and we say so only after S3 and C1 are live and B1 shows maintainers spend less time per merged change.

**CTO: the technical bets.**
1. Self-hosted eve on Railway, with adapters at the edges (ADR-0001, ADR-0009).
2. Intake that neither loses nor duplicates work (ADR-0005), finished before any listing.
3. Closed sandbox egress (E1) before any private repository is pointed at it.
4. Sandboxes independent of Vercel (ADR-0006), so a buyer has two accounts, not three.

**CAIO: the model and eval bets.**
1. **Acceptance by contract and receipt** (ADR-0004), against self-graded agents.
2. **Different vendors** for maker and checker, enforced by the generator (ADR-0007).
3. **Every model release runs the benchmark set**, held-out issues included, before it becomes a tier default; results are published with their intervals.

## Slices

| Slice | Outcome | Done when | Brief |
| --- | --- | --- | --- |
| **S1** first live run | A measured PR from Railway | Draft PR on the scratch repo; minutes, cost and acceptance published; recovery test recorded | `s1-first-run.md` |
| **S1.e** skill evals | Launch skills proven | Both suites pass in stages; baseline delta recorded | `eval-run.md` |
| **E1** egress allowlist | Code can't leave by an unexpected door | Exfiltration test to a non-allowlisted host fails; package installs still work | `e1-egress-allowlist.md` |
| **S2** durable inbox | Nothing lost, nothing doubled | Kill and replay tests pass; DLQ alert; intake ADR | `s2-durable-inbox.md` |
| **V1** private Vercel storage | Vercel mode safe for private repos | Run documents in a private Blob store; no public URL resolves | — |
| **S3** acceptance station | Every PR has a verifiable receipt | Approval and expiry tests; cheat demos rejected; receipt invalid on any change | `s3-acceptance-station.md` |
| **C1** cost and budget | No surprise bills | Run cost on the PR within 10% of dashboards; concurrent-exhaustion test holds the stated overshoot | `c1-cost-and-budget.md` |
| **S1.5** Cloudflare sandbox | No Vercel account on Railway | Validate, bundle, unit tests; live clone-and-push after go-ahead | `s1-5-cloudflare-sandbox.md` |
| **B1** benchmark and head-to-head | Honest quality numbers | 30 issues plus 10 held out, 3 repos, 2 stacks; same issues on OpenHands and Copilot; first report published with intervals | — |
| **S4** memory | It learns the repo | Quarantine eval passes | `s4-memory-provider.md` |
| **O1** operating contract | A buyer can run it for a year | `SECURITY.md`, `docs/OPERATIONS.md`, release notes template, backup and restore rehearsed once | — |
| **L1** launch | Public template | New name; README and demo; Railway template listed (founder approves publication) | — |
| **P1** first paid pack | Revenue from value | One contract pack on Polar; waitlist price band read first | — |

## Sequence and why

1. **S1 and S1.e first:** nothing else matters until one real PR exists and the runbook is proven.
2. **E1 next, before any private repo:** open egress is the one gap that can leak a buyer's code.
3. **S2 and V1 before any public listing:** losing or exposing a buyer's work is the fastest way to lose trust.
4. **S3 and C1 before launch:** they are the two promises in the pitch.
5. **B1 runs alongside S3 and C1:** launch claims come only from it, failures included. If we don't beat the head-to-head on maintainer minutes, we change the pitch, not the numbers.
6. **S1.5 and S4** can run in parallel with S3 in separate worktrees; their briefs list disjoint files.
7. **O1 before L1.** **L1** only when every guardrail holds and acceptance is near target (the target inside the benchmark's interval).

## What we will not do in v1

- Host a service that holds customer keys or code.
- Ship sibling products.
- Claim a budget, vendor independence, acceptance rates or reduced review time before code enforces them or B1 measures them.
