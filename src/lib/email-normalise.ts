const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * The mailbox behind an address, for counting allowances and matching
 * entitlements (the free allowance, owner comp, the one-per-mailbox trial).
 * Never for sign-in or account lookup. Why it folds what it folds, and what it
 * deliberately does not, is set out beside `normaliseForFreeAllowance` in
 * src/lib/free-allowance.ts, which re-exports this.
 *
 * Its own module so that src/lib/creator.ts can use it without a cycle
 * (free-allowance.ts imports creator.ts).
 */
export function normaliseMailbox(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return trimmed;

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  // Strip the tag everywhere. "+tag" with an empty local part ("+a@x.com") is
  // left alone rather than reduced to nothing.
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);

  if (GMAIL_DOMAINS.has(domain)) {
    const withoutDots = local.replace(/\./g, "");
    // Only if something survives: "...@gmail.com" must not become "@gmail.com".
    return `${withoutDots || local}@gmail.com`;
  }

  return `${local}@${domain}`;
}
