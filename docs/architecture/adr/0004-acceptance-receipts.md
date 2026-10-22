# ADR-0004: Acceptance by contract and receipt, not reviewer opinion

Status: accepted; implementation is slice S3. Owner: CAIO.

## Context

Foreman's reviewer is a second model reading the diff. Two models agreeing proves little, and the agent that wrote the code must never decide what "done" means.

## Decision

1. Before the implementer starts, the analyst drafts an acceptance contract (criteria and protected tests), and a person approves it.
2. After the implementer pushes, the kernel runs the contract's own copy of the tests against the branch.
3. A reviewer from a different vendor grades the diff.
4. The kernel signs a receipt bound to the artifact, the target commit, the contract, the evaluator and the policy. The PR shows it as a `starlight/acceptance` commit status.

Contracts and the evaluator are pinned outside the candidate repo.

## Consequences

- An unattended run stops after drafting the contract, until a person approves it.
- A factory PR that touches the controls (approval policies, trust stamps, CI and eval config, contracts, the evaluator, signing) needs a separate human approval. The factory can never grade its own judge.
- The kernel's runner drives vendor CLIs under a user's login, which a hosted service can't do. The factory adopts the kernel's contract and receipt format, not its runner.
