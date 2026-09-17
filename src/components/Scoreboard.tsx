import type { ScoreboardRow } from "@/lib/api-types";
import { rankOf } from "@/lib/scoreboard-summary";

export function Scoreboard({
  rows,
  highlightName,
  dark = false,
}: {
  rows: ScoreboardRow[];
  highlightName?: string;
  dark?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className={dark ? "text-sm text-stage-muted" : "text-sm text-muted"}>
        No teams on the board yet.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {rows.map((row) => {
        const mine = highlightName != null && row.name === highlightName;
        return (
          <li
            key={row.teamId}
            className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${
              dark
                ? mine
                  ? "bg-gold/15 text-stage-fg ring-1 ring-gold/50"
                  : "bg-white/5 text-stage-fg"
                : mine
                  ? "bg-amber/10 ring-1 ring-amber/30"
                  : "bg-white/70"
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={`w-6 shrink-0 text-sm font-semibold tabular-nums ${
                  dark ? "text-gold" : "text-amber"
                }`}
              >
                {rankOf(rows, row.teamId)}
              </span>
              <span className="truncate font-medium">{row.name}</span>
            </span>
            <span className="shrink-0 tabular-nums font-semibold">{row.score}</span>
          </li>
        );
      })}
    </ol>
  );
}
