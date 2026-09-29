"use client";

import { useState } from "react";
import { ConfirmPanel } from "@/components/ConfirmPanel";
import { CopyButton } from "@/components/CopyButton";
import { JoinQr } from "@/components/JoinQr";
import { QuestionText } from "@/components/QuestionText";
import { RoundCountdown } from "@/components/RoundCountdown";
import { Scoreboard } from "@/components/Scoreboard";
import { TrophyIcon } from "@/components/icons";
import type { RoundHostState, RoundQuestionView } from "@/lib/api-types";
import { buildHostUrl } from "@/lib/join-url";
import { countOf } from "@/lib/plural";
import { questionMediaUrl } from "@/lib/question-media-url";
import { questionLabel } from "@/lib/question-number";
import { topScorers, winningNames } from "@/lib/scoreboard-summary";

/**
 * The host desk for a round-mode game (RM7).
 *
 * Portrait phone first: the one thing to do next is always a single button
 * fixed at the bottom of the screen, where a thumb is; the state of the game is
 * above it; the grids scroll; everything else (the TV, End game) lives in the
 * menu. Every tap target is at least 44 px, and nothing needs hover.
 *
 * The desk is private in round mode — the room watches the TV (/tv/CODE) — so
 * from the close of a round it shows the host every answer and the key. While
 * the round is open it still shows who has answered and not what: a desk that
 * ends up mirrored on the pub's screen must not publish the answers.
 */

const COUNTDOWN_CHOICES = [
  { seconds: 60, label: "1 min" },
  { seconds: 120, label: "2 min" },
  { seconds: 180, label: "3 min" },
  { seconds: 300, label: "5 min" },
];

type Confirming = "close" | "finish" | "end" | null;

