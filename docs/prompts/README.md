# Prompt library

Briefs for the agents that build Starlight Factory. Each one is ready to paste into a fresh session. A brief is a contract: an agent that follows it should produce work a maintainer merges without asking a question.

## What every brief contains

1. **Outcome.** One sentence: what is true for the buyer when this is done.
2. **Base and context.** The exact branch and revision to start from, pinned dependency versions, the docs to read first (`AGENTS.md`, the ADRs it touches, the relevant eve docs page), and what already exists, so nothing is rebuilt.
3. **Scope.** Files and directories it may change, and what it must not touch, so two agents never write the same file.
4. **Constraints.** Host-switch and fork discipline (ADR-0001, ADR-0009), secret handling, spend gates, and the estate commit rules (`starlight-ops claim --adopt` with every staged file; draft PR on this fork, never upstream).
5. **Done when.** Observable checks: commands and their expected output, eval cases that must pass, a live result if one is required.
6. **Evidence to return.** What the final message must contain: commit SHAs, command output, review verdict, what was not proven.
7. **Gates.** A numeric spend ceiling, the activation condition, and what it must stop and ask about: publishing, deleting, credentials.

## Expectations for the agent

- Read before writing. Ground every external API in current docs and quote what you rely on.
- Prefer the smallest change that makes the outcome true. No speculative abstractions.
- Prove it at the right level and say what you didn't prove.
- Get a different-provider review on the head SHA before calling it done (`review.md`).
- End with a short report, not a narrative.

## Briefs

| File | Slice | Outcome |
| --- | --- | --- |
| `s1-first-run.md` | S1 | First measured live run on Railway |
| `e1-egress-allowlist.md` | E1 | Sandboxes reach only allowlisted hosts |
| `s1-5-cloudflare-sandbox.md` | S1.5 | Railway deploy with no Vercel account |
| `s2-durable-inbox.md` | S2 | No webhook is ever silently lost or run twice |
| `s3-acceptance-station.md` | S3 | Every factory PR carries a verifiable receipt |
| `c1-cost-and-budget.md` | C1 | Cost on every PR; budget holds under concurrency |
| `s4-memory-provider.md` | S4 | Lessons persist, scoped and quarantined |
| `eval-run.md` | any | Skill and agent evals, staged and capped |
| `review.md` | any | Adversarial cross-provider review |
