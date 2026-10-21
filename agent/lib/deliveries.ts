import { createHash } from "node:crypto";
import { DELIVERY_CLAIMS_PREFIX, readDocument, writeDocument } from "./blob.js";

/**
 * Write-once claims that keep one webhook event from starting two runs.
 *
 * @remarks
 * A replay reaches the channel more than once whenever a delivery is retried: the GitHub front
 * door retries until the factory answers, GitHub's "Redeliver" button resends, and a captured
 * signed payload can be resent by anyone, because GitHub's signature covers the body but not a
 * timestamp or the delivery id. So the claim is keyed on the event's own signed content (the
 * issue, comment or suite object, which carries an `updated_at` that changes on every real
 * action), never on the unsigned `X-GitHub-Delivery` header. The first dispatch writes the claim
 * with a conditional put; every later copy finds it and is acknowledged without a session.
 *
 * If the store itself fails, the event dispatches anyway and the failure is logged: a missed
 * label costs a run that never happens, a duplicate costs one extra run, and the second is easier
 * to notice and undo.
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
 * Claims `event` for dispatch. `true` the first time this exact event is seen, `false` for every
 * copy after it.
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
    const existing = await readDocument(key).catch(() => ({
      found: false as const,
    }));
    if (existing.found) {
      return false;
    }
    console.warn(
      `Could not record a delivery claim (${kind}); dispatching without replay protection: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return true;
  }
};
