import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

const links = [
  { href: "/create", label: "Create" },
  { href: "/packs", label: "Packs" },
  { href: "/play", label: "Join" },
  // Fourth item, added 2026-09-18 with the pricing page. Paddle's reviewer
  // should not have to scroll to the footer to find what the thing costs.
  // The row already wraps to its own line on a narrow phone (see the comment
  // on the flex container below), and e2e/narrow-viewport.spec.ts checks a
  // four-item nav at 320-430px rather than trusting that.
  { href: "/pricing", label: "Pricing" },
];

/**
 * The site's chrome on every desk page: the pub sign over the door. Dark
 * stage green with a brass rule under it, so the cream "sheet" pages below
 * read as paper on a bar rather than a light-mode app. The homepage folds
 * its own copy of this row into the hero (see app/page.tsx) and does not
 * render this component.
 */
export function SiteHeader() {
  return (
    <header className="bg-stage border-b-2 border-brass/70 text-stage-fg">
      {/* flex-wrap: at 320-390px the sign (~200px) and the nav (~220px) cannot
          share one row, so the nav drops to its own line rather than pushing
          the page sideways (the 2026-09-17 sweep caught "Join" cut off on an
          iPhone 15). */}
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5">
        <Wordmark href="/" className="text-[1.35rem]" />
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-semibold text-stage-muted transition-colors hover:text-gold"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
