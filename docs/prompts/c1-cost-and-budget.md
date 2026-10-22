# C1: cost per run and an enforced budget

**Outcome.** Every factory PR shows what its run cost, and an install's monthly budget holds under concurrent runs, with a stated, bounded overshoot.

**Base.** Branch from `origin/main` once PR #1 has merged; until then from `origin/agent/claude/railway-s1` at `04d890d`. Record the exact SHA you started from in the PR. Name the branch `agent/<harness>/c1-cost`; one writer per worktree.

**Context.** Read PRD F5 and F6, METRICS (instrumentation table), ADR-0007, `agent/lib/models.ts`, the station wrappers in `agent/tools/run_*.ts`, and eve's docs on usage and session budgets in `node_modules/eve/docs/`. Model calls report tokens per call; sandbox and host usage don't, so they are estimated from minutes and reconciled monthly.

**Scope.** May change: a new `agent/lib/cost/` (price table, run ledger, reservations), `agent/lib/models.ts` and `agent/agent.ts` (to meter and cap the orchestrator's own model calls), the station wrappers in `agent/tools/run_*.ts` and each station's `agent.ts` (to meter and cap station calls), `agent/channels/github.ts` and `agent/channels/linear.ts` (to reserve before a session is dispatched), the ship step that writes the PR body, `.env.example` (`FACTORY_MONTHLY_BUDGET_USD`, `FACTORY_RUN_CEILING_USD`, `FACTORY_MAX_CONCURRENT_RUNS`), tests, a new ADR. Must not touch: trust, approval policies, the vendor split.

**Required behaviour.**
- Before a run starts, it reserves `FACTORY_RUN_CEILING_USD`. It starts only if month-to-date spend plus open reservations plus this reservation stays within the budget, and fewer than `FACTORY_MAX_CONCURRENT_RUNS` are open.
- Every model call sets a maximum output size, so its worst-case cost is known before it starts (input tokens times input price plus maximum output tokens times output price). A call whose worst case would cross the run's ceiling isn't made.
- During the run, spend is recorded per model call and per sandbox minute; the run is cancelled when it reaches its ceiling, and says so on the issue.
- Cancellation stops the run's sandboxes and confirms they stopped before the reservation is released; a sandbox that can't be confirmed stopped keeps its reservation and raises an error.
- On completion, the reservation is replaced by actual spend.
- Worst-case overshoot is the sum, over open runs, of one in-flight call's worst-case cost plus the sandbox minutes between the last meter reading and the stop; the PR footer and the docs state that bound in dollars.
- The price table is a dated file, read at build time; a missing model price fails closed (the run doesn't start).

**Coverage.** Every model call, the orchestrator's and every station's, goes through the meter; a test fails if any call path bypasses it.

**Done when.**
- A concurrency test starts more runs than the budget allows at once; the extras are refused with a clear message, and total recorded spend stays within budget plus the stated bound.
- A cancellation test stops a run at its ceiling, and the sandbox is confirmed stopped.
- A run report and PR footer show models, sandbox and host cost separately.
- `pnpm validate` reports 0 errors and 0 warnings.

**Evidence to return.** Test output, a sample PR footer, the head SHA, the review verdict, and the reconciliation method for vendor dashboards.

**Gates.** Spend ceiling: $0; tests use fake usage. Prices come from vendor pages read during the slice, with dates. Commit only after `starlight-ops claim --adopt`; draft PR on this fork.
