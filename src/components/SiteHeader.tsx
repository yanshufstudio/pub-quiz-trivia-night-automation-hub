import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

const links = [
  { href: "/create", label: "Create" },
  { href: "/packs", label: "Packs" },
  { href: "/play", label: "Join" },
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
      {/* flex-wrap, not a smaller wordmark: at 320px the usable width is
          280px while the sign is ~201px and the nav ~217px, so no single
          row fits and shrinking the sign only makes it illegible without
          closing the gap. The nav drops to its own line instead and the
          sign keeps its full size. Guarded by e2e/narrow-viewport.spec.ts. */}
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
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
