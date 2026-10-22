# ADR-0006: Sandboxes that keep the git token outside

Status: accepted; the Cloudflare provider is slice S1.5. Owner: CTO.

## Context

Stations clone, test and push code. The installation token must never enter the sandbox, so egress needs credential injection. Railway has no nested containers.

## Decision

- **Now:** Vercel Sandbox, reached from Railway with a team-scoped access token. It is the only documented sandbox with credential-safe egress that works from outside its own platform.
- **Next:** an eve sandbox provider backed by Cloudflare Sandboxes through a small Worker, using its outbound handlers (credential injection since 2026-04-13).
- **Alternatives:** E2B and Daytona, once their egress features are verified.

## Consequences

A Railway buyer needs a Vercel account until S1.5 lands. Sandbox spend counts toward each run's cost and has to be measured.
