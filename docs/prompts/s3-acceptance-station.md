# S3: acceptance station

**Outcome.** Every factory PR carries a `starlight/acceptance` status backed by a signed receipt: the contract a person approved, its protected tests run against the exact commit, and a different-vendor grade.

**Base.** Branch from `origin/main` once PR #1 has merged; until then from `origin/agent/claude/railway-s1` at `04d890d`. Record the exact SHA you started from in the PR. Name the branch `agent/<harness>/<slice>`; one writer per worktree. Pin the kernel (its npm version, or its git commit until it publishes) and record it.

**Context.** Read ADR-0004, PRD requirements F1 to F4 (the approval-pending outcome, its approvers and its 7-day expiry), the kernel's README on `frankxai/starlight-kernel` (contracts, protected tests, receipts, completion markers), Foreman's `agent/instructions.ts` and the analyst and reviewer stations, and `agent/lib/github/approval.ts`.

**Scope.**
- The analyst drafts a contract (criteria and protected tests) as a handoff artifact.
- The run then ends in the `contract awaiting approval` outcome and posts the contract on the issue.
- A triage-or-higher user approves it by reply or mention within 7 days; approval resumes the run. An expired or unauthorized approval resumes nothing.
- After the push, protected tests run in the sandbox against the branch.
- The reviewer grades on a different vendor.
- A receipt is signed with a key the buyer holds, and published as a commit status.

**Constraints.**
- Contracts and the evaluator are pinned outside the candidate's checkout.
- A change to protected controls needs a separate human approval.
- The signing key never enters a sandbox or a prompt.

**Scope limits.** May change: `agent/instructions.ts` (the pipeline order and the new outcome), the analyst and reviewer stations, a new `agent/subagents/acceptance/` station and its `agent/tools/run_acceptance.ts`, a new `agent/lib/contracts/` (contract storage under a new reserved prefix registered in `agent/lib/blob.ts`, approval state and expiry), `agent/channels/github.ts` (routing approval replies and mentions to the waiting run, reusing the existing trust predicates), `agent/lib/github/approval.ts` (a new policy only), a new `agent/lib/receipts/`, evals, ADR-0004. Must not touch: the trust predicates in `agent/lib/trust.ts`, the vendor split in `agent/lib/models.ts`.

**Done when.**
- Approval, expiry and forged-approval tests pass (PRD F2).
- The kernel's cheat demos are rejected: a maker that edits protected tests, exits early, or fakes approval.
- A receipt turns invalid when the target branch moves.
- The safety evals pass.

**Evidence to return.** Demo results, receipt check output on mutated inputs, the review verdict.

**Gates.** Eval spend ceiling for the slice: $5, staged per `eval-run.md`; stop and ask before exceeding it. The buyer generates and stores the receipt signing key; the agent never sees it. Commit only after `starlight-ops claim --adopt`; draft PR on this fork.
