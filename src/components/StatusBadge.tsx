"use client";

import { useT } from "@/i18n/react";
import type { RoundStatus, SessionStatus } from "@/lib/api-types";

export function StatusBadge({
  status,
  dark = false,
}: {
  status: SessionStatus | RoundStatus;
  dark?: boolean;
}) {
  const t = useT();
  const tone =
    status === "QUESTION_ACTIVE" || status === "ROUND_OPEN"
      ? "bg-mint text-stage"
      : status === "REVEAL" || status === "ROUND_REVEAL"
        ? "bg-gold text-stage"
        : status === "ENDED"
          ? dark
            ? "bg-white/15 text-stage-fg"
            : "bg-neutral-200 text-neutral-800"
          : dark
            ? "bg-white/10 text-stage-fg"
            : "bg-neutral-200 text-neutral-800";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>
      {t(`status.${status}`)}
    </span>
  );
}
