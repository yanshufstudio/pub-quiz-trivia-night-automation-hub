"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The site-wide footer, rendered once from the root layout so every page
 * picks it up without each one having to remember — which is the point:
 * Paddle's website review requires the terms, privacy and refund pages to be
 * reachable from the site, not merely to exist at their URLs.
 *
 * `/pricing` is listed here but does not exist on `master` — it arrives with
 * the Paddle Pro branch — so until that merges this link 404s. That is known
 * and intended: the ordering is the owner's call, and the link is here so it
 * works the moment the page lands rather than needing to be remembered then.
 * If the Paddle branch has still not merged when the production domain goes
 * to Paddle for Website approval, either merge it first or drop this entry
 * for the review, because a reviewer following a dead link is the one thing
 * these pages exist to avoid.
 */
const links = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
  { href: "/pricing", label: "Pricing" },
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
    <footer className="mt-auto border-t border-line bg-background/90">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-6">
        <p className="text-sm text-muted">Yanshuf Studio</p>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2 py-1 text-sm font-medium text-muted transition-colors hover:text-amber"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
