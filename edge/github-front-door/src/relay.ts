// Pure pieces of the GitHub front door, kept free of Workers-only APIs so `node --test` covers them.

export const GITHUB_PATH = "/eve/v1/github";

/**
 * Cloudflare Queues caps a message at 128 KB. The whole encoded message (base64 body, headers,
 * JSON framing) must fit under this, with room to spare; anything larger is forwarded straight
 * through instead of queued.
 */
export const MAX_QUEUE_MESSAGE_BYTES = 120 * 1024;

/**
 * Largest body the edge will read at all. GitHub's real webhook payloads sit far below this; the
 * cap is there so an unauthenticated sender can't make the Worker buffer arbitrary bytes before
 * the signature is checked.
 */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** Each kept header is bounded too, so headers can't push an envelope past the queue limit. */
const MAX_HEADER_BYTES = 1024;

const SIGNATURE_SHAPE = /^sha256=[0-9a-f]{64}$/i;

// Only what eve's GitHub channel reads. Nothing else from the edge request is replayed.
const FORWARDED_HEADERS = [
  "content-type",
  "user-agent",
  "x-github-delivery",
  "x-github-event",
  "x-github-hook-id",
  "x-github-hook-installation-target-id",
  "x-github-hook-installation-target-type",
  "x-hub-signature-256",
] as const;

export interface Delivery {
  readonly headers: Record<string, string>;
  readonly id: string;
}

export interface QueuedDelivery {
  readonly body: string;
  readonly headers: Record<string, string>;
  readonly id: string;
}

/** Pick the replayable headers; `null` when the request isn't a signed GitHub webhook at all. */
export const captureDelivery = (headers: Headers): Delivery | null => {
  const kept: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = headers.get(name);
    if (value === null) {
      continue;
    }
    if (value.length > MAX_HEADER_BYTES) {
      return null;
    }
    kept[name] = value;
  }
  const id = kept["x-github-delivery"];
  // A missing header tests as the string "undefined", which the shape check refuses.
  const signature = String(kept["x-hub-signature-256"]);
  if (!(id && kept["x-github-event"] && SIGNATURE_SHAPE.test(signature))) {
    return null;
  }
  return { headers: kept, id };
};

const INITIAL_BUFFER_BYTES = 16 * 1024;

/** Best-effort cleanup that can neither throw nor hold the response back. */
const discard = (pending: Promise<unknown> | undefined): void => {
  pending?.catch(() => undefined);
};

/**
 * Reads at most `limit` bytes of a request body, stopping as soon as it would exceed it, so an
 * oversized body is refused without being buffered. `null` means too large.
 */
export const readBodyWithin = async (
  request: Request,
  limit: number
): Promise<Uint8Array | null> => {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) {
    discard(request.body?.cancel());
    return null;
  }
  if (!request.body) {
    return new Uint8Array();
  }
  // One contiguous buffer, grown by doubling, holds the body: memory stays proportional to the
  // bytes received however the sender slices them into chunks.
  let buffer = new Uint8Array(
    Math.min(Math.max(declared, INITIAL_BUFFER_BYTES), limit)
  );
  let length = 0;
  const reader = request.body.getReader();
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: each read depends on the stream position of the last
      const { done, value } = await reader.read();
      if (done) {
        return buffer.subarray(0, length);
      }
      if (value.byteLength === 0) {
        continue;
      }
      if (length + value.byteLength > limit) {
        discard(reader.cancel());
        return null;
      }
      if (length + value.byteLength > buffer.byteLength) {
        const grown = new Uint8Array(
          Math.min(
            Math.max(buffer.byteLength * 2, length + value.byteLength),
            limit
          )
        );
        grown.set(buffer.subarray(0, length));
        buffer = grown;
      }
      buffer.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
};

/** UTF-8 size of the queue message as Cloudflare Queues will serialize it. */
export const encodedSize = (queued: QueuedDelivery): number =>
  new TextEncoder().encode(JSON.stringify(queued)).byteLength;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const fromBase64 = (encoded: string): Uint8Array =>
  Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));

/** Byte-exact round trip: GitHub's signature covers the raw body, so it must replay unchanged. */
export const encodeDelivery = (
  delivery: Delivery,
  body: Uint8Array
): QueuedDelivery => ({ ...delivery, body: toBase64(body) });

export const decodeDelivery = (
  queued: QueuedDelivery
): { body: Uint8Array; delivery: Delivery } => ({
  body: fromBase64(queued.body),
  delivery: { headers: queued.headers, id: queued.id },
});

const SIGNATURE_PREFIX = "sha256=";
const HEX_PAIR = /^[0-9a-f]{2}$/i;

const hexToBytes = (hex: string): Uint8Array | null => {
  if (hex.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const pair = hex.slice(i * 2, i * 2 + 2);
    if (!HEX_PAIR.test(pair)) {
      return null;
    }
    bytes[i] = Number.parseInt(pair, 16);
  }
  return bytes;
};

/**
 * Checks `X-Hub-Signature-256` at the edge so junk never fills the queue. The origin verifies the
 * same signature again; this is a filter, not the trust decision. `crypto.subtle.verify` compares
 * in constant time.
 */
export const verifyGitHubSignature = async (
  secret: string,
  body: Uint8Array,
  header: string | undefined
): Promise<boolean> => {
  if (!header?.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  const signature = hexToBytes(header.slice(SIGNATURE_PREFIX.length));
  if (!signature) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, signature, body);
};

export type OriginOutcome = "ack" | "retry" | "drop";

const RETRYABLE_CLIENT_STATUSES = new Set([408, 425, 429]);

/**
 * 2xx: delivered. 3xx: redirects are never followed (a followed 302 can turn the POST into a GET
 * that returns 200 without the webhook ever reaching eve), so they retry and end in the
 * dead-letter queue if the origin keeps redirecting. 5xx and throttling: the origin is down or
 * busy, try again. Any other 4xx: the origin read the request and refused it (a bad signature, an
 * unknown route), and replaying the same bytes would only be refused again.
 */
export const classifyOriginStatus = (status: number): OriginOutcome => {
  if (status >= 200 && status < 300) {
    return "ack";
  }
  if (
    (status >= 300 && status < 400) ||
    status >= 500 ||
    RETRYABLE_CLIENT_STATUSES.has(status)
  ) {
    return "retry";
  }
  return "drop";
};

const BASE_DELAY_SECONDS = 30;
const MAX_DELAY_SECONDS = 1800;

/** 30 s, 60 s, 2 min ... capped at 30 min, so a long Railway outage still drains within hours. */
export const backoffSeconds = (attempts: number): number =>
  Math.min(
    BASE_DELAY_SECONDS * 2 ** Math.max(0, attempts - 1),
    MAX_DELAY_SECONDS
  );

export const forwardDelivery = (
  origin: string,
  delivery: Delivery,
  body: Uint8Array
): Promise<Response> =>
  fetch(new URL(GITHUB_PATH, origin), {
    body,
    headers: { ...delivery.headers, "x-starlight-front-door": "1" },
    method: "POST",
    redirect: "manual",
  });
