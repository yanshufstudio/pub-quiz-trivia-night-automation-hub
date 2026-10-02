import type { RoundStatus, SessionStatus } from "@/lib/api-types";

const LABELS: Record<SessionStatus | RoundStatus, string> = {
  LOBBY: "Lobby",
  QUESTION_ACTIVE: "Question live",
  REVEAL: "Reveal",
  ROUND_OPEN: "Round open",
  ROUND_MARKING: "Answers in",
  ROUND_REVEAL: "Reveal",
  ENDED: "Ended",
};

export function StatusBadge({
  status,
  dark = false,
}: {
  status: SessionStatus | RoundStatus;
  dark?: boolean;
}) {
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
      {LABELS[status]}
    </span>
  );
}
