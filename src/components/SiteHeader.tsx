import Link from "next/link";
import { AccountNav } from "@/components/AccountNav";
import { Wordmark } from "@/components/Wordmark";

/**
 * The site's primary navigation, in one place because it was in two.
 *
 * The homepage folds this row into its hero rather than rendering
 * <SiteHeader>, and kept its own copy of the array. The copies drifted twice:
 * first on the labels (the homepage said Generate / Manage / Play while every
 * other page said Create / Packs / Join), and then on 2026-09-18, when
 * Pricing was added here and the homepage — the page Paddle's reviewer lands
 * on first — silently kept three links. Importing beats remembering.
 */
export const NAV_LINKS = [
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
 * The account corner sits AFTER the four links, in the same nav row, rather
 * than becoming a fifth NAV_LINKS entry: it is not a page, its width depends
 * on the signed-in address, and the homepage renders the same pair with its
 * own spacing. Keeping it out of the array is what lets both rows lay it out
 * differently without the array meaning two things.
 */

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
      {/* Below md (768px) the row stacks into three centred lines: sign,
          links, account. Before, a wrapped row kept its one-row alignment
          piecemeal — sign on the left, links a little in from it, and the
          account line wherever the right edge of its fixed-width slot
          happened to fall (Paul, 21 Sep: pick A of three layouts). At md and
          up it is the one row it always was: sign left, nav right.

          Why md and not the width the row actually needs: in Chromium the
          row fits from 732px here (728px on the homepage; measured signed in
          and out, 4px steps). Another browser can set the same text a few
          pixels wider, and a breakpoint right at 732 would then leave a band
          where the row wraps on its own but is not centred — the old look.
          md leaves 36px of slack. The cost is that between ~732 and 767px the
          header stacks although one row would just fit: taller there, never
          lopsided. e2e/header-layout.spec.ts pins both sides of md. */}
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-3.5 max-md:justify-center">
        <Wordmark href="/" className="text-[1.35rem]" />
        {/* flex-wrap here too: with an email in the row, five items cannot
            share one line on a 320px phone, so the account corner drops
            under the links rather than widening the page. */}
        {/* Every control in this row is a 48px target (min-h-12/min-w-12):
            Material's minimum, which also clears iOS's 44pt. They used to be
            36px tall — fine for a pointer, small for a thumb, and these are
            what a host taps most on a phone.

            -my-1.5 lets the extra 12px reach into the header's own padding
            instead of pushing the header open, so on one row the header is
            exactly as tall as before and every word sits where it did; only
            the part you can press grew. gap-y-1.5 above matches it, so on a
            phone, where the nav wraps under the sign, the targets meet the
            sign's line without overlapping it. So the header grows only where
            the row wraps: 2px for that gap, plus 12px more on a phone, where
            the account corner is a second line of targets, 48px instead of 36.

            AccountNav holds Sign in / Sign out to the same floor, and its
            pending placeholder to the same 48px, so the row does not move
            when the session lands. */}
        <nav className="-my-1.5 flex flex-wrap items-center gap-x-1 gap-y-0 max-md:w-full max-md:justify-center">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-3 text-sm font-semibold text-stage-muted transition-colors hover:text-gold"
            >
              {link.label}
            </Link>
          ))}
          <AccountNav />
        </nav>
      </div>
    </header>
  );
}
