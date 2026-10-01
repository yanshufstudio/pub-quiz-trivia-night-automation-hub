"use client";

import { useEffect, useState } from "react";

const storageKey = (packId: string) => `triviafoundry:unchecked-banner-dismissed:${packId}`;

/**
 * ACC2: shown only on a generated pack whose accuracy review did not run or
 * did not finish. Corrections the review made are never listed to the host;
 * this is the one thing they need to know, and only when it is true.
 *
 * Dismissing is remembered per pack in this browser only — a convenience,
 * not state: a private window or cleared storage shows it again, which errs
 * the right way.
 */
export function UncheckedPackBanner({ packId }: { packId: string }) {
  // Hidden until the stored choice is read, so a dismissed banner does not
  // flash on every visit.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let stored = false;
    try {
      stored = window.localStorage.getItem(storageKey(packId)) === "1";
    } catch {
      // Storage unavailable: show it.
    }
    // Storage can only be read after mount (see TeamPortal); a lazy initial
    // state would make the first client render differ from the server's.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(stored);
  }, [packId]);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey(packId), "1");
    } catch {
      // Still hidden for this visit.
    }
  }

  return (
    <div
      role="status"
      className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-foreground"
    >
      <p>This pack wasn&apos;t checked — give it an extra careful read before the night.</p>
      <button
        type="button"
        onClick={dismiss}
        className="-my-1 inline-flex h-8 shrink-0 items-center rounded-md px-2 text-sm font-medium text-muted hover:text-foreground"
      >
        Dismiss
      </button>
    </div>
  );
}
