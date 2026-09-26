export type Plan = "FREE" | "PRO";

/**
 * Paddle keeps billing through `past_due` (dunning), so Pro stays on until
 * Paddle gives up and moves the subscription to `canceled` or `paused`.
 * Unknown statuses fail closed.
 */
export function statusToPlan(status: string): Plan {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return "PRO";
    default:
      return "FREE";
  }
}

/** Retries can arrive out of order; only an event at least as new as the
 * stored one may overwrite. Equal timestamps are allowed because Paddle can
 * emit `subscription.created` and `subscription.activated` in the same
 * second and the later one carries the final status. */
export function isNewerEvent(occurredAt: Date, storedUpdatedAt: Date | null): boolean {
  if (!storedUpdatedAt) return true;
  return occurredAt.getTime() >= storedUpdatedAt.getTime();
}
