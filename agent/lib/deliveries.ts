import { createHash } from "node:crypto";
import { DELIVERY_CLAIMS_PREFIX, readDocument, writeDocument } from "./blob.js";
import { DocumentExistsError } from "./document-errors.js";

/**
 * Write-once claims that keep one webhook event from starting two runs.
 *
 * @remarks
 * A copy of an event reaches the channel whenever a delivery is resent: the GitHub front door
 * retries until the factory answers, GitHub's "Redeliver" button resends, and a captured signed
 * payload can be resent by anyone, because GitHub's signature covers the body but neither a
 * timestamp nor the delivery id. So the claim is keyed on the event's own signed content (the
 * issue, comment or suite object, whose `updated_at` changes on every real action), never on the
 * unsigned `X-GitHub-Delivery` header. The first dispatch writes the claim with a conditional
 * put; every later copy finds it and is acknowledged without a session.
 *
 * Fails closed, like the labeler check in `agent/channels/github.ts`: when the store can't say
 * whether this event was already claimed, the event is acknowledged without a session. eve has
 * already answered GitHub by the time a hook runs, so a failure here can't ask for a retry; the
 * cost is one missed run, recovered by re-applying the label (which changes `updated_at`, and so
 * the key). The same recovery covers the narrow case of a crash between the claim and the session
 * starting. A durable inbox that removes both is part of the S2 durability work.
 */

const claimKey = (kind: string, event: unknown): string => {
  const digest = createHash("sha256")
    .update(kind)
    .update("\0")
    .update(JSON.stringify(event))
    .digest("hex");
  return `${DELIVERY_CLAIMS_PREFIX}${digest}.md`;
};

/**
 * Claims `event` for dispatch. `true` only when this call wrote the claim; `false` for a copy of
 * an event already claimed, and for any case the store can't settle.
 */
export const claimDelivery = async (
  kind: string,
  event: unknown
): Promise<boolean> => {
  const key = claimKey(kind, event);
  try {
    await writeDocument(key, new Date().toISOString(), {
      allowOverwrite: false,
    });
    return true;
  } catch (error) {
    if (error instanceof DocumentExistsError) {
      return false;
    }
    // Not a recognised conflict: a backend that reports conflicts differently still shows the
    // claim on read. Anything else is an outage, and the event is skipped rather than risked.
    const existing = await readDocument(key).catch(() => null);
    if (!existing?.found) {
      console.error(
        `Skipped a ${kind} event: the delivery-claim store failed (${
          error instanceof Error ? error.name : "unknown error"
        }). Re-apply the trigger once storage is back.`
      );
    }
    return false;
  }
};
