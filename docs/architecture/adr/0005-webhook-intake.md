# ADR-0005: Webhook intake that neither loses nor duplicates work

Status: partial. The GitHub front door and the delivery claims are built on PR #1 (tested, not yet live). The durable inbox is slice S2. Owner: CTO.

## Context

GitHub never redelivers a failed webhook on its own; a person can redeliver it by hand from the App's settings. eve answers the webhook with 200 before a channel hook runs, so a hook can't ask for a retry. A restart can therefore drop a label, and a retry can start a second paid run.

## Decision

- **GitHub front door** (`edge/github-front-door`, optional): a Cloudflare Worker verifies the signature, queues the delivery, and replays it byte for byte. A 2xx from the factory acknowledges it; a redirect, a 5xx, a network error or a 408, 425 or 429 retries it, with backoff from 30 s doubling to 30 min, for up to 10 retries, then the message moves to a dead-letter queue. Any other 4xx is treated as a permanent refusal: logged and dropped.
- **Claims** (`agent/lib/deliveries.ts`): each dispatched event is claimed once, by a hash of its signed content, with a conditional write. A copy is acknowledged without starting a session. When the store can't answer, the claim fails closed: the event is skipped, not run twice.
- **Durable inbox** (S2): record the event, with a recoverable state, **before** the webhook is acknowledged, so a crash anywhere after receipt is recovered instead of skipped.

## What the front door does not cover

| Case | What happens today | Recovery |
| --- | --- | --- |
| Body larger than 2 MB | Rejected at the edge with 413; GitHub records a failed delivery | Redeliver by hand after raising the cap |
| Factory answers with a non-retryable 4xx (for example 401 after a secret rotation) | Logged as a warning and dropped | Fix the cause, then redeliver from the App's delivery log |
| Delivery larger than 120 KB once encoded | Passed straight through, unqueued; GitHub sees 502 if the factory fails | Redeliver by hand from the App's delivery log |
| 10 retries exhausted | Moved to `factory-github-deliveries-dlq`; nothing alerts yet | Inspect the DLQ, then redeliver from GitHub. An alert on DLQ depth is part of S2 |
| DLQ messages never read | Expire after the queue retention period: 24 hours on Workers Free, 4 days by default on Workers Paid (configurable to 14) | Same as above, within the window |
| Linear webhooks | Not routed through the front door: eve rejects stale Linear timestamps, so a delayed replay would be refused | Re-trigger the Linear session |
| Store outage at claim time | Fails closed: no run, no duplicate | Re-label the issue |
| Crash between claim and session start | Skipped | Re-label the issue (fixed by S2) |

## Consequences

Until S2 lands, the cases above can skip a run. Every one of them has a manual recovery a person can do in under a minute. `factory-launch` names the claim-store and redelivery cases today; the DLQ and oversize cases join its failure table in S2. No case can start a duplicate run.
