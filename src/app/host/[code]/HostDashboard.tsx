"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { JoinQr } from "@/components/JoinQr";
import { Countdown } from "@/components/Countdown";
import { Scoreboard } from "@/components/Scoreboard";
import { StatusBadge } from "@/components/StatusBadge";
import { TrophyIcon } from "@/components/icons";
import { topScorers, winningNames } from "@/lib/scoreboard-summary";
import { readHostToken, writeHostToken } from "@/lib/host-session";
import { CopyButton } from "@/components/CopyButton";
import { buildHostUrl } from "@/lib/join-url";
import { questionMediaUrl } from "@/lib/question-media-url";
import type { HostSessionState, HostTeam, RoundHostState, SessionQuestion } from "@/lib/api-types";
import { RoundHostDesk } from "./RoundHostDesk";
import { countOf } from "@/lib/plural";

/** Same-origin `<img>` at the question's own media route — never a URL held
 * anywhere but our own DB-backed bytes (see src/lib/media.ts). Renders
 * nothing when the question carries no image, which is most questions. */
function QuestionImage({
  question,
  code,
  hostToken,
}: {
  question: SessionQuestion | null | undefined;
  code: string;
  hostToken: string;
}) {
  if (!question?.hasMedia) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our own API route, not a next/image-optimizable asset
    <img
      src={questionMediaUrl(question.id, { code, hostToken })}
      alt=""
      className="mt-4 max-h-72 w-full rounded-xl border border-white/10 bg-white object-contain"
    />
  );
}

