"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";

/**
 * The account corner of the site chrome: "Sign in" when signed out, the
 * account's email and a "Sign out" control when signed in.
 *
 * Client-side on purpose. Reading the session on the server would make every
 * page that carries the header dynamic — including /, /pricing and the three
 * policy pages, which are prerendered today and which Paddle's reviewer and
 * search crawlers are the main audience for. None of those pages needs to
 * know who you are in order to render.
 *
 * The cost is a moment before the widget knows, and `SLOT` is what stops that
 * moment moving the page.
 */

/**
 * The footprint every state occupies, so neither the nav's wrap nor the
 * header's can change when the session resolves.
 *
 * This is not styling; it is the fix for a measured layout shift, and it took
 * two goes because there are two wraps to keep still.
 *
 * The three states are wildly different widths — an empty placeholder, 68px
 * of "Sign in", 217px of truncated email plus "Sign out" — and the
 * placeholder used to reserve a height and nothing else. On a 390px phone the
 * nav row has 107px left after the four links: the narrow states fitted on it,
 * the signed-in one did not, so the moment a host's email arrived the corner
 * wrapped to a new line and shoved the page down 36px. Measured across
 * 320-560px it hit 380-500px — iPhone 13/14, Pixel 5/7, iPhone 14 Pro Max.
 *
 * Giving it its own line below `sm` fixed that band and broke 520-639px
 * instead, because an EMPTY placeholder also has zero intrinsic width: the
 * header's own flex row sized the nav at 243px while pending and 459px once
 * resolved, wrapped differently, and shifted 28px — now for signed-out
 * visitors too, who never had a shift at all.
 *
 * So the slot is a fixed width in every state at every viewport. Nothing
 * about it depends on what the session turns out to be, which is the only
 * property that makes both wraps stable. `justify-end` keeps the content
 * against the right edge so the reserved space reads as alignment rather
 * than as a gap.
 *
 * The email cap is deliberately the same at every width for the same reason:
 * a wider cap above `sm` would make the resolved width exceed the slot there
 * and reintroduce exactly this bug at some larger viewport.
 */
const SLOT = "flex min-w-[13.5rem] items-center justify-end gap-1";

export function AccountNav({ className = "" }: { className?: string }) {
  const { data, isPending } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (isPending) {
    // Height as well as line, so the row is the right size before the answer
    // arrives rather than only the right shape.
    return <span aria-hidden className={`h-9 ${SLOT} ${className}`} />;
  }

  if (!data?.user) {
    return (
      <span className={`${SLOT} ${className}`}>
        <Link
          href="/sign-in"
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-gold transition-colors hover:text-stage-fg"
        >
          Sign in
        </Link>
      </span>
    );
  }

  async function onSignOut() {
    setBusy(true);
    await signOut();
    // Back to the homepage, and `refresh()` so any server-rendered host page
    // in the history re-runs its guard instead of being served from the
    // router cache as though the session were still good.
    router.push("/");
    router.refresh();
  }

  return (
    <span className={`${SLOT} ${className}`}>
      {/* max-w + truncate: a long address must not push the nav wide enough
          to scroll the page sideways at 320px (e2e/narrow-viewport.spec.ts),
          and the cap stays put across breakpoints so the resolved width never
          outgrows SLOT — see the note on it. The full address is in `title`. */}
      <span
        className="max-w-[9rem] truncate text-sm text-stage-muted"
        title={data.user.email}
      >
        {data.user.email}
      </span>
      <button
        type="button"
        onClick={onSignOut}
        disabled={busy}
        className="rounded-md px-2 py-2 text-sm font-semibold text-gold transition-colors hover:text-stage-fg disabled:opacity-60"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </span>
  );
}
