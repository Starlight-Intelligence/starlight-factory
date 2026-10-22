# ADR-0010: Operator skills and their evals ship in the repo

Status: accepted; the first two skills are on PR #1. Owner: CAIO.

## Decision

- Skills that operate the product (`factory-launch`, `eve-host-port`) live in `.claude/skills/`.
- Each has an eval suite in schema 1.1: trigger, should-not-trigger, boundary, and LLM-judged outcome cases.
- A skill is promoted only after an authenticated run passes, with the score and the no-skill baseline delta recorded in the PR.

## Consequences

A buyer's own agent gets the same runbook the maintainers use. Eval runs cost money, so they are staged cheap-first (see `docs/engineering/EXPECTATIONS.md`).