export function RoundHostDesk({
  code,
  hostToken,
  state,
  error,
  onError,
  refresh,
}: {
  code: string;
  hostToken: string;
  state: RoundHostState;
  error: string | null;
  onError: (message: string | null) => void;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [choosingCountdown, setChoosingCountdown] = useState(false);

  const total = state.totalQuestionsInRound;
  const isLastRound = state.roundNumber >= state.totalRounds;
  const inPlay = state.status === "ROUND_OPEN" || state.status === "ROUND_MARKING" || state.status === "ROUND_REVEAL";

  async function send(path: string, method: string, body: object) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, hostToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't work — try again");
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "That didn't work — try again");
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  /**
   * Every press carries the position this screen was showing (`at`), so a
   * double tap, or a retry after the venue wifi dropped the first response,
   * moves the game once (see advanceRound in the advance route).
   */
  function advance(action: string, extra: object = {}) {
    return send(`/api/sessions/${code}/advance`, "POST", {
      action,
      at: { roundIndex: state.roundNumber - 1, askedCount: state.askedCount, revealedCount: state.revealedCount },
      ...extra,
    });
  }

  const current = state.questions[state.askedCount - 1] ?? null;

  let primary: { label: string; onPress: () => void; disabled?: boolean } | null = null;
  if (state.status === "LOBBY") {
    primary = {
      label: state.teams.length === 0 ? "Waiting for the first team" : "Start quiz",
      onPress: () => void advance("start"),
      disabled: state.teams.length === 0,
    };
  } else if (state.status === "ROUND_OPEN") {
    primary =
      state.askedCount < total
        ? { label: "Ask next question", onPress: () => void advance("ask_next") }
        : { label: "Close round…", onPress: () => setConfirming("close") };
  } else if (state.status === "ROUND_MARKING" || state.status === "ROUND_REVEAL") {
    if (state.revealedCount < total) {
      primary = { label: "Reveal next answer", onPress: () => void advance("reveal_next") };
    } else if (isLastRound) {
      primary = { label: "Finish quiz…", onPress: () => setConfirming("finish") };
    } else {
      primary = { label: "Next round", onPress: () => void advance("next_round") };
    }
  }

  return (
    <div className="stage-surface has-action-bar min-h-dvh bg-stage pb-44 text-stage-fg">
      <header className="border-b border-white/10 px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-gold">Host desk</p>
            <h1 className="truncate font-serif text-lg font-semibold" dir="auto">
              {state.packTitle}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-xl bg-gold px-3 py-1.5 text-stage">
              <p className="text-[10px] font-semibold uppercase tracking-wider">Team code</p>
              <p className="font-mono text-xl font-bold tracking-[0.18em]">{state.code}</p>
            </div>
            <button
              type="button"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="h-12 min-h-12 rounded-xl border border-white/20 px-4 text-sm font-semibold"
            >
              Menu
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-8">
        {error ? <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        {menuOpen ? (
          <DeskMenu
            code={code}
            state={state}
            busy={busy}
            confirmingEnd={confirming === "end"}
            onEnd={() => setConfirming("end")}
            onKeepPlaying={() => setConfirming(null)}
            onEndConfirmed={() => {
              setConfirming(null);
              void advance("end");
            }}
            onTvMode={(showAll) => void advance("set_tv_mode", { showAll })}
          />
        ) : null}

        {state.status === "LOBBY" ? (
          <Lobby code={code} state={state} busy={busy} onAddPaper={(name) => send(`/api/sessions/${code}/teams`, "POST", { name })} />
        ) : null}

        {state.status === "ROUND_OPEN" ? (
          <section className="rounded-2xl bg-white/5 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gold">{questionLabel(state.roundNumber, state.askedCount, total)}</p>
              <RoundCountdown countdown={state.countdown} serverNow={state.serverNow} className="text-lg" />
            </div>
            {state.round ? (
              <p className="mt-1 text-sm text-stage-muted" dir="auto">
                {state.round.title}
              </p>
            ) : null}
            {current ? <HostQuestion question={current} code={code} hostToken={hostToken} /> : null}
            {current ? (
              <p className="mt-4 text-sm text-stage-muted">
                {answeredCount(state, current.index)} of {phoneTeams(state)} phone teams have answered this one.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {state.countdown ? (
                <button type="button" onClick={() => void advance("clear_countdown")} className={secondary}>
                  Stop countdown
                </button>
              ) : (
                <button
                  type="button"
                  aria-expanded={choosingCountdown}
                  onClick={() => setChoosingCountdown((open) => !open)}
                  className={secondary}
                >
                  Start countdown
                </button>
              )}
              {choosingCountdown && !state.countdown
                ? COUNTDOWN_CHOICES.map((choice) => (
                    <button
                      key={choice.seconds}
                      type="button"
                      onClick={() => {
                        setChoosingCountdown(false);
                        void advance("start_countdown", { seconds: choice.seconds });
                      }}
                      className={secondary}
                    >
                      {choice.label}
                    </button>
                  ))
                : null}
            </div>

            {state.askedCount > 1 ? (
              <details className="mt-5">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-stage-muted">
                  Asked so far ({state.askedCount})
                </summary>
                <ol className="mt-2 space-y-2">
                  {state.questions.map((q) => (
                    <li key={q.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                      <span className="text-gold">Q{q.index + 1}</span>{" "}
                      <QuestionText as="span" text={q.text} />
                      <span className="block text-xs text-stage-muted">
                        {answeredCount(state, q.index)} of {phoneTeams(state)} answered
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </section>
        ) : null}

        {state.status === "ROUND_MARKING" || state.status === "ROUND_REVEAL" ? (
          <Marking
            state={state}
            busy={busy}
            onOverride={(answerId, isCorrect, points) =>
              send(`/api/sessions/${code}/answers/${answerId}`, "PATCH", { isCorrect, points })
            }
            onSetTotal={(teamId, points) =>
              send(`/api/sessions/${code}/round-scores`, "PUT", { teamId, roundIndex: state.roundNumber - 1, points })
            }
            onClearTotal={(teamId) =>
              send(`/api/sessions/${code}/round-scores`, "DELETE", { teamId, roundIndex: state.roundNumber - 1 })
            }
          />
        ) : null}

        {inPlay ? (
          <section className="rounded-2xl bg-white/5 p-4 sm:p-6">
            <div className="flex flex-wrap gap-2">
              {(state.status === "ROUND_MARKING" || state.status === "ROUND_REVEAL") && state.revealedCount < total ? (
                <button type="button" disabled={busy} onClick={() => void advance("reveal_all")} className={secondary}>
                  Reveal all
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void advance(state.scoreboardShown ? "hide_scoreboard" : "show_scoreboard")}
                className={secondary}
              >
                {state.scoreboardShown ? "Hide scoreboard" : "Show scoreboard"}
              </button>
            </div>
            <h3 className="mt-5 font-semibold">Scoreboard</h3>
            <p className="mt-1 text-sm text-stage-muted">
              {state.scoreboardShown ? "Showing on the TV and the phones." : "Only you can see this until you show it."}{" "}
              Rounds count once every answer in them is revealed.
            </p>
            <div className="mt-3">
              <Scoreboard rows={state.scoreboard} dark />
            </div>
          </section>
        ) : null}

        {state.status === "ENDED" ? <Ended state={state} /> : null}
      </main>

      {primary || confirming === "close" || confirming === "finish" ? (
        <div
          data-testid="primary-action"
          className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-stage/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
        >
          <div className="mx-auto max-w-5xl">
            {confirming === "close" ? (
              <ConfirmPanel
                title={`Close round ${state.roundNumber}?`}
                body="Teams can't change their answers after this. You check the marks next."
                confirmLabel="Yes, close the round"
                keepLabel="Keep the round open"
                busy={busy}
                onKeep={() => setConfirming(null)}
                onConfirm={() => {
                  setConfirming(null);
                  void advance("close_round");
                }}
              />
            ) : confirming === "finish" ? (
              <ConfirmPanel
                title="Finish the quiz?"
                body="The final scoreboard goes up on every screen. This cannot be undone."
                confirmLabel="Yes, finish the quiz"
                keepLabel="Not yet"
                busy={busy}
                onKeep={() => setConfirming(null)}
                onConfirm={() => {
                  setConfirming(null);
                  void advance("finish");
                }}
              />
            ) : primary ? (
              <button
                type="button"
                onClick={primary.onPress}
                disabled={busy || primary.disabled}
                className="h-14 min-h-14 w-full rounded-xl bg-gold text-base font-semibold text-stage disabled:opacity-40"
              >
                {primary.label}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const secondary =
  "h-11 min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-stage-fg disabled:opacity-40";

function phoneTeams(state: RoundHostState) {
  return state.teams.filter((t) => !t.isPaper).length;
}

function answeredCount(state: RoundHostState, questionIndex: number) {
  return state.teams.filter((t) => !t.isPaper && t.answered.includes(questionIndex)).length;
}

function HostQuestion({ question, code, hostToken }: { question: RoundQuestionView; code: string; hostToken: string }) {
  return (
    <>
      <QuestionText text={question.text} as="h2" className="mt-3 font-serif text-2xl font-semibold leading-snug sm:text-3xl" />
      {question.hasMedia ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own API route, not a next/image-optimizable asset
        <img
          src={questionMediaUrl(question.id, { code, hostToken })}
          alt=""
          className="mt-4 max-h-72 w-full rounded-xl border border-white/10 bg-white object-contain"
        />
      ) : null}
      {question.type === "MULTIPLE_CHOICE" && question.options.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {question.options.map((option, i) => (
            <li key={option} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
              {String.fromCharCode(65 + i)}) <span dir="auto">{option}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-sm text-stage-muted">{countOf(question.points, "point")}</p>
    </>
  );
}

function Lobby({
  code,
  state,
  busy,
  onAddPaper,
}: {
  code: string;
  state: RoundHostState;
  busy: boolean;
  onAddPaper: (name: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  return (
    <section className="rounded-2xl bg-white/5 p-4 sm:p-6">
      <h2 className="font-serif text-2xl font-semibold">Waiting for teams</h2>
      <p className="mt-2 text-stage-muted">
        Teams join on their phones with the code. Tables playing on paper: add them by name.
      </p>
      <JoinQr code={code} />

      <div className="mt-6 flex items-center justify-between gap-3">
        <h3 className="font-semibold">Teams ({state.teams.length})</h3>
        <button type="button" aria-expanded={adding} onClick={() => setAdding((a) => !a)} className={secondary}>
          Add paper team
        </button>
      </div>
      {adding ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            void onAddPaper(trimmed).then(() => {
              setName("");
              setAdding(false);
            });
          }}
        >
          <input
            aria-label="Paper team name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            dir="auto"
            className="h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-white px-3 text-base text-stage outline-none focus:ring-2 focus:ring-gold"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="h-12 min-h-12 rounded-xl bg-gold px-5 text-sm font-semibold text-stage disabled:opacity-40"
          >
            Add
          </button>
        </form>
      ) : null}
      <TeamList state={state} />
    </section>
  );
}

function TeamList({ state }: { state: RoundHostState }) {
  if (state.teams.length === 0) return <p className="mt-3 text-sm text-stage-muted">No teams yet.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {state.teams.map((team) => (
        <li key={team.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2.5">
          <span dir="auto" className="min-w-0 truncate">
            {team.name}
          </span>
          {team.isPaper ? (
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-stage-muted">Paper</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Marking({
  state,
  busy,
  onOverride,
  onSetTotal,
  onClearTotal,
}: {
  state: RoundHostState;
  busy: boolean;
  onOverride: (answerId: string, isCorrect: boolean, points: number) => Promise<void>;
  onSetTotal: (teamId: string, points: number) => Promise<void>;
  onClearTotal: (teamId: string) => Promise<void>;
}) {
  const marks = state.marks ?? [];
  // A phone team that sat the round out (joined late) has nothing to mark.
  const marked = marks.filter((row) => !row.sitsOut);
  const n = state.roundNumber;
  return (
    <section className="space-y-5">
      <div className="rounded-2xl bg-white/5 p-4 sm:p-6">
        <h2 className="font-serif text-2xl font-semibold">Round {n}: check the marks</h2>
        <p className="mt-1 text-sm text-stage-muted">
          {state.revealedCount} of {state.totalQuestionsInRound} answers revealed. Marked automatically — tap a
          mark to change it. The room sees nothing here.
        </p>

        <ol className="mt-4 space-y-1 text-sm">
          {state.questions.map((q) => (
            <li key={q.id}>
              <span className="text-gold">Q{q.index + 1}</span> <span dir="auto">{q.answer}</span>
            </li>
          ))}
        </ol>

        <div data-testid="marks-grid" className="mt-4 overflow-x-auto">
          <table className="w-full min-w-max border-separate border-spacing-1 text-sm">
            <thead>
              <tr className="text-left text-stage-muted">
                <th className="px-2 font-semibold">Team</th>
                {state.questions.map((q) => (
                  <th key={q.id} className="px-2 font-semibold">
                    Q{q.index + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {marked.map((row) => (
                <tr key={row.teamId}>
                  <th scope="row" className="max-w-40 truncate px-2 text-left font-medium" dir="auto">
                    {row.name}
                  </th>
                  {row.isPaper ? (
                    <td colSpan={state.questions.length} className="px-2 text-stage-muted">
                      On paper — type the round total below
                    </td>
                  ) : (
                    state.questions.map((q) => {
                      const answer = row.answers.find((a) => a.questionIndex === q.index);
                      if (!answer) {
                        return (
                          <td key={q.id} className="px-2 text-stage-muted">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={q.id} className="px-1">
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`${row.name}, Q${q.index + 1}: ${answer.text} — marked ${answer.isCorrect ? "right" : "wrong"}. Tap to mark ${answer.isCorrect ? "wrong" : "right"}.`}
                            onClick={() => void onOverride(answer.id, !answer.isCorrect, q.points)}
                            className={`flex min-h-11 w-full min-w-24 items-center justify-between gap-2 rounded-lg px-2 text-left ${
                              answer.isCorrect ? "bg-emerald-500/20 text-emerald-100" : "bg-red-500/15 text-red-100"
                            }`}
                          >
                            <span dir="auto" className="truncate">
                              {answer.text}
                            </span>
                            <span aria-hidden className="shrink-0 font-bold">
                              {answer.isCorrect ? "✓" : "✗"}
                            </span>
                          </button>
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-white/5 p-4 sm:p-6">
        <h3 className="font-semibold">Round {n} totals</h3>
        <p className="mt-1 text-sm text-stage-muted">
          Type a total for a paper team, for sheets the tables swapped and marked, or to override a phone team&apos;s.
        </p>
        <ul className="mt-3 space-y-2">
          {marks.map((row) => (
            <RoundTotalRow
              key={row.teamId}
              round={n}
              row={row}
              busy={busy}
              onSave={(points) => onSetTotal(row.teamId, points)}
              onClear={() => onClearTotal(row.teamId)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function RoundTotalRow({
  round,
  row,
  busy,
  onSave,
  onClear,
}: {
  round: number;
  row: NonNullable<RoundHostState["marks"]>[number];
  busy: boolean;
  onSave: (points: number) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [value, setValue] = useState(row.typed === null ? "" : String(row.typed));
  const points = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(points) && points >= 0 && points <= 999;
  return (
    <li className="rounded-lg bg-white/5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span dir="auto" className="min-w-0 flex-1 truncate font-medium">
          {row.name}
        </span>
        <span className="text-sm tabular-nums text-stage-muted">
          {row.typed !== null ? `${row.total} pts` : row.sitsOut ? "No answers this round" : `${row.auto} pts auto`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          aria-label={`Round ${round} total for ${row.name}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 w-24 rounded-xl border border-white/15 bg-white px-3 text-base text-stage outline-none focus:ring-2 focus:ring-gold"
        />
        <button
          type="button"
          aria-label={`Save total for ${row.name}`}
          disabled={busy || !valid}
          onClick={() => void onSave(points)}
          className="h-11 min-h-11 rounded-xl bg-gold px-4 text-sm font-semibold text-stage disabled:opacity-40"
        >
          Save
        </button>
        {row.typed !== null ? (
          <>
            <button
              type="button"
              aria-label={`Clear total for ${row.name}`}
              disabled={busy}
              onClick={() => {
                setValue("");
                void onClear();
              }}
              className={secondary}
            >
              Clear
            </button>
            <span className="text-xs text-gold">Entered by hand</span>
          </>
        ) : null}
      </div>
    </li>
  );
}

function DeskMenu({
  code,
  state,
  busy,
  confirmingEnd,
  onEnd,
  onKeepPlaying,
  onEndConfirmed,
  onTvMode,
}: {
  code: string;
  state: RoundHostState;
  busy: boolean;
  confirmingEnd: boolean;
  onEnd: () => void;
  onKeepPlaying: () => void;
  onEndConfirmed: () => void;
  onTvMode: (showAll: boolean) => void;
}) {
  // Client component: window is defined by the time this renders.
  const tvUrl = `${window.location.origin}/tv/${code}`;
  const hostUrl = buildHostUrl(window.location.origin, code);
  return (
    <section className="space-y-5 rounded-2xl border border-white/15 p-4 sm:p-6">
      <div>
        <h2 className="font-semibold">TV display</h2>
        <p className="mt-1 text-sm text-stage-muted">
          What the room should see, and nothing more: no answers until you reveal them.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.open(tvUrl, "_blank", "noopener")}
            className="h-12 min-h-12 rounded-xl bg-gold px-4 text-sm font-semibold text-stage"
          >
            Open TV display
          </button>
          <code className="min-w-0 break-all rounded-xl bg-black/30 px-3 py-2 font-mono text-sm">{tvUrl}</code>
          <CopyButton value={tvUrl} className="bg-white/10 text-stage-fg" />
        </div>
        <p className="mt-3 rounded-xl bg-gold/10 px-3 py-2 text-sm text-stage-fg">
          On a laptop, use Extend, not Mirror. Cast a tab, not your screen, or the room will see the answers.
        </p>
        {state.status !== "ENDED" ? (
          <div className="mt-4">
            <p className="text-sm font-semibold">TV shows</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="TV shows">
              <button
                type="button"
                aria-pressed={!state.tvShowsAll}
                onClick={() => onTvMode(false)}
                className={`${secondary} ${!state.tvShowsAll ? "bg-white/15" : ""}`}
              >
                Current question
              </button>
              <button
                type="button"
                aria-pressed={state.tvShowsAll}
                onClick={() => onTvMode(true)}
                className={`${secondary} ${state.tvShowsAll ? "bg-white/15" : ""}`}
              >
                All questions so far
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="font-semibold">Host link</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-xl bg-black/30 px-3 py-2 font-mono text-sm">{hostUrl}</code>
          <CopyButton value={hostUrl} className="bg-white/10 text-stage-fg" />
        </div>
        <p className="mt-2 text-sm text-stage-muted">Keep this link to reopen the host desk on another device.</p>
      </div>

      {state.status !== "ENDED" ? (
        confirmingEnd ? (
          <ConfirmPanel
            title="End this game for everyone?"
            body="Teams stop being able to answer and the scoreboard becomes final. The pack can be edited again afterwards. This cannot be undone."
            confirmLabel="Yes, end the game"
            keepLabel="Keep playing"
            busy={busy}
            onKeep={onKeepPlaying}
            onConfirm={onEndConfirmed}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stage-muted">Finished early? Ending the game unlocks the pack for editing.</p>
            <button type="button" onClick={onEnd} className={`${secondary} ml-auto h-12 min-h-12`}>
              End game
            </button>
          </div>
        )
      ) : null}
    </section>
  );
}

function Ended({ state }: { state: RoundHostState }) {
  const { winners, topScore } = topScorers(state.scoreboard);
  return (
    <section className="rounded-2xl bg-white/5 p-4 sm:p-6">
      <TrophyIcon className="h-9 w-9 text-gold" />
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
        {winners.length > 1 ? "Tonight’s champions" : "Tonight’s champion"}
      </p>
      <h2 className="mt-2 font-serif text-4xl font-semibold leading-tight" dir="auto">
        {winningNames(winners)}
      </h2>
      {winners.length > 0 ? (
        <p className="mt-2 text-stage-muted">
          {countOf(topScore, "point")} · {countOf(state.totalRounds, "round")}
        </p>
      ) : null}
      <div className="mt-6">
        <Scoreboard rows={state.scoreboard} dark />
      </div>
    </section>
  );
}
