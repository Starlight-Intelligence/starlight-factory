# ADR-0008: Memory with scopes and quarantine

Status: accepted; implementation is slice S4. Owner: CAIO.

## Context

Foreman keeps one Markdown "factory brain" per repo, up to 40,000 characters. eve offers a memory provider contract (`defineMemoryProvider`, with `recall`, `capture` and tools), scoped by key. Off Vercel, `fileMemory` throws unless it is given a backend.

## Decision

- Ship Starlight Memory as an eve memory provider. Recall runs at each turn.
- Lessons a run captures go to quarantine; a person adopts them before any later run reads them.
- Scopes are per product and per principal.
- The S3 store gains a compare-and-set backend for `fileMemory`-style documents.

## Consequences

An unattended run can never change what the next run reads. Sharing memory across products is opt-in and logged (ADR-0002).
