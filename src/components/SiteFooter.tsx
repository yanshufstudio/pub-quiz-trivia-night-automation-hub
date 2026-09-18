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
 */
const links = [
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
        {/* Not "Legal" any more: the row carries Pricing as well, and a
            landmark that mislabels its own contents is worse than a generic
            one for anyone navigating by landmark. */}
        <nav aria-label="Pricing and legal" className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2 py-1 text-sm font-semibold text-stage-muted transition-colors hover:text-gold"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
