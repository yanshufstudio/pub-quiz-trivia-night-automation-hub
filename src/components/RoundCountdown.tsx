"use client";

import { useEffect, useRef, useState } from "react";
import type { CountdownInfo } from "@/lib/api-types";

function format(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The host's countdown, as every screen shows it (RM4, RM7–RM9).
 *
 * The server stamps when it started; each screen reads the time on the
 * server's clock (`serverNow`, sent with every poll, plus however long ago that
 * poll arrived) rather than its own, so a phone whose clock is a minute out
 * still shows the same seconds as the TV. Reaching zero only says "Time's up!"
 * — it closes nothing; the host does that.
 */
export function RoundCountdown({
  countdown,
  serverNow,
  className = "",
}: {
  countdown: CountdownInfo;
  serverNow: string;
  className?: string;
}) {
  const latest = useRef({ countdown, serverNow, receivedAt: 0 });
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    latest.current = { countdown, serverNow, receivedAt: Date.now() };
  }, [countdown, serverNow]);

  useEffect(() => {
    const tick = () => {
      const { countdown: c, serverNow: at, receivedAt } = latest.current;
      if (!c) return setRemaining(null);
      const serverClock = Date.parse(at) + (Date.now() - receivedAt);
      const elapsed = Math.floor((serverClock - Date.parse(c.startedAt)) / 1000);
      setRemaining(Math.max(0, c.durationSeconds - elapsed));
    };
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []);

  if (!countdown || remaining === null) return null;
  const urgent = remaining <= 10;

  return (
    <span
      data-testid="countdown"
      aria-live="polite"
      className={`inline-flex items-center justify-center rounded-full px-4 py-1 font-bold tabular-nums ${
        urgent ? "bg-red-500/90 text-white" : "bg-white/10 text-stage-fg"
      } ${className}`}
    >
      {remaining > 0 ? format(remaining) : "Time's up!"}
    </span>
  );
}
