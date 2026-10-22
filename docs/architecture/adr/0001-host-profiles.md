# ADR-0001: One explicit host switch, adapters at the edges

Status: accepted, built on PR #1 (2026-10-20). Owner: CTO.

## Context

Foreman depends on four Vercel services: Connect for GitHub and Linear credentials, Blob for storage, OIDC for route auth, and Vercel Sandbox through OIDC. eve self-hosts as a Node server, but each of those must be replaced by something the buyer controls.

## Decision

`FACTORY_PLATFORM` selects the host: `vercel` (the default, upstream behaviour) or `railway`. Each Vercel dependency gets one adapter in a new file under `agent/lib/`:

- self-managed GitHub App tokens, scoped to `FACTORY_REPO`;
- an S3-compatible store (Railway Bucket or Cloudflare R2);
- HTTP Basic route auth with a 24-character minimum password;
- Vercel Sandbox, reached by access token.

The host is never inferred from which variables happen to be set.

## Consequences

- A half-configured deployment fails at load, with the variable's name in the error.
- The Vercel path stays upstream, so monthly upstream merges stay small.
- A Docker Compose profile and a Flue (Cloudflare) profile are later additions of the same shape.

## Evidence

`pnpm validate` is clean in both modes. The built server returned health 200 and session 401 / 401 / 202 for no, wrong and right credentials. Codex reviewed PR #1 six times; the whole PR passed at b040a62.
