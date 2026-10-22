# ADR-0007: The buyer's keys, through a chosen route

Status: accepted, built on PR #1. Owner: CAIO.

## Decision

- `MODEL_ROUTE` picks the route: `vercel-gateway` (the default), `cloudflare` (each vendor's own API behind a Cloudflare AI Gateway) or `direct`.
- Gateway ids map explicitly to vendor ids, in `VENDOR_MODELS`.
- The implementer and the reviewer stay on different vendors.
- Model choice per seat moves to team-spec tiers (ADR-0003).

## Consequences

- The buyer pays the vendors directly; we never hold a shared key.
- Vendor independence is a convention until the generator enforces it; the spec records it as a deviation today.
- Model releases get a scheduled review: a new model runs the eval suite before it becomes a tier default.
