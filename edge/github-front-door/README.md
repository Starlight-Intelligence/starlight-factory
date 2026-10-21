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

- 2xx from the factory acks the delivery. 5xx, 408, 425 and 429 retry with backoff from 30 seconds to 30 minutes, ten times, then land in the dead-letter queue. Any other 4xx is a refusal and is dropped with a log line.
- Bodies over 90 KB skip the queue (its message limit is 128 KB) and are forwarded directly; a failure there shows in GitHub as a failed delivery you can redeliver.
- Delivery is at least once. A replay after a timeout can reach the factory twice.
- Tests: `node --test test/relay.test.ts` (Node 24 or newer).
