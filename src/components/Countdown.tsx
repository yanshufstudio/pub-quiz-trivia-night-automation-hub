"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/react";
import type { TimerInfo } from "@/lib/api-types";

function secondsLeft(timer: NonNullable<TimerInfo>): number {
  const elapsedMs = Date.now() - new Date(timer.startedAt).getTime();
  return Math.max(0, timer.durationSeconds - Math.floor(elapsedMs / 1000));
}

/**
 * A ticking per-question countdown. Purely a display — the server is the
 * source of truth for when a question actually locks (see
 * src/lib/session-timer.ts), so this drifting a second or two out of sync
 * with the next poll has no scoring consequence.
 */
export function Countdown({ timer, dark = false }: { timer: TimerInfo; dark?: boolean }) {
  if (!timer) return null;
  // Keying on startedAt remounts this on every new question, so its internal
  // countdown re-syncs to the server's clock via the lazy useState initializer
  // below instead of a setState call inside the effect body.
  return <Ticking key={timer.startedAt} timer={timer} dark={dark} />;
}

function Ticking({ timer, dark }: { timer: NonNullable<TimerInfo>; dark: boolean }) {
  const t = useT();
  const [remaining, setRemaining] = useState(() => secondsLeft(timer));

  useEffect(() => {
    const id = window.setInterval(() => setRemaining(secondsLeft(timer)), 250);
    return () => window.clearInterval(id);
  }, [timer]);

  const urgent = remaining <= 5;
  const tone = urgent
    ? "bg-red-500/90 text-white"
    : dark
      ? "bg-white/10 text-stage-fg"
      : "bg-neutral-200 text-neutral-800";

  return (
    <span
      className={`inline-flex min-w-14 items-center justify-center rounded-full px-3 py-1 text-sm font-bold tabular-nums ${tone}`}
      aria-live="polite"
    >
      {remaining > 0 ? t("common.secondsLeft", { seconds: remaining }) : t("common.timesUpShort")}
    </span>
  );
}
