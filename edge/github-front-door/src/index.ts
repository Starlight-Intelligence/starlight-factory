import {
  backoffSeconds,
  captureDelivery,
  classifyOriginStatus,
  decodeDelivery,
  encodeDelivery,
  encodedSize,
  forwardDelivery,
  GITHUB_PATH,
  MAX_BODY_BYTES,
  MAX_QUEUE_MESSAGE_BYTES,
  type OriginOutcome,
  type QueuedDelivery,
  readBodyWithin,
  verifyGitHubSignature,
} from "./relay.ts";

/**
 * GitHub front door for Starlight Factory.
 *
 * GitHub never redelivers a failed webhook, so a factory that is restarting or down silently
 * loses the `factory` label that was supposed to start a run. This Worker answers GitHub at the
 * edge, holds each signed delivery in a Cloudflare Queue, and replays it byte for byte to the
 * factory until the factory takes it. The factory still verifies every signature itself, and
 * claims each delivery once (`agent/lib/deliveries.ts`), so a replay can't start a second run.
 *
 * Linear is deliberately not routed here: eve rejects Linear webhooks whose timestamp is stale,
 * so a delayed replay would be refused.
 */

interface Env {
  readonly GITHUB_DELIVERIES: {
    readonly send: (body: QueuedDelivery) => Promise<void>;
  };
  readonly GITHUB_WEBHOOK_SECRET: string;
  readonly ORIGIN_URL: string;
}

interface QueueMessage {
  readonly ack: () => void;
  readonly attempts: number;
  readonly body: QueuedDelivery;
  readonly retry: (options?: { delaySeconds?: number }) => void;
}

const settle = async (message: QueueMessage, origin: string) => {
  const outcome = await forwardOutcome(origin, message.body);
  if (outcome === "retry") {
    message.retry({ delaySeconds: backoffSeconds(message.attempts) });
    return;
  }
  if (outcome === "drop") {
    console.warn(
      `Origin refused GitHub delivery ${message.body.id}; not retrying.`
    );
  }
  message.ack();
};

const forwardOutcome = async (
  origin: string,
  queued: QueuedDelivery
): Promise<OriginOutcome> => {
  const { body, delivery } = decodeDelivery(queued);
  try {
    const response = await forwardDelivery(origin, delivery, body);
    return classifyOriginStatus(response.status);
  } catch {
    return "retry";
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== GITHUB_PATH) {
      return new Response("Not found", { status: 404 });
    }
    const delivery = captureDelivery(request.headers);
    if (!delivery) {
      return new Response("Not a signed GitHub webhook", { status: 400 });
    }
    const body = await readBodyWithin(request, MAX_BODY_BYTES);
    if (!body) {
      return new Response("Payload too large", { status: 413 });
    }
    const signed = await verifyGitHubSignature(
      env.GITHUB_WEBHOOK_SECRET,
      body,
      delivery.headers["x-hub-signature-256"]
    );
    if (!signed) {
      return new Response("Signature mismatch", { status: 401 });
    }
    const queued = encodeDelivery(delivery, body);
    if (encodedSize(queued) > MAX_QUEUE_MESSAGE_BYTES) {
      // Too large for a queue message: pass it straight through, and let a failure show as a
      // failed delivery in GitHub, where it can be redelivered by hand.
      const response = await forwardDelivery(env.ORIGIN_URL, delivery, body);
      return new Response(null, {
        status: classifyOriginStatus(response.status) === "ack" ? 202 : 502,
      });
    }
    await env.GITHUB_DELIVERIES.send(queued);
    return new Response(null, { status: 202 });
  },

  async queue(
    batch: { readonly messages: readonly QueueMessage[] },
    env: Env
  ): Promise<void> {
    // Deliveries are independent; each one acks or retries on its own.
    await Promise.all(
      batch.messages.map((message) => settle(message, env.ORIGIN_URL))
    );
  },
};
