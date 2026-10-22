# Success metrics: Starlight Factory

Status: draft rev 2, 2026-10-22, after a Codex critique. Owner: CEO and CAIO lenses. Every metric has one definition, an observation window, a source event and an owner. A number with no source is not reported. Every target is a **hypothesis** until the benchmark set has produced a baseline; targets are revised once, after the first two benchmark runs, and the revision is published.

## Outcome words, used the same way everywhere

| Word | Meaning | Window |
| --- | --- | --- |
| **Run outcome** | Every run ends in exactly one of: draft PR, question, contract awaiting approval, failed, cancelled | — |
| **Completed run** | A run whose outcome is a draft PR | — |
| **Ready** | A person marked the factory's draft PR ready for review | 7 days after the draft opened |
| **Merged** | The factory's PR merged into the default branch | 14 days after the draft opened |
| **Accepted** | Merged, and the human-authored diff after the factory's last commit is trivial: at most 5 changed lines, formatting or renames only, checked by script then by a reviewer | 14 days |
| **Reverted** | A merged factory commit undone by a revert commit or a PR that names it | 30 days after merge |

"Tests passed" is never acceptance. Maintainers would reject about half of test-passing agent PRs (METR, 2026-03).

## North star

**Accepted factory PRs per active install per week.** An active install had at least one completed run that week. It counts what buyers value: merged work they didn't have to fix.

## Quality metrics, published per release on the benchmark set

| Metric | Definition | Hypothesis target | Reference |
| --- | --- | --- | --- |
| **Acceptance rate** | Accepted ÷ completed runs | ≥ 70% at launch | Observed merge rates 43–83% across vendors (AIDev, observational, not comparable tasks) |
| **Merge rate** | Merged ÷ completed runs | reported, no target | same |
| **Clarify rate** | Runs ending in a question ÷ runs | 10–30%: zero suggests guessing, high suggests poor intake | — |
| **Maintainer minutes per merged PR** | Reviewer-logged minutes from first look to merge | lower than both head-to-head competitors | none published |
| **Cost per accepted PR** | (model + sandbox + host run spend) ÷ accepted PRs | published; no target until measured | none published |
| **Revert rate** | Reverted ÷ merged | ≤ 3% | none published |
| **Time to draft PR** | Label to draft PR, p50 and p90 | p50 ≤ 15 min on issues sized S | — |
| **Receipt validity** | Receipts verifying at merge time ÷ accepted PRs, after S3 | 100% | — |

**How the benchmark is run.** 30 issues across 3 repos and 2 stacks, sized and labelled before any run. A further 10 are held out and run only at release candidates, so we can't tune to them. Each rate is reported with its count and a 95% Wilson interval: at n = 30 an observed 70% has an interval of about 52–83%, so small differences are noise, and we say so. "Near target" means the target falls inside the interval.

## Adoption metrics: the path to superfans

These need opt-in telemetry and are reported only for installs that opted in, with the opted-in count beside each number.

| Stage | Metric | Definition | Hypothesis target |
| --- | --- | --- | --- |
| Activation | Time to first PR | `deploy.started` to the first `run.ended` with outcome draft, p50 | ≤ 30 min |
| Activation | Setup success | Installs with a completed run within 24 h ÷ installs with `deploy.started` | ≥ 70% |
| Retention | Week-4 active | Installs active in week 4 ÷ installs activated in week 0 | ≥ 50% |
| Love | "Very disappointed" share | Sean Ellis question, asked in-product once after the 5th accepted PR | ≥ 40% |
| Advocacy | Community contributions | External issues, PRs and contract packs per month | rising |
| Revenue | Template deploys | Railway template dashboard, monthly | tracked |
| Revenue | Pack conversion | Pack buyers ÷ week-4 active installs | measured after the first pack |

Stars aren't a goal; fake stars are common and fade (StarScout, 2024).

## Guardrails: any breach stops a release

- A secret found in a sandbox, a log, a model prompt or git.
- An unattended merge, mark-ready, publish or delete.
- A duplicate run from a replayed webhook.
- Run spend above the install's budget plus the stated maximum overshoot (PRD F6).
- A receipt that verifies after a bound input changed.
- A sandbox connection to a host outside the allowlist, after E1.

## Instrumentation: event, identity, owner

None of this exists yet. Today the factory posts progress comments and handles only the PR-opened event; the run report and every event below are built in C1, except `receipt.checked` (S3). Until then, S1 and the first benchmark runs are measured by hand from GitHub and vendor dashboards.

| Event | Emitted by | Key fields | Feeds | Owner | Lands in |
| --- | --- | --- | --- | --- | --- |
| `deploy.started` | `create-github-app.mjs` | install id (random, local), timestamp | activation | CTO | telemetry, opt-in |
| `run.started` | GitHub channel | run id, issue number, repo hash, trigger | all run metrics | CTO | run report |
| `run.station` | each station | run id, station, duration, tokens and cost per seat | time, cost | CTO | run report |
| `run.ended` | orchestrator | run id, outcome (draft / question / contract / failed / cancelled), reason, PR number | completed, clarify, failure rate | CTO | run report |
| `pr.ready` / `pr.merged` / `pr.reverted` | GitHub webhooks via the channel (new hooks; today only PR-opened is handled) | PR number, actor type, timestamp | ready, merged, reverted | CTO | run report |
| `pr.post_factory_diff` | merge hook | changed lines by humans after the last factory commit | accepted | CAIO | run report |
| `review.minutes` | reviewer, via a `/factory minutes N` comment | PR number, minutes | maintainer minutes | CEO | run report |
| `receipt.checked` | acceptance station, after S3 | PR, receipt id, valid | receipt validity | CAIO | run report |

The planned run report is one JSON document per run in the buyer's private bucket. Telemetry receives only counts and durations keyed by the random install id: no repo names, no code, no issue text. Reading `pr.*` events needs the App's existing `pull_requests: read` permission; nothing new.

## Cadence

- **Weekly:** north star and quality metrics for our own installs.
- **Per release:** the benchmark run and its held-out set, published with failures and intervals.
- **Monthly:** run cost reconciled against vendor dashboards (F5); adoption metrics once telemetry exists.
