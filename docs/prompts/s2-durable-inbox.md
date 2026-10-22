# S2: durable inbox

**Outcome.** No labeled issue is ever silently lost, and no event ever starts two runs, including when the service crashes at any point after a webhook arrives.

**Base.** Branch from `origin/main` once PR #1 has merged; until then, from `origin/agent/claude/railway-s1` at `04d890d`. Record the exact SHA you started from in the PR. New branch `agent/<harness>/s2-durable-inbox`.

**Context.** Read ADR-0005 (including its gap table), `agent/lib/deliveries.ts`, `agent/lib/blob.ts`, `agent/lib/s3-store.ts`, `agent/channels/github.ts`, `edge/github-front-door/`, and in `node_modules/eve/docs/`: `concepts/execution-model-and-durability.mdx` and `guides/deployment/self-hosting.md`. The key fact: eve answers the webhook with 200 before the channel hook runs, so anything the hook does is after the acknowledgement.

**The design problem to solve first.** Persisting inside the hook is too late, because a crash before the write loses the event after GitHub got its 200. Pick one, and record why in a new ADR:
1. **Front door as the inbox.** Require the front door on Railway; the Worker acknowledges the queue message only after the factory confirms the inbox write. Then the inbox write needs only to be atomic with dispatch, plus a reconciler.
2. **Pre-ack route.** Mount a route that writes the inbox entry before returning 200, then hands off to eve's handler. Check that eve 0.67 allows this without forking the channel.

**Scope.** May change: `agent/lib/deliveries.ts`, a new `agent/lib/inbox.ts`, `agent/channels/github.ts` (hook bodies only), `edge/github-front-door/src/*`, a new scheduled task for the reconciler, tests, a new ADR, `docs/RAILWAY.md`. Must not touch: station code, trust predicates, approval policies, `agent/lib/models.ts`.

**Required behaviour.**
- Inbox states: `received` → `dispatched` (session id stored) → done; plus `failed` with a reason.
- Reconciler runs every 5 minutes; entries `received` for more than 10 minutes are dispatched once, using the same content key, so a late original and the reconciler can't both start a run.
- An alert (log line at `error`, and a GitHub issue comment if the intake issue is known) when an entry fails 3 times or the DLQ is non-empty.
- Retention: done inbox entries pruned after 90 days. Delivery claims are kept. They may be pruned only if the channel first refuses events whose authenticated original time (a timestamp inside the signed payload, never one the front door adds on receipt, since replaying an old payload would refresh it) is older than the claim retention. Otherwise a pruned claim lets an old signed event run again.

**Done when.**
- A failure-injection test kills the process after the 200 and before session start; the reconciler starts exactly one session.
- A replayed delivery starts nothing.
- A store outage leaves entries `received`, and they run once each when storage returns.
- `pnpm validate` reports 0 errors and 0 warnings; `pnpm test` (or the front door's `pnpm test`) passes.

**Evidence to return.** The test output, the ADR, the head SHA, the cross-provider review verdict on that SHA, and what was not proven live.

**Gates.** No spend: everything runs locally or in Miniflare. Deploying the Worker or the service is a separate, founder-approved step. Commit only after `starlight-ops claim --adopt` listing every staged file; draft PR on `Starlight-Intelligence/starlight-factory`, never upstream.
