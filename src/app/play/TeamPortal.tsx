"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Countdown } from "@/components/Countdown";
import { Scoreboard } from "@/components/Scoreboard";
import { StatusBadge } from "@/components/StatusBadge";
import { TrophyIcon } from "@/components/icons";
import { Wordmark } from "@/components/Wordmark";
import { rankOf, topScorers } from "@/lib/scoreboard-summary";
import {
  clearStoredTeam,
  readStoredTeam,
  writeStoredTeam,
  type StoredTeam,
} from "@/lib/team-session";
import { readJoinCode } from "@/lib/join-url";
import { countOf } from "@/lib/plural";
import { questionMediaUrl } from "@/lib/question-media-url";
import type { RoundTeamState, ScoreboardRow, SessionQuestion, TeamSessionState } from "@/lib/api-types";
import { RoundTeamPlay } from "./RoundTeamPlay";

/** Same-origin `<img>` at the question's own media route — never a URL held
 * anywhere but our own DB-backed bytes (see src/lib/media.ts). Renders
 * nothing when the question carries no image, which is most questions.
 *
 * The join code and this team's token ride on the URL because that route no
 * longer serves a question's image to whoever asks (see
 * src/lib/question-media-access.ts) and an `<img>` cannot send a header. The
 * token is already on the query string of every poll this page makes, so
 * nothing is exposed here that was not already. */
function QuestionImage({
  question,
  team,
}: {
  question: SessionQuestion | null | undefined;
  team: StoredTeam;
}) {
  if (!question?.hasMedia) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our own API route, not a next/image-optimizable asset
    <img
      src={questionMediaUrl(question.id, { code: team.code, token: team.token })}
      alt=""
      className="mt-4 max-h-64 w-full rounded-xl border border-white/15 bg-white object-contain"
    />
  );
}

