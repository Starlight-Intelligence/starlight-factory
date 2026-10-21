import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  backoffSeconds,
  captureDelivery,
  classifyOriginStatus,
  decodeDelivery,
  encodeDelivery,
  verifyGitHubSignature,
} from "../src/relay.ts";

const SECRET = "test-webhook-secret";
const sign = (body: Uint8Array, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const githubHeaders = (signature: string) =>
  new Headers({
    "content-type": "application/json",
    cookie: "must-not-be-forwarded",
    "x-github-delivery": "d-1",
    "x-github-event": "issues",
    "x-hub-signature-256": signature,
  });

test("captures only the replayable headers of a signed GitHub webhook", () => {
  const delivery = captureDelivery(githubHeaders("sha256=00"));
  assert.ok(delivery);
  assert.equal(delivery.id, "d-1");
  assert.equal(delivery.headers.cookie, undefined);
  assert.equal(delivery.headers["x-github-event"], "issues");
});

test("refuses a request that is not a signed GitHub webhook", () => {
  assert.equal(
    captureDelivery(new Headers({ "x-github-event": "issues" })),
    null
  );
});

test("accepts the right signature and rejects a wrong one", async () => {
  const body = new TextEncoder().encode('{"action":"labeled"}');
  assert.equal(await verifyGitHubSignature(SECRET, body, sign(body)), true);
  assert.equal(
    await verifyGitHubSignature(SECRET, body, sign(body, "other")),
    false
  );
  assert.equal(await verifyGitHubSignature(SECRET, body, "sha256=zz"), false);
  assert.equal(await verifyGitHubSignature(SECRET, body, undefined), false);
});

test("replays the body byte for byte, so the origin's signature check still passes", async () => {
  const body = Uint8Array.from([0, 255, 10, 13, 226, 130, 172, 123, 125]);
  const delivery = captureDelivery(githubHeaders(sign(body)));
  assert.ok(delivery);
  const queued = JSON.parse(JSON.stringify(encodeDelivery(delivery, body)));
  const replay = decodeDelivery(queued);
  assert.deepEqual(replay.body, body);
  assert.equal(
    await verifyGitHubSignature(
      SECRET,
      replay.body,
      replay.delivery.headers["x-hub-signature-256"]
    ),
    true
  );
});

test("retries outages and throttling, drops refusals, acks success", () => {
  assert.equal(classifyOriginStatus(202), "ack");
  assert.equal(classifyOriginStatus(503), "retry");
  assert.equal(classifyOriginStatus(429), "retry");
  assert.equal(classifyOriginStatus(401), "drop");
  assert.equal(classifyOriginStatus(404), "drop");
});

test("backs off from 30 seconds and caps at 30 minutes", () => {
  assert.equal(backoffSeconds(1), 30);
  assert.equal(backoffSeconds(2), 60);
  assert.equal(backoffSeconds(20), 1800);
});
