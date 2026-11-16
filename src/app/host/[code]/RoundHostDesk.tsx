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
import { questionMediaUrl } from "@/lib/question-media-url";
import { questionLabel } from "@/lib/question-number";
import { noScoresYet, topScorers, winningNames } from "@/lib/scoreboard-summary";
import { errorText, languageMeta, type Language } from "@/i18n";
import { useT } from "@/i18n/react";

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

const COUNTDOWN_MINUTES = [1, 2, 3, 5];

type Confirming = "close" | "finish" | "end" | "reveal_all" | "reveal_last" | "next_round" | null;

export function RoundHostDesk({
  code,
  hostToken,
  state,
  error,
  onError,
  refresh,
  languages,
  onLanguage,
}: {
  code: string;
  hostToken: string;
  state: RoundHostState;
  error: string | null;
  onError: (message: string | null) => void;
  refresh: () => Promise<void>;
  /** The desk languages on offer. The switch only shows when there is a choice. */
  languages: Language[];
  onLanguage: (lang: Language) => void;
}) {
  const t = useT();
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
      if (!res.ok) throw new Error(errorText(t, data, "common.tryAgain"));
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.tryAgain"));
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
  // Paper teams with no total typed for this round score 0 for it. Said
  // before "Reveal all", the last "Reveal next answer", "Next round" and
  // "Finish", which used to go ahead without a word.
  const missingTotals = (state.marks ?? []).filter((row) => row.isPaper && row.typed === null).map((row) => row.name);
  const missingTotalsNote =
    missingTotals.length > 0
      ? t("desk.missingTotals", { round: state.roundNumber, names: t.list(missingTotals) })
      : "";

  if (state.status === "LOBBY") {
    primary = {
      label: state.teams.length === 0 ? t("desk.waitingFirstTeam") : t("desk.startQuiz"),
      onPress: () => void advance("start"),
      disabled: state.teams.length === 0,
    };
  } else if (state.status === "ROUND_OPEN") {
    primary =
      state.askedCount < total
        ? { label: t("desk.askNext"), onPress: () => void advance("ask_next") }
        : { label: t("desk.closeRound"), onPress: () => setConfirming("close") };
  } else if (state.status === "ROUND_MARKING" || state.status === "ROUND_REVEAL") {
    const warn = missingTotals.length > 0;
    if (state.revealedCount < total) {
      const last = state.revealedCount === total - 1;
      primary = {
        label: t("desk.revealNext"),
        onPress: () => (last && warn ? setConfirming("reveal_last") : void advance("reveal_next")),
      };
    } else if (isLastRound) {
      primary = { label: t("desk.finishQuiz"), onPress: () => setConfirming("finish") };
    } else {
      primary = { label: t("desk.nextRound"), onPress: () => (warn ? setConfirming("next_round") : void advance("next_round")) };
    }
  }

  return (
    <div className="stage-surface has-action-bar min-h-dvh bg-stage pb-44 text-stage-fg">
      <header className="border-b border-white/10 px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-gold">{t("desk.hostDesk")}</p>
            <h1 className="truncate font-serif text-lg font-semibold" dir="auto">
              {state.packTitle}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-xl bg-gold px-3 py-1.5 text-stage">
              <p className="text-[10px] font-semibold uppercase tracking-wider">{t("desk.teamCode")}</p>
              <p className="font-mono text-xl font-bold tracking-[0.18em]">{state.code}</p>
            </div>
            <button
              type="button"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="h-12 min-h-12 rounded-xl border border-white/20 px-4 text-sm font-semibold"
            >
              {t("desk.menu")}
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
            onAddPaper={(name) => send(`/api/sessions/${code}/teams`, "POST", { name })}
            languages={languages}
            onLanguage={onLanguage}
          />
        ) : null}

        {state.status === "LOBBY" ? (
          <Lobby code={code} state={state} busy={busy} onAddPaper={(name) => send(`/api/sessions/${code}/teams`, "POST", { name })} />
        ) : null}

        {state.status === "ROUND_OPEN" ? (
          <section className="rounded-2xl bg-white/5 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gold">{questionLabel(t, state.roundNumber, state.askedCount, total)}</p>
              <RoundCountdown countdown={state.countdown} serverNow={state.serverNow} className="text-lg" />
            </div>
            {state.round ? (
              <p className="mt-1 text-sm text-stage-muted" dir="auto">
                {state.round.title}
              </p>
            ) : null}
            {current ? <HostQuestion question={current} code={code} hostToken={hostToken} /> : null}
            {current && phoneTeams(state) > 0 ? (
              <p className="mt-4 text-sm text-stage-muted">
                {t("desk.phoneTeamsAnswered", { answered: answeredCount(state, current.index), count: phoneTeams(state) })}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {state.countdown ? (
                <button type="button" onClick={() => void advance("clear_countdown")} className={secondary}>
                  {t("desk.stopCountdown")}
                </button>
              ) : (
                <button
                  type="button"
                  aria-expanded={choosingCountdown}
                  onClick={() => setChoosingCountdown((open) => !open)}
                  className={secondary}
                >
                  {t("desk.startCountdown")}
                </button>
              )}
              {choosingCountdown && !state.countdown
                ? COUNTDOWN_MINUTES.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => {
                        setChoosingCountdown(false);
                        void advance("start_countdown", { seconds: minutes * 60 });
                      }}
                      className={secondary}
                    >
                      {t("desk.minutes", { count: minutes })}
                    </button>
                  ))
                : null}
            </div>

            {state.askedCount > 1 ? (
              <details className="mt-5">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-stage-muted">
                  {t("desk.askedSoFar", { count: state.askedCount })}
                </summary>
                <ol className="mt-2 space-y-2">
                  {state.questions.map((q) => (
                    <li key={q.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                      <span className="text-gold">{t("common.questionShort", { question: q.index + 1 })}</span>{" "}
                      <QuestionText as="span" text={q.text} />
                      {phoneTeams(state) > 0 ? (
                        <span className="block text-xs text-stage-muted">
                          {t("desk.answeredOf", { answered: answeredCount(state, q.index), count: phoneTeams(state) })}
                        </span>
                      ) : null}
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
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (missingTotals.length > 0 ? setConfirming("reveal_all") : void advance("reveal_all"))}
                  className={secondary}
                >
                  {t("desk.revealAll")}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void advance(state.scoreboardShown ? "hide_scoreboard" : "show_scoreboard")}
                className={secondary}
              >
                {state.scoreboardShown ? t("desk.hideScoreboard") : t("desk.showScoreboard")}
              </button>
            </div>
            <h3 className="mt-5 font-semibold">{t("common.scoreboard")}</h3>
            <p className="mt-1 text-sm text-stage-muted">
              {state.scoreboardShown ? t("desk.scoreboardShowing") : t("desk.scoreboardPrivate")}{" "}
              {t("desk.roundsCount")}
            </p>
            <div className="mt-3">
              {noScoresYet(state) ? (
                <p className="text-stage-muted">{t("common.noScoresYet")}</p>
              ) : (
                <Scoreboard rows={state.scoreboard} dark />
              )}
            </div>
          </section>
        ) : null}

        {state.status === "ENDED" ? <Ended state={state} /> : null}
      </main>

      {primary ||
      confirming === "close" ||
      confirming === "finish" ||
      confirming === "reveal_all" ||
      confirming === "reveal_last" ||
      confirming === "next_round" ? (
        <div
          data-testid="primary-action"
          className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-stage/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
        >
          <div className="mx-auto max-w-5xl">
            {confirming === "close" ? (
              <ConfirmPanel
                title={t("desk.closeTitle", { round: state.roundNumber })}
                body={t("desk.closeBody")}
                confirmLabel={t("desk.closeYes")}
                keepLabel={t("desk.closeKeep")}
                busy={busy}
                onKeep={() => setConfirming(null)}
                onConfirm={() => {
                  setConfirming(null);
                  void advance("close_round");
                }}
              />
            ) : confirming === "finish" ? (
              <ConfirmPanel
                title={t("desk.finishTitle")}
                body={[missingTotalsNote, t("desk.finishBody")].filter(Boolean).join(t("common.sentenceSeparator"))}
                confirmLabel={t("desk.finishYes")}
                keepLabel={t("desk.notYet")}
                busy={busy}
                onKeep={() => setConfirming(null)}
                onConfirm={() => {
                  setConfirming(null);
                  void advance("finish");
                }}
              />
            ) : confirming === "reveal_all" ? (
              <ConfirmPanel
                title={t("desk.revealAllTitle")}
                body={missingTotalsNote}
                confirmLabel={t("desk.revealAllYes")}
                keepLabel={t("desk.keepMarking")}
                busy={busy}
                onKeep={() => setConfirming(null)}
                onConfirm={() => {
                  setConfirming(null);
                  void advance("reveal_all");
                }}
              />
            ) : confirming === "reveal_last" ? (
              <ConfirmPanel
                title={t("desk.revealLastTitle")}
                body={missingTotalsNote}
                confirmLabel={t("desk.revealLastYes")}
                keepLabel={t("desk.keepMarking")}
                busy={busy}
                onKeep={() => setConfirming(null)}
                onConfirm={() => {
                  setConfirming(null);
                  void advance("reveal_next");
                }}
              />
            ) : confirming === "next_round" ? (
              <ConfirmPanel
                title={t("desk.nextRoundTitle", { round: state.roundNumber + 1 })}
                body={missingTotalsNote}
                confirmLabel={t("desk.nextRoundYes")}
                keepLabel={t("desk.notYet")}
                busy={busy}
                onKeep={() => setConfirming(null)}
                onConfirm={() => {
                  setConfirming(null);
                  void advance("next_round");
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
  const t = useT();
  return (
    <>
      <QuestionText text={question.text} as="h2" className="mt-3 font-serif text-2xl font-semibold leading-snug sm:text-3xl" />
      {question.hasMedia ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own API route, not a next/image-optimizable asset
        <img
          src={questionMediaUrl(question.id, { code, hostToken })}
          alt=""
          className="mx-auto mt-4 max-h-72 rounded-xl border border-white/10"
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
      <p className="mt-2 text-sm text-stage-muted">{t("common.points", { count: question.points })}</p>
    </>
  );
}

/** The room's screen, in a new tab: from the lobby next to the QR code, and from the menu. */
function openTv(code: string) {
  window.open(`${window.location.origin}/tv/${code}`, "_blank", "noopener");
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
  const t = useT();
  return (
    <section className="rounded-2xl bg-white/5 p-4 sm:p-6">
      <h2 className="font-serif text-2xl font-semibold">{t("desk.waitingForTeams")}</h2>
      <p className="mt-2 text-stage-muted">{t("desk.lobbyHelp")}</p>
      <JoinQr code={code} />
      <div className="mt-4 flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={() => openTv(code)}
          className="h-12 min-h-12 rounded-xl bg-gold px-4 text-sm font-semibold text-stage"
        >
          {t("desk.openTv")}
        </button>
      </div>

      <div className="mt-6">
        <AddPaperTeam heading={t("desk.teamsCount", { count: state.teams.length })} busy={busy} onAddPaper={onAddPaper} />
      </div>
      <TeamList state={state} />
    </section>
  );
}

/** In the lobby, and in the menu once the quiz has started: a table can arrive late. */
function AddPaperTeam({
  heading,
  busy,
  onAddPaper,
}: {
  heading: string;
  busy: boolean;
  onAddPaper: (name: string) => Promise<void>;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{heading}</h3>
        <button type="button" aria-expanded={adding} onClick={() => setAdding((a) => !a)} className={secondary}>
          {t("desk.addPaperTeam")}
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
            aria-label={t("desk.paperTeamName")}
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
            {t("desk.add")}
          </button>
        </form>
      ) : null}
    </>
  );
}

function TeamList({ state }: { state: RoundHostState }) {
  const t = useT();
  if (state.teams.length === 0) return <p className="mt-3 text-sm text-stage-muted">{t("desk.noTeams")}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {state.teams.map((team) => (
        <li key={team.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2.5">
          <span dir="auto" className="min-w-0 truncate">
            {team.name}
          </span>
          {team.isPaper ? (
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-stage-muted">{t("desk.paper")}</span>
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
  const t = useT();
  const marks = state.marks ?? [];
  // A phone team that sat the round out (joined late) has nothing to mark.
  // Paper teams are named under the grid, not in it, so no row runs off the
  // screen at phone width.
  const marked = marks.filter((row) => !row.sitsOut && !row.isPaper);
  const onPaper = marks.filter((row) => row.isPaper).map((row) => row.name);
  const n = state.roundNumber;
  return (
    <section className="space-y-5">
      <div className="rounded-2xl bg-white/5 p-4 sm:p-6">
        <h2 className="font-serif text-2xl font-semibold">{t("desk.checkMarks", { round: n })}</h2>
        <p className="mt-1 text-sm text-stage-muted">
          {t("desk.revealedOf", { revealed: state.revealedCount, count: state.totalQuestionsInRound })}
        </p>

        <ol className="mt-4 space-y-1 text-sm">
          {state.questions.map((q) => (
            <li key={q.id}>
              <span className="text-gold">{t("common.questionShort", { question: q.index + 1 })}</span>{" "}
              <span dir="auto">{q.answer}</span>
            </li>
          ))}
        </ol>

        {marked.length > 0 ? (
          <div data-testid="marks-grid" className="mt-4 overflow-x-auto">
            <table className="w-full min-w-max border-separate border-spacing-1 text-sm">
              <thead>
                <tr className="text-start text-stage-muted">
                  <th className="sticky start-0 z-[1] bg-stage-panel px-2 font-semibold">{t("desk.team")}</th>
                  {state.questions.map((q) => (
                    <th key={q.id} className="px-2 font-semibold">
                      {t("common.questionShort", { question: q.index + 1 })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {marked.map((row) => (
                  <tr key={row.teamId}>
                    <th
                      scope="row"
                      className="sticky start-0 z-[1] max-w-28 truncate bg-stage-panel px-2 text-start font-medium sm:max-w-40"
                      dir="auto"
                    >
                      {row.name}
                    </th>
                    {state.questions.map((q) => {
                      const answer = row.answers.find((a) => a.questionIndex === q.index);
                      if (!answer) {
                        return (
                          <td key={q.id} className="px-2 text-stage-muted">
                            <span aria-hidden="true">·</span>
                            <span className="sr-only">{t("desk.noAnswer")}</span>
                          </td>
                        );
                      }
                      return (
                        <td key={q.id} className="px-1">
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={t(answer.isCorrect ? "desk.markedRight" : "desk.markedWrong", {
                              team: row.name,
                              question: t("common.questionShort", { question: q.index + 1 }),
                              answer: answer.text,
                            })}
                            onClick={() => void onOverride(answer.id, !answer.isCorrect, q.points)}
                            className={`flex min-h-11 w-full min-w-24 items-center justify-between gap-2 rounded-lg px-2 text-start ${
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
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {onPaper.length > 0 ? (
          <p className="mt-4 text-sm text-stage-muted">
            {t.rich("desk.onPaper", { names: <span dir="auto">{t.list(onPaper)}</span> })}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl bg-white/5 p-4 sm:p-6">
        <h3 className="font-semibold">{t("desk.roundTotals", { round: n })}</h3>
        <p className="mt-1 text-sm text-stage-muted">{t("desk.totalsHelp")}</p>
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
  const t = useT();
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
          {row.typed !== null
            ? t("common.pts", { count: row.total })
            : row.sitsOut
              ? t("desk.noAnswersThisRound")
              : t("common.pts", { count: row.auto })}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          aria-label={t("desk.totalFor", { round, team: row.name })}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 w-24 rounded-xl border border-white/15 bg-white px-3 text-base text-stage outline-none focus:ring-2 focus:ring-gold"
        />
        <button
          type="button"
          aria-label={t("desk.saveTotalFor", { team: row.name })}
          disabled={busy || !valid}
          onClick={() => void onSave(points)}
          className="h-11 min-h-11 rounded-xl bg-gold px-4 text-sm font-semibold text-stage disabled:opacity-40"
        >
          {t("desk.save")}
        </button>
        {row.typed !== null ? (
          <>
            <button
              type="button"
              aria-label={t("desk.clearTotalFor", { team: row.name })}
              disabled={busy}
              onClick={() => {
                setValue("");
                void onClear();
              }}
              className={secondary}
            >
              {t("desk.clear")}
            </button>
            <span className="text-xs text-gold">{t("desk.enteredByHand")}</span>
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
  onAddPaper,
  languages,
  onLanguage,
}: {
  code: string;
  state: RoundHostState;
  busy: boolean;
  confirmingEnd: boolean;
  onEnd: () => void;
  onKeepPlaying: () => void;
  onEndConfirmed: () => void;
  onTvMode: (showAll: boolean) => void;
  onAddPaper: (name: string) => Promise<void>;
  languages: Language[];
  onLanguage: (lang: Language) => void;
}) {
  const t = useT();
  // Client component: window is defined by the time this renders.
  const tvUrl = `${window.location.origin}/tv/${code}`;
  const hostUrl = buildHostUrl(window.location.origin, code);
  return (
    <section className="space-y-5 rounded-2xl border border-white/15 p-4 sm:p-6">
      <div>
        <h2 className="font-semibold">{t("desk.tvDisplay")}</h2>
        <p className="mt-1 text-sm text-stage-muted">{t("desk.tvHelp")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openTv(code)}
            className="h-12 min-h-12 rounded-xl bg-gold px-4 text-sm font-semibold text-stage"
          >
            {t("desk.openTv")}
          </button>
          <code className="min-w-0 break-all rounded-xl bg-black/30 px-3 py-2 font-mono text-sm">{tvUrl}</code>
          <CopyButton value={tvUrl} className="bg-white/10 text-stage-fg" />
        </div>
        <p className="mt-3 rounded-xl bg-gold/10 px-3 py-2 text-sm text-stage-fg">
          {t("desk.extendNotMirror")}
        </p>
        {state.status !== "ENDED" ? (
          <div className="mt-4">
            <p className="text-sm font-semibold">{t("desk.tvShows")}</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("desk.tvShows")}>
              <button
                type="button"
                aria-pressed={!state.tvShowsAll}
                onClick={() => onTvMode(false)}
                className={`${secondary} ${!state.tvShowsAll ? "bg-white/15" : ""}`}
              >
                {t("desk.currentQuestion")}
              </button>
              <button
                type="button"
                aria-pressed={state.tvShowsAll}
                onClick={() => onTvMode(true)}
                className={`${secondary} ${state.tvShowsAll ? "bg-white/15" : ""}`}
              >
                {t("desk.allSoFar")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {state.status !== "LOBBY" && state.status !== "ENDED" ? (
        <div>
          <AddPaperTeam heading={t("desk.teamsCount", { count: state.teams.length })} busy={busy} onAddPaper={onAddPaper} />
          <p className="mt-2 text-sm text-stage-muted">{t("desk.lateTable")}</p>
          <TeamList state={state} />
        </div>
      ) : null}

      <div>
        <h2 className="font-semibold">{t("desk.hostLink")}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-xl bg-black/30 px-3 py-2 font-mono text-sm">{hostUrl}</code>
          <CopyButton value={hostUrl} className="bg-white/10 text-stage-fg" />
        </div>
        <p className="mt-2 text-sm text-stage-muted">{t("desk.hostLinkHelp")}</p>
      </div>

      {languages.length > 1 ? (
        <label className="block">
          <span className="font-semibold">{t("desk.language")}</span>
          <select
            value={t.lang}
            onChange={(e) => onLanguage(e.target.value as Language)}
            className="mt-2 block h-12 rounded-xl border border-white/15 bg-white px-3 text-base text-stage"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {languageMeta(lang).name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {state.status !== "ENDED" ? (
        confirmingEnd ? (
          <ConfirmPanel
            title={t("desk.endTitle")}
            body={t("desk.endBody")}
            confirmLabel={t("desk.endYes")}
            keepLabel={t("desk.keepPlaying")}
            busy={busy}
            onKeep={onKeepPlaying}
            onConfirm={onEndConfirmed}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stage-muted">{t("desk.finishedEarly")}</p>
            <button type="button" onClick={onEnd} className={`${secondary} ms-auto h-12 min-h-12`}>
              {t("desk.endGame")}
            </button>
          </div>
        )
      ) : null}
    </section>
  );
}

function Ended({ state }: { state: RoundHostState }) {
  const t = useT();
  const { winners, topScore } = topScorers(state.scoreboard);
  return (
    <section className="rounded-2xl bg-white/5 p-4 sm:p-6">
      <TrophyIcon className="h-9 w-9 text-gold" />
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
        {winners.length > 1 ? t("desk.champions") : t("desk.champion")}
      </p>
      <h2 className="mt-2 font-serif text-4xl font-semibold leading-tight" dir="auto">
        {winningNames(t, winners)}
      </h2>
      {winners.length > 0 ? (
        <p className="mt-2 text-stage-muted">
          {t("common.points", { count: topScore })} · {t("common.rounds", { count: state.totalRounds })}
        </p>
      ) : null}
      <div className="mt-6">
        <Scoreboard rows={state.scoreboard} dark />
      </div>
    </section>
  );
}