export function TeamPortal() {
  const [stored, setStored] = useState<StoredTeam | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [answer, setAnswer] = useState("");
  const [state, setState] = useState<TeamSessionState | RoundTeamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The id of the question the `answer` draft belongs to. When the host
  // advances, the next poll brings a different id and the draft is replaced
  // by whatever the server holds for the new question (usually nothing), so a
  // team can never submit the previous question's text by accident.
  const answerQuestionId = useRef<string | null>(null);
  // True from loading a remembered team until its first poll answers, so a
  // game that has gone (404) shows the join form without first flashing the
  // team's screen. A game that is over stays: a phone reloaded after Finish
  // shows the final scores and its place, not the join form.
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  // The token of the team this phone is in right now. A poll already on its
  // way when the team left answers for a team that is gone; its "Invalid team
  // token" used to land on the empty join form after Leave.
  const liveToken = useRef<string | null>(null);

  // Back to the join form, for the game in the URL if there is one, with no
  // team name carried over from the game being left.
  const forgetTeam = useCallback(() => {
    clearStoredTeam();
    liveToken.current = null;
    setStored(null);
    setState(null);
    setName("");
    setCode(readJoinCode(window.location.search));
    answerQuestionId.current = null;
    setAnswer("");
  }, []);

  useEffect(() => {
    // localStorage isn't available during SSR, so the real value can only be
    // read after mount — reading it via a lazy useState initializer instead
    // would make the client's first render diverge from the server-rendered
    // HTML (a hydration mismatch). Deferring to an effect, gated by
    // `hydrated`, keeps the first paint identical on server and client.
    let existing = readStoredTeam();
    // A code in the URL is the game this phone is trying to join. A team
    // remembered from a different game is not a place to keep: opening the
    // new game's link used to show the old game's screen, for good.
    const urlCode = readJoinCode(window.location.search);
    if (existing && urlCode && urlCode !== existing.code) {
      clearStoredTeam();
      existing = null;
    }
    liveToken.current = existing?.token ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored(existing);
    if (existing) {
      setCode(existing.code);
      setName(existing.teamName);
      // The same game, or no code at all: keep the team only if its game is
      // still on. The first poll decides; until then nothing is shown.
      checkingRef.current = true;
      setChecking(true);
    } else {
      // Arriving via the host desk's QR code (/play?code=ABCDE): prefill the
      // session code so the team only has to pick a name.
      setCode(readJoinCode(window.location.search));
    }
    setHydrated(true);
  }, []);

  const refresh = useCallback(async (team: StoredTeam) => {
    try {
      const res = await fetch(`/api/sessions/${team.code}?token=${encodeURIComponent(team.token)}`);
      const data = await res.json();
      if (liveToken.current !== team.token) return;
      const firstCheck = checkingRef.current;
      checkingRef.current = false;
      setChecking(false);
      if (!res.ok) {
        if (firstCheck && res.status === 404) {
          forgetTeam();
          return;
        }
        if (res.status === 401) forgetTeam();
        setError(data.error ?? "Could not load session");
        return;
      }
      setError(null);
      setState(data);
      const questionId: string | null = data.question?.id ?? null;
      if (questionId !== answerQuestionId.current) {
        answerQuestionId.current = questionId;
        setAnswer(data.myAnswer?.text ?? "");
      } else if (data.myAnswer?.text && data.status !== "QUESTION_ACTIVE") {
        setAnswer(data.myAnswer.text);
      }
    } catch {
      if (liveToken.current !== team.token) return;
      checkingRef.current = false;
      setChecking(false);
      setError("Lost connection to the session. Retrying…");
    }
  }, [forgetTeam]);

  useEffect(() => {
    if (!stored) return;
    // Standard fetch-on-mount-and-interval polling: refresh() sets state
    // asynchronously after its own await, not synchronously in this body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(stored);
    const id = window.setInterval(() => void refresh(stored), 3000);
    return () => window.clearInterval(id);
  }, [stored, refresh]);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sessionCode = code.trim().toUpperCase();
      const res = await fetch(`/api/sessions/${sessionCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not join");
      const team: StoredTeam = {
        code: sessionCode,
        token: data.token,
        teamId: data.teamId,
        teamName: data.teamName,
      };
      writeStoredTeam(team);
      liveToken.current = team.token;
      setStored(team);
      answerQuestionId.current = null;
      setAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(event: React.FormEvent) {
    event.preventDefault();
    if (!stored) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${stored.code}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: stored.token, text: answer.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit");
      await refresh(stored);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    // Best-effort: the server removes the team only if it has not answered
    // yet (see /api/sessions/[code]/leave), so the name is free to rejoin.
    // The phone forgets the team either way; the response is not awaited.
    if (stored) {
      void fetch(`/api/sessions/${stored.code}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: stored.token }),
        keepalive: true,
      }).catch(() => {});
    }
    backToJoinForm();
  }

  function backToJoinForm() {
    forgetTeam();
    // Not the code just left, even when it is the one in the URL.
    if (stored && readJoinCode(window.location.search) === stored.code) setCode("");
  }

  if (!hydrated || checking) {
    return <div className="min-h-dvh bg-stage" />;
  }

  if (!stored) {
    return (
      <div className="flex min-h-dvh flex-col bg-stage px-5 py-8 text-stage-fg">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          {/* The one place the brand appears on a team's phone: the join
              screen, before the night starts. Never during a question. */}
          <Wordmark className="mb-8 text-[1.35rem]" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mint">Team portal</p>
          <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight">Join tonight’s quiz</h1>
          <p className="mt-2 text-stage-muted">Ask the host for the 5-character code, then pick a team name.</p>

          <form onSubmit={join} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium">Session code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5))}
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="AB3K7"
                className="mt-2 h-14 w-full rounded-xl border border-white/15 bg-white px-4 font-mono text-2xl tracking-[0.28em] text-stage outline-none focus:ring-2 focus:ring-gold"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Team name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Quizards of Oz"
                className="mt-2 h-14 w-full rounded-xl border border-white/15 bg-white px-4 text-lg text-stage outline-none focus:ring-2 focus:ring-gold"
                required
              />
            </label>
            {error ? <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || code.length < 5 || name.trim().length === 0}
              className="h-14 w-full rounded-xl bg-gold text-lg font-semibold text-stage disabled:opacity-40"
            >
              {busy ? "Joining…" : "Join session"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-stage px-5 py-6 text-stage-fg">
      <header className="mx-auto flex w-full max-w-md items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gold">{stored.teamName}</p>
          <p className="mt-1 font-mono text-lg tracking-[0.16em]">{stored.code}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {state ? <StatusBadge status={state.status} dark /> : null}
          <button type="button" onClick={leave} className="min-h-11 px-2 text-sm text-stage-muted underline-offset-2">
            Leave
          </button>
        </div>
      </header>

      <main className="mx-auto mt-6 flex w-full max-w-md flex-1 flex-col">
        {error ? <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        {/* Every game started since round mode shipped (RM8); the panels
            below are the one-question-at-a-time flow, kept for games that
            were already running. */}
        {state?.mode === "ROUND" ? (
          <RoundTeamPlay state={state} team={stored} onChanged={() => refresh(stored)} />
        ) : null}

        {state?.mode === "ROUND" ? null : !state || state.status === "LOBBY" ? (
          <LobbyPanel teamName={stored.teamName} state={state} />
        ) : null}

        {state?.status === "QUESTION_ACTIVE" ? (
          <form onSubmit={submitAnswer} className="flex flex-1 flex-col">
            <div className="flex items-start justify-between gap-3">
              <RoundKicker state={state} />
              <Countdown timer={state.timer} dark />
            </div>
            <h2 className="mt-3 font-serif text-2xl font-semibold leading-snug">{state.question?.text}</h2>
            <QuestionImage question={state.question} team={stored} />
            {state.question?.type === "MULTIPLE_CHOICE" ? (
              <div className="mt-6 flex-1 space-y-3">
                <span className="text-sm font-medium">Your answer</span>
                <div className="grid gap-3">
                  {state.question.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAnswer(option)}
                      className={`h-14 rounded-xl border px-4 text-left text-lg font-medium ${
                        answer === option
                          ? "border-gold bg-gold text-stage"
                          : "border-white/15 bg-white text-stage"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <label className="mt-6 block flex-1">
                <span className="text-sm font-medium">Your answer</span>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={4}
                  maxLength={500}
                  className="mt-2 min-h-32 w-full rounded-xl border border-white/15 bg-white px-4 py-3 text-lg text-stage outline-none focus:ring-2 focus:ring-gold"
                  required
                />
              </label>
            )}
            <button
              type="submit"
              disabled={busy || answer.trim().length === 0}
              className="mt-4 h-14 w-full rounded-xl bg-gold text-lg font-semibold text-stage disabled:opacity-40"
            >
              {busy ? "Sending…" : state.myAnswer ? "Update answer" : "Submit answer"}
            </button>
            {state.myAnswer ? (
              <p className="mt-3 text-center text-sm text-stage-muted">
                In: “{state.myAnswer.text}”. You can change it until the host reveals.
              </p>
            ) : null}
          </form>
        ) : null}

        {state?.status === "REVEAL" ? <RevealPanel state={state} team={stored} /> : null}
        {/* The same ending in both modes: the champions treatment, the
            place, the final scores. */}
        {state?.status === "ENDED" && state.scoreboard ? (
          <EndedPanel
            scoreboard={state.scoreboard}
            teamName={state.teamName}
            teamId={stored.teamId}
            onJoinAnother={backToJoinForm}
          />
        ) : null}
      </main>
    </div>
  );
}

function RoundKicker({ state }: { state: TeamSessionState }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
      Round {state.roundNumber}
      {state.round ? ` · ${state.round.title}` : ""} · Q{state.questionNumber}
      {state.question ? ` · ${countOf(state.question.points, "pt")}` : ""}
    </p>
  );
}

function LobbyPanel({ teamName, state }: { teamName: string; state: TeamSessionState | null }) {
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="font-serif text-3xl font-semibold">You’re in, {teamName}.</h2>
      <p className="mt-3 text-lg text-stage-muted">Sit tight. The host will start the first question from the desk.</p>
      <section className="mt-8 rounded-2xl bg-white/5 p-4">
        <h3 className="mb-3 font-semibold">Scoreboard</h3>
        <Scoreboard rows={state?.scoreboard ?? []} highlightName={teamName} dark />
      </section>
    </div>
  );
}

function RevealPanel({ state, team }: { state: TeamSessionState; team: StoredTeam }) {
  const correct = state.myAnswer?.isCorrect;
  return (
    <div className="flex flex-1 flex-col">
      <RoundKicker state={state} />
      <h2 className="mt-3 font-serif text-2xl font-semibold leading-snug">{state.question?.text}</h2>
      <QuestionImage question={state.question} team={team} />
      <div
        className={`mt-6 rounded-2xl px-4 py-5 ${
          correct ? "bg-emerald-500/15 text-emerald-100" : "bg-red-500/15 text-red-100"
        }`}
      >
        <p className="text-sm font-semibold uppercase tracking-wide">
          {state.myAnswer
            ? correct
              ? `Correct · +${state.myAnswer.pointsAwarded ?? 0}`
              : "Not this time"
            : "No answer submitted"}
        </p>
        {state.myAnswer ? <p className="mt-2 text-lg">You said: {state.myAnswer.text}</p> : null}
        {state.question?.answer ? (
          <p className="mt-2 text-lg font-semibold">Answer: {state.question.answer}</p>
        ) : null}
      </div>
      <section className="mt-8 rounded-2xl bg-white/5 p-4">
        <h3 className="mb-3 font-semibold">Scoreboard</h3>
        <Scoreboard rows={state.scoreboard} highlightName={state.teamName} dark />
      </section>
    </div>
  );
}

function EndedPanel({
  scoreboard,
  teamName,
  teamId,
  onJoinAnother,
}: {
  scoreboard: ScoreboardRow[];
  teamName: string;
  teamId: string;
  onJoinAnother: () => void;
}) {
  const state = { scoreboard, teamName };
  // By id; by name only for a team remembered without one (readStoredTeam does not require it).
  const mine = state.scoreboard.find((row) => (teamId ? row.teamId === teamId : row.name === state.teamName));
  const place = mine ? rankOf(state.scoreboard, mine.teamId) : null;
  const { winners } = topScorers(state.scoreboard);
  const isWinner = mine != null && winners.some((row) => row.teamId === mine.teamId);
  return (
    <div className="flex flex-1 flex-col motion-safe:animate-reveal">
      {isWinner ? (
        <>
          <TrophyIcon className="h-9 w-9 text-gold" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            {winners.length > 1 ? "You tied for the win!" : "You won!"}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-semibold">Champions, {state.teamName}!</h2>
        </>
      ) : (
        <h2 className="font-serif text-3xl font-semibold">This quiz is over.</h2>
      )}
      <p className="mt-3 text-lg text-stage-muted">
        {isWinner ? "This quiz is over. " : ""}
        {place && mine
          ? `${state.teamName} finished ${ordinal(place)} with ${mine.score} ${mine.score === 1 ? "point" : "points"}.`
          : "Thanks for playing."}
      </p>
      <section className="mt-8 rounded-2xl bg-white/5 p-4">
        <h3 className="mb-3 font-semibold">Final scores</h3>
        <Scoreboard rows={state.scoreboard} highlightName={state.teamName} dark />
      </section>
      <button
        type="button"
        onClick={onJoinAnother}
        className="mt-6 h-12 min-h-12 rounded-xl border border-white/20 px-4 text-base font-semibold"
      >
        Join another quiz
      </button>
    </div>
  );
}

function ordinal(n: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}