export function HostDashboard({ code }: { code: string }) {
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [pastedToken, setPastedToken] = useState("");
  const [state, setState] = useState<HostSessionState | RoundHostState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Two taps to end a game, because this desk sits on a TV within reach of a
  // room full of people and the action cannot be undone. An inline panel
  // rather than window.confirm: a native dialog on a phone covers the screen
  // it is asking about, and this one can be read from across the pub.
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  // Set only by a press that lands on "Yes, end the game" itself — a pointer
  // down or an Enter/Space key down — after the panel opened. A click that
  // arrives without one (synthesised, programmatic, or the tail of a press
  // that began somewhere else) does nothing. See endGameConfirmed below.
  const endArmedRef = useRef(false);
  const keepPlayingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // localStorage isn't available during SSR, so the real value can only be
    // read after mount — reading it via a lazy useState initializer instead
    // would make the client's first render diverge from the server-rendered
    // HTML (a hydration mismatch). Deferring to an effect, gated by
    // `hydrated`, keeps the first paint identical on server and client.
    const stored = readHostToken(code);
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHostToken(stored);
      setHydrated(true);
      return;
    }

    // No key in this browser. If this account started the game, the server
    // hands its own key back (H4) — which is the whole difference between a
    // host who has changed device and a host who is locked out of their own
    // quiz. Anyone else still gets the paste-the-key screen below.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/sessions/${code}/host-key`);
        if (res.ok) {
          const { hostToken: recovered } = (await res.json()) as { hostToken?: string };
          if (recovered && !cancelled) {
            writeHostToken(code, recovered);
            setHostToken(recovered);
          }
        }
      } catch {
        // Offline, or the route refused: fall through to the paste screen.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const refresh = useCallback(async () => {
    if (!hostToken) return;
    try {
      const res = await fetch(`/api/sessions/${code}?as=host&hostToken=${encodeURIComponent(hostToken)}`);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setError("This browser's host key was rejected for this session.");
          setHostToken(null);
          return;
        }
        setError(data.error ?? "Could not load session");
        return;
      }
      setError(null);
      setState(data);
    } catch {
      setError("Lost connection to the session. Retrying…");
    }
  }, [code, hostToken]);

  useEffect(() => {
    if (!hostToken) return;
    // Standard fetch-on-mount-and-interval polling: refresh() sets state
    // asynchronously after its own await, not synchronously in this body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const id = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(id);
  }, [refresh, hostToken]);

  async function advance(action: "start" | "reveal" | "next" | "end") {
    if (!hostToken) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${code}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, hostToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not advance");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not advance");
    } finally {
      setBusy(false);
    }
  }

  function openEndConfirmation() {
    endArmedRef.current = false;
    setConfirmingEnd(true);
  }

  /**
   * The only way a game is ended from this desk (L9). A live walk on the
   * preview saw a game end ~2.5s after "End game" was pressed, with nobody
   * touching the machine, and the request matched this handler exactly. It
   * did not reproduce in Chromium at any width, and nothing in the app
   * synthesises a click — but a destructive action this close to a room full
   * of people should not depend on that, so it demands an explicit press:
   * a trusted click whose own pointer-down or key-down landed on this button
   * after the panel opened. The button is also laid out away from where
   * "End game" was, and focus goes to "Keep playing", never to this.
   */
  function endGameConfirmed(event: React.MouseEvent<HTMLButtonElement>) {
    if (!event.isTrusted || !endArmedRef.current) return;
    endArmedRef.current = false;
    setConfirmingEnd(false);
    void advance("end");
  }

  async function overrideAnswer(team: HostTeam, isCorrect: boolean) {
    // The id is only sent from the reveal onwards, along with everything else
    // about the answer — so this is unreachable before then, and the buttons
    // that call it are not rendered either.
    if (!team.currentAnswer?.id || state?.mode !== "QUESTION" || !state.question || !hostToken) return;
    await fetch(`/api/sessions/${code}/answers/${team.currentAnswer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCorrect, points: state.question.points, hostToken }),
    });
    await refresh();
  }

  function submitPastedToken(event: React.FormEvent) {
    event.preventDefault();
    const value = pastedToken.trim();
    if (!value) return;
    writeHostToken(code, value);
    setHostToken(value);
    setError(null);
  }

  useEffect(() => {
    // The safe choice takes focus when the panel opens, so a stray Enter or
    // Space — a key held down, a remote's OK button — can only back out.
    if (confirmingEnd) keepPlayingRef.current?.focus();
  }, [confirmingEnd]);

  if (!hydrated) {
    return <div className="stage-surface min-h-dvh bg-stage" />;
  }

  if (!hostToken) {
    return (
      <div className="flex stage-surface min-h-dvh items-center justify-center bg-stage px-5 text-stage-fg">
        <div className="w-full max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Host desk</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold">Host key needed</h1>
          <p className="mt-2 text-stage-muted">
            This browser doesn&apos;t have host access for session {code}. If you started this
            session here, try reopening it from the pack editor. Otherwise paste the host key
            you were given when the session was created.
          </p>
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
          <form onSubmit={submitPastedToken} className="mt-6 flex gap-2">
            <input
              value={pastedToken}
              onChange={(e) => setPastedToken(e.target.value)}
              placeholder="Host key"
              className="h-12 flex-1 rounded-xl border border-white/15 bg-white px-3 text-sm text-stage outline-none focus:ring-2 focus:ring-gold"
            />
            <button
              type="submit"
              className="h-12 rounded-xl bg-gold px-4 text-sm font-semibold text-stage disabled:opacity-40"
              disabled={!pastedToken.trim()}
            >
              Use key
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex stage-surface min-h-dvh items-center justify-center bg-stage text-stage-muted">
        {error ?? "Loading host desk…"}
      </div>
    );
  }

  // Every game started since round mode shipped (RM7). Everything below this
  // line is the one-question-at-a-time desk, kept for games already running.
  if (state.mode === "ROUND") {
    return <RoundHostDesk code={code} hostToken={hostToken} state={state} error={error} onError={setError} refresh={refresh} />;
  }

  const submitted = state.teams.filter((team) => team.currentAnswer).length;
  /**
   * Whether the room may see how each team did.
   *
   * This desk goes on a TV and is read from across the pub, so everything it
   * renders is public to the players. While a question is open it used to
   * show every team's answer text, a green or red score, and the override
   * buttons — so the first team to answer correctly published the answer to
   * the room, and with resubmissions allowed the rest could simply copy it
   * off the wall. Until the reveal the desk says only who has answered.
   */
  const revealed = state.status === "REVEAL" || state.status === "ENDED";
  const nextLabel =
    state.roundNumber >= state.totalRounds && state.questionNumber >= state.totalQuestionsInRound
      ? "End quiz"
      : "Next question";
  const { winners, topScore } = topScorers(state.scoreboard);
  // Client component, so window is defined by the time this renders — the same
  // reason JoinQr reads the origin this way.
  const hostUrl = buildHostUrl(window.location.origin, state.code);
  const submissionsLabel =
    state.status === "QUESTION_ACTIVE" || state.status === "REVEAL" ? "Live submissions" : "Teams";

  return (
    <div className="stage-surface min-h-dvh bg-stage text-stage-fg">
      <header className="border-b border-white/10 px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gold">Host desk</p>
            <h1 className="mt-1 font-serif text-xl font-semibold">{state.packTitle}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={state.status} dark />
            <div className="rounded-xl bg-gold px-4 py-2 text-stage">
              <p className="text-[11px] font-semibold uppercase tracking-wider">Team code</p>
              <p className="font-mono text-2xl font-bold tracking-[0.2em]">{state.code}</p>
            </div>
          </div>
        </div>
      </header>

      {/* minmax(0, …) and min-w-0: a grid column's default minimum is its
          content's min-content width, so one long team name or a wide
          answer row in the aside used to force the whole desk wider than an
          iPad in portrait, and squeeze the question column to one word per
          line at 1024px. */}
      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {error ? <p className="lg:col-span-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        <section className="rounded-2xl bg-white/5 p-5 sm:p-6">
          {state.status === "LOBBY" ? (
            <>
              <h2 className="font-serif text-2xl font-semibold">Waiting for teams</h2>
              <p className="mt-2 text-stage-muted">
                Share the code. Start when everyone is in — late joiners can still arrive during the lobby.
              </p>
              {/* Still worth saying in the lobby rather than in front of a
                  room — but no longer a dead end. The key lives in this
                  browser's local storage (src/lib/host-session.ts), and since
                  H4 the account that started the game can ask the server for
                  it back, so signing in on the new device is enough. Someone
                  who is not this account still needs the key pasted. */}
              <p className="mt-2 text-sm text-stage-muted">
                Best to keep this browser open. If you do move devices, sign in there and open the
                host link below — anyone else will be asked for this session&apos;s host key.
              </p>
              <JoinQr code={state.code} />
              <button
                type="button"
                onClick={() => advance("start")}
                disabled={busy || state.teams.length === 0}
                className="mt-6 h-14 w-full rounded-xl bg-gold text-base font-semibold text-stage disabled:opacity-40"
              >
                {state.teams.length === 0 ? "Waiting for the first team" : "Start quiz"}
              </button>
            </>
          ) : null}

          {state.status === "QUESTION_ACTIVE" || state.status === "REVEAL" ? (
            <>
              {state.status === "QUESTION_ACTIVE" ? (
                <div className="flex justify-end">
                  <Countdown timer={state.timer} dark />
                </div>
              ) : null}
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
                Round {state.roundNumber} of {state.totalRounds}
                {state.round ? ` · ${state.round.title}` : ""}
              </p>
              <p className="mt-1 text-sm text-stage-muted">
                Question {state.questionNumber} of {state.totalQuestionsInRound}
                {state.question ? ` · ${countOf(state.question.points, "pt")}` : ""}
              </p>
              <h2 className="mt-4 font-serif text-2xl font-semibold leading-snug sm:text-3xl">
                {state.question?.text ?? "No question loaded"}
              </h2>
              <QuestionImage question={state.question} code={code} hostToken={hostToken} />
              {state.question?.type === "MULTIPLE_CHOICE" && state.question.options.length > 0 ? (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {state.question.options.map((option, i) => (
                    <li
                      key={option}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        state.question?.answer === option
                          ? "bg-emerald-500/20 font-semibold text-emerald-200"
                          : "bg-white/5"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}) {option}
                    </li>
                  ))}
                </ul>
              ) : null}
              {state.question?.answer ? (
                <p className="mt-4 rounded-xl bg-emerald-500/15 px-4 py-3 font-semibold text-emerald-200">
                  Answer: {state.question.answer}
                </p>
              ) : (
                <p className="mt-4 text-sm text-stage-muted">Answer stays hidden until you reveal.</p>
              )}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {state.status === "QUESTION_ACTIVE" ? (
                  <button
                    type="button"
                    onClick={() => advance("reveal")}
                    disabled={busy}
                    className="h-14 flex-1 rounded-xl bg-gold text-base font-semibold text-stage disabled:opacity-40"
                  >
                    Reveal answer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => advance("next")}
                    disabled={busy}
                    className="h-14 flex-1 rounded-xl bg-gold text-base font-semibold text-stage disabled:opacity-40"
                  >
                    {nextLabel}
                  </button>
                )}
              </div>
            </>
          ) : null}

          {state.status === "ENDED" ? (
            <div className="motion-safe:animate-reveal">
              <TrophyIcon className="h-9 w-9 text-gold" />
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                {winners.length > 1 ? "Tonight’s champions" : "Tonight’s champion"}
              </p>
              <h2 className="mt-2 font-serif text-4xl font-semibold leading-tight">{winningNames(winners)}</h2>
              {winners.length > 0 ? (
                <p className="mt-2 text-stage-muted">
                  {countOf(topScore, "point")} · {countOf(state.totalRounds, "round")}
                </p>
              ) : null}
              <p className="mt-6 text-sm text-stage-muted">
                That’s the night. Final standings are on the right — thanks for hosting.
              </p>
            </div>
          ) : null}
        </section>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-2xl bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{submissionsLabel}</h3>
              <span className="text-sm text-stage-muted">
                {submitted}/{state.teams.length}
              </span>
            </div>
            {state.status === "LOBBY" || state.status === "ENDED" ? (
              <ul className="mt-4 space-y-2">
                {state.teams.length === 0 ? (
                  <li className="text-sm text-stage-muted">No teams yet.</li>
                ) : (
                  state.teams.map((team) => (
                    <li key={team.id} className="rounded-lg bg-white/5 px-3 py-2.5">
                      {team.name}
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <ul className="mt-4 space-y-2">
                {state.teams.map((team) => (
                  <li key={team.id} className="rounded-lg bg-white/5 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{team.name}</p>
                        <p className="mt-1 truncate text-sm text-stage-muted">
                          {revealed
                            ? (team.currentAnswer?.text ?? "Waiting…")
                            : team.currentAnswer
                              ? "Answered"
                              : "Waiting…"}
                        </p>
                      </div>
                      {revealed && team.currentAnswer ? (
                        <span
                          className={`shrink-0 text-xs font-semibold ${
                            team.currentAnswer.isCorrect ? "text-emerald-300" : "text-red-300"
                          }`}
                        >
                          {team.currentAnswer.isCorrect ? `+${team.currentAnswer.pointsAwarded}` : "0"}
                        </span>
                      ) : null}
                    </div>
                    {revealed && team.currentAnswer ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => overrideAnswer(team, true)}
                          className="h-10 rounded-lg bg-emerald-700 text-sm font-semibold"
                        >
                          Correct
                        </button>
                        <button
                          type="button"
                          onClick={() => overrideAnswer(team, false)}
                          className="h-10 rounded-lg bg-red-600/70 text-sm font-semibold"
                        >
                          Wrong
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-white/5 p-5">
            <h3 className="mb-3 font-semibold">Scoreboard</h3>
            <Scoreboard rows={state.scoreboard} dark />
          </section>
        </aside>

        {/* H4: the host desk's own address, shown rather than assumed.
            Until now the host key was generated once, returned once, and
            written silently to local storage — so nothing on any screen told a
            host how to get back to their own desk, and the desk itself asked
            for a key they had never seen. The link carries no key on purpose
            (see buildHostUrl): the account that started the game gets its key
            back from the server, and a URL is the worst place to keep a
            credential. */}
        <section className="lg:col-span-2 rounded-2xl border border-white/10 p-5">
          <h3 className="font-semibold">Host link</h3>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="min-w-0 flex-1 break-all rounded-xl bg-black/30 px-3 py-2 font-mono text-sm">
              {hostUrl}
            </code>
            <CopyButton value={hostUrl} className="bg-gold text-stage" />
          </div>
          <p className="mt-2 text-sm text-stage-muted">
            Keep this link to reopen the host desk on another device.
          </p>
        </section>

        {/* The host's way out of a game, and the reason the pack's editor can
            trust that a live session means a live session: a lobby nobody
            joined, or a question the room walked out on, otherwise stays
            un-ENDED and blocks structural edits to the pack until the
            12-hour staleness window passes (L9, and the guard in
            src/lib/live-game-guard.ts). */}
        {state.status !== "ENDED" ? (
          <section className="lg:col-span-2 rounded-2xl border border-white/10 p-5">
            {confirmingEnd ? (
              <>
                <h3 className="font-semibold">End this game for everyone?</h3>
                <p className="mt-1 text-sm text-stage-muted">
                  Teams stop being able to answer and the scoreboard becomes final. The pack can be
                  edited again afterwards. This cannot be undone.
                </p>
                {/* "End game" always sits at the right edge (ml-auto below), so
                    "Keep playing" takes that spot and "Yes" is kept to the left
                    of it at every width — never under a pointer that has just
                    pressed "End game". */}
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onPointerDown={() => {
                      endArmedRef.current = true;
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") endArmedRef.current = true;
                    }}
                    onClick={endGameConfirmed}
                    disabled={busy}
                    className="h-12 min-h-12 self-start rounded-xl bg-red-500/90 px-5 text-sm font-semibold text-white disabled:opacity-40 sm:self-auto"
                  >
                    Yes, end the game
                  </button>
                  <button
                    ref={keepPlayingRef}
                    type="button"
                    onClick={() => setConfirmingEnd(false)}
                    className="h-12 min-h-12 self-end rounded-xl border border-white/20 px-5 text-sm font-semibold text-stage-fg sm:self-auto"
                  >
                    Keep playing
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-stage-muted">
                  Finished early, or opened this session by mistake? Ending the game unlocks the pack
                  for editing.
                </p>
                <button
                  type="button"
                  onClick={openEndConfirmation}
                  className="ml-auto h-12 min-h-12 rounded-xl border border-white/20 px-5 text-sm font-semibold text-stage-fg"
                >
                  End game
                </button>
              </div>
            )}
          </section>
        ) : null}

        <p className="lg:col-span-2 text-center text-sm text-stage-muted">
          Teams join at{" "}
          <Link href="/play" className="text-gold underline underline-offset-2">
            /play
          </Link>
        </p>
      </main>
    </div>
  );
}
