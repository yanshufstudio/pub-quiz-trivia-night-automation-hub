/**
 * The handful of strings that describe the business rather than the product.
 *
 * These were literals scattered across the tree until 2026-09-17, when the
 * contact address on /terms, /privacy and /refunds was found to have drifted
 * from the one the GitHub organisation publishes: five copies of
 * `privlin@gmail.com`, none of which looked wrong on its own. The address a
 * buyer writes to about a refund is not a detail that should live in five
 * places, so it lives here, and `site.test.ts` next to this file fails the
 * build if a page grows its own `mailto:` again.
 *
 * Deliberately not in here: the legal entity name ("Yanshuf Studio, Israel"),
 * which appears in the prose of /terms, /privacy and /refunds. Paddle have
 * not yet confirmed which legal name they hold, so centralising it now would
 * only freeze a string that is still in question.
 */

/** Canonical origin, no trailing slash. Feeds `metadataBase`, the sitemap and any absolute URL. */
export const SITE_URL = "https://triviafoundry.com";

/**
 * The published contact address for support, legal, privacy and refund
 * enquiries, and the Reply-To on the sign-in email.
 *
 * Must stay a mailbox that is actually read: /refunds points a paying
 * customer here as the alternative to Paddle's own buyer support, so a
 * bounce is a compliance problem rather than a cosmetic one. It is also
 * where a host lands who simply replies to their sign-in code, which is the
 * obvious thing to do and used to go nowhere — triviafoundry.com sends mail
 * but receives none (see `src/lib/sign-in-email.ts`).
 *
 * It is a shared studio address rather than a personal one on purpose: the
 * published contact point for a paying customer should outlive any one
 * person's mailbox.
 */
export const CONTACT_EMAIL = "info@yanshufstudio.com";

/**
 * The date printed at the top of /terms, /privacy and /refunds, and the
 * `lastModified` the sitemap publishes for them. Bump it when the wording of
 * any of the three changes — and only then, so the sitemap keeps telling the
 * truth. It lives here rather than in `LegalPage.tsx` so `sitemap.ts` can
 * read it without importing a React component for a string.
 */
export const LEGAL_LAST_UPDATED = "2026-09-21";
