# S4: memory provider

**Outcome.** The factory remembers what it learned about a repository across runs, and nothing an unattended run learns reaches a later run until a person adopts it.

**Base.** Branch from `origin/main` once PR #1 has merged; until then from `origin/agent/claude/railway-s1` at `04d890d`. Record the exact SHA you started from in the PR. Name the branch `agent/<harness>/<slice>`; one writer per worktree. Pin the memory package to an exact version.

**Context.** Read ADR-0008, ADR-0002, eve's `memory/overview.mdx`, `memory/custom-provider.md`, `memory/file.md` and `patterns/multi-tenant-memory.md`, the current factory brain (`agent/lib/factory-brain.ts`, the brain tools), and the `@starlight-intelligence/memory` package.

**Scope.**
- An eve memory slot backed by Starlight Memory, scoped by product and principal.
- A compare-and-set document backend on the S3 store.
- A quarantine: captured lessons wait for adoption.
- An operator command to list and adopt them.

**Constraints.**
- Partition every operation by scope key.
- Treat `operationId` as an idempotency key.
- No cross-product read without an explicit, logged grant.

**Scope limits.** May change: a new `agent/memory/` slot, a new `agent/lib/memory/`, `agent/lib/s3-store.ts` (compare-and-set only), a new operator tool gated by `factoryBrainPolicy`, evals, ADR-0008. Must not touch: stations, the GitHub channel, `agent/lib/models.ts`.

**Done when.**
- An eval shows an unattended run's captured lesson is invisible to the next run until it is adopted, and visible afterwards.
- A second product's scope can't read the first's.

**Evidence to return.** Eval output, the review verdict.

**Gates.** Eval spend ceiling: $3, staged per `eval-run.md`. No production data: tests use a scratch bucket prefix. Commit only after `starlight-ops claim --adopt`; draft PR on this fork.
