// A decorative preview of the real live scoreboard (see Scoreboard.tsx),
// used only in the homepage hero to show what "run the night live" actually
// looks like. Each score's second digit flips on a loop (pure CSS, see
// .flip-tile in globals.css) — staggered per row so the board reads as
// continuously live rather than a single synchronized blink.
const ROWS = [
  { rank: 1, team: "The Alan Titchmarshians", tens: "4", ones: "8", delay: "-0.4s" },
  { rank: 2, team: "Quizteama Aguilera", tens: "4", ones: "3", delay: "-2.6s" },
  { rank: 3, team: "Sherlock Ohms", tens: "3", ones: "7", delay: "-4.9s" },
];

export function LiveScoreboardPreview() {
  return (
    <div
      className="mt-12 max-w-md rounded-xl border border-white/10 bg-white/5 px-5 py-4 shadow-[0_30px_70px_rgba(0,0,0,0.45)] sm:mt-14"
      role="img"
      aria-label="Live scoreboard showing three teams and their scores updating in real time"
    >
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-stage-muted">
          Round 3 · Live scoreboard
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] font-semibold tracking-[0.1em] text-mint">
          <span className="h-1.5 w-1.5 rounded-full bg-mint motion-safe:animate-pulse" />
          LIVE
        </span>
      </div>

      <ol className="mt-3">
        {ROWS.map((row) => (
          <li
            key={row.rank}
            className="flex items-center gap-3 border-t border-white/10 py-2 first:border-t-0"
          >
            <span className="w-4 shrink-0 font-mono text-sm text-stage-muted">{row.rank}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.team}</span>
            <span className="flex shrink-0 gap-[3px]">
              <span className="flip-tile" style={{ "--flip-delay": row.delay } as React.CSSProperties}>
                <span className="flipper">
                  <span className="face front">{row.tens}</span>
                  <span className="face back">{row.tens}</span>
                </span>
              </span>
              <span className="flip-tile" style={{ "--flip-delay": `calc(${row.delay} - 0.7s)` } as React.CSSProperties}>
                <span className="flipper">
                  <span className="face front">{row.ones}</span>
                  <span className="face back">{String(Number(row.ones) + 1)}</span>
                </span>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
