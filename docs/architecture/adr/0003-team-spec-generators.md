# ADR-0003: Products generated from one team spec

Status: ruled at estate level as ADR-010 (2026-10-20). The spec and its eve generator live in `frankxai/starlight-kernel`, branch `agent/claude/team-spec`. Owner: CTO.

## Context

Hand-built agents drift: each product reinvents gates, model choices and budgets.

## Decision

Each product is described once, in a team spec: its seats, the tools each seat holds and what they can do, the four approval gates (send, publish, delete, destructive), model tiers, a budget, and the evals that prove it. Generators emit the runtime structure: eve today, Flue for Cloudflare next. Content (instructions, skills, tools) is hand-written and referenced by path. Model ids never appear in a spec; each seat resolves `STARLIGHT_MODEL_<SEAT>` or `STARLIGHT_MODEL_<TIER>` at build time.

## Consequences

- The factory's own spec, `foreman.team.json`, already reads this fork.
- The spec has budget and vendor-independence fields, but nothing enforces them yet. The product doesn't claim either until it does.
- n8n and Make shells can later be generated from the same spec, as triggers and approvals only.
