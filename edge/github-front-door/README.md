# GitHub front door

A Cloudflare Worker that takes the factory's GitHub webhooks, verifies their signature, holds them in a Queue, and replays them byte for byte to the factory until it accepts them. GitHub never redelivers a failed webhook on its own; this makes a restart or an outage of the factory lose nothing.

```bash
wrangler queues create factory-github-deliveries
wrangler queues create factory-github-deliveries-dlq
wrangler secret put GITHUB_WEBHOOK_SECRET   # the same secret the GitHub App uses
# set ORIGIN_URL in wrangler.jsonc to the factory's public origin
wrangler deploy
```

Then set the GitHub App's webhook URL to `https://<worker-domain>/eve/v1/github`.

- The signature's shape is checked before any body is read, bodies over 2 MB are refused with 413 while streaming, and the HMAC is verified before anything is queued.
- 2xx from the factory acks the delivery. 3xx (redirects are never followed), 5xx, 408, 425 and 429 retry with backoff from 30 seconds to 30 minutes, ten times, then land in the dead-letter queue. Any other 4xx is a refusal and is dropped with a log line.
- A delivery whose encoded message would pass 120 KB skips the queue (its limit is 128 KB) and is forwarded directly; a failure there shows in GitHub as a failed delivery you can redeliver.
- Delivery is at least once. The factory claims each event once by a hash of its signed content (`agent/lib/deliveries.ts`), so a retry or a replayed capture doesn't start a second run.
- Tests: `node --test test/relay.test.ts` (Node 24 or newer).
