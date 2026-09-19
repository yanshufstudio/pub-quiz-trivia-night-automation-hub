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
 * The cost is a moment before the widget knows: `isPending` renders an empty
 * box of roughly the right size rather than "Sign in", so a signed-in host
 * never sees the wrong state — only, briefly, no state.
 */
export function AccountNav({ className = "" }: { className?: string }) {
  const { data, isPending } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (isPending) {
    // Same height as the controls it is standing in for, so the row does not
    // jump when the answer arrives.
    return <span aria-hidden className={`inline-block h-9 w-16 ${className}`} />;
  }

  if (!data?.user) {
    return (
      <Link
        href="/sign-in"
        className={`rounded-md px-3 py-2 text-sm font-semibold text-gold transition-colors hover:text-stage-fg ${className}`}
      >
        Sign in
      </Link>
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
    <span className={`flex items-center gap-1 ${className}`}>
      {/* max-w + truncate: a long address must not push the nav wide enough
          to scroll the page sideways at 320px (e2e/narrow-viewport.spec.ts). */}
      <span
        className="max-w-[9rem] truncate text-sm text-stage-muted sm:max-w-[14rem]"
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
