"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The site-wide footer, rendered once from the root layout so every page
 * picks it up without each one having to remember — which is the point:
 * Paddle's website review requires the terms, privacy and refund pages to be
 * reachable from the site, not merely to exist at their URLs.
 *
 * `/pricing` joined the list on 2026-09-18, in the same commit as the page
 * itself — the condition this comment used to set out. Paddle's review wants
 * pricing visible as well as the policies, and a reviewer who has to hunt for
 * it is a reviewer who sends the submission to manual review.
 *
 * `/how-it-works` joined on 2026-09-20. It goes here rather than in
 * NAV_LINKS because the header row is already four links plus the account
 * corner, and a fifth would be bought at the cost of the 320px layout the
 * 2026-09-17 sweep and `e2e/narrow-viewport.spec.ts` exist to protect. The
 * in-context link that matters more is the one in the pack editor, next to
 * the button the guide explains.
 *
 * `/faq` joined on 2026-09-22, for the question that comes before the guide:
 * "does it do X". The one that prompted it was whether the wizard makes
 * pictures (it does not; the host adds their own), which nothing on the site
 * answered.
 */
const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/faq", label: "FAQ" },
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
];

/**
 * Surfaces that carry no site chrome on purpose and must not grow a footer.
 *
 * `/play` and `/host/<code>` are the live-night surfaces: full-bleed dark
 * "stage" clients with no SiteHeader either, where a row of legal links
 * would be a distraction in front of a room of people. `/packs/<id>/print`
 * is a print sheet — anything added there comes out of the printer.
 *
 * Matched on the pathname rather than handled by moving routes into a layout
 * group, because that would mean relocating every existing page for the sake
 * of three exceptions.
 */
const BARE_SURFACES = [/^\/play(?:\/|$)/, /^\/host(?:\/|$)/, /^\/packs\/[^/]+\/print(?:\/|$)/];

export function SiteFooter() {
  const pathname = usePathname();
  if (BARE_SURFACES.some((pattern) => pattern.test(pathname))) return null;

  return (
    <footer className="bg-stage mt-auto border-t-2 border-brass/70 text-stage-fg">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-6">
        <p className="text-sm text-stage-muted">
          <span className="font-serif text-stage-fg">
            Trivia<span className="text-gold">Foundry</span>
          </span>{" "}
          · by Yanshuf Studio
        </p>
        {/* Not "Legal" any more: the row carries the host guide and Pricing
            as well, and a landmark that mislabels its own contents is worse
            than a generic one for anyone navigating by landmark. */}
        {/* Every link in this row is a 48px target (min-h-12/min-w-12), the
            same floor the header's controls were brought up to. They were
            28px tall — text-sm with py-1 — which is fine for a pointer and
            small for a thumb, and these are the links a host reads on a
            phone before paying.

            -my-2.5 lets the extra 20px reach into the footer's own py-6
            instead of pushing it open, so the row is exactly as tall as
            before and every word sits where it did; only the part you can
            press grew. Where the nav wraps under the brand line on a phone,
            the targets reach 10px up into that gap-y-3 and stop 2px short of
            it — no overlap, and the footer keeps its height there too.
            gap-y-0, not gap-y-1: if the links themselves ever wrap, two
            48px lines meet without a seam. */}
        <nav aria-label="Guide, FAQ, pricing and legal" className="-my-2.5 flex flex-wrap items-center gap-x-1 gap-y-0">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-2 text-sm font-semibold text-stage-muted transition-colors hover:text-gold"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
