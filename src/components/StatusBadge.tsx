import type { SessionStatus } from "@/lib/api-types";

const LABELS: Record<SessionStatus, string> = {
  LOBBY: "Lobby",
  QUESTION_ACTIVE: "Question live",
  REVEAL: "Reveal",
  ENDED: "Ended",
};

export function StatusBadge({
  status,
  dark = false,
}: {
  status: SessionStatus;
  dark?: boolean;
}) {
  const tone =
    status === "QUESTION_ACTIVE"
      ? "bg-mint text-stage"
      : status === "REVEAL"
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
