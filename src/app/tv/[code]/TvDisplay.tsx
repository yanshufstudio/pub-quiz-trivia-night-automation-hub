"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "react-qr-code";
import { QuestionText } from "@/components/QuestionText";
import { RoundCountdown } from "@/components/RoundCountdown";
import { Wordmark } from "@/components/Wordmark";
import type { RoundDisplayState, RoundQuestionView, ScoreboardRow } from "@/lib/api-types";
import { buildJoinUrl } from "@/lib/join-url";
import { questionLabel } from "@/lib/question-number";
import { questionMediaUrl } from "@/lib/question-media-url";
import { NO_SCORES_YET, noScoresYet, rankOf } from "@/lib/scoreboard-summary";

/**
 * The pub's TV (RM9).
 *
 * A fixed 1920×1080 stage, scaled to fit whatever screen it is on, so a TV's
 * own browser, a cast tab and a laptop on Extend all show the same picture
 * with nothing to scroll or zoom. Nothing on it needs a mouse or hover — a TV
 * remote cannot provide either. It polls every three seconds; a failed poll
 * shows a small "Reconnecting…" badge and backs off, and a 429 waits for as
 * long as the server says to, so the screen never goes dead.
 */

const STAGE_W = 1920;
const STAGE_H = 1080;
const POLL_MS = 3000;
const MAX_BACKOFF_MS = 30_000;

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
const windowSize = () => `${window.innerWidth}x${window.innerHeight}`;

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

export function TvDisplay({ code }: { code: string }) {
  const [state, setState] = useState<RoundDisplayState | null>(null);
  const [failing, setFailing] = useState(false);
  const [missing, setMissing] = useState(false);

  const size = useSyncExternalStore(subscribeResize, windowSize, () => `${STAGE_W}x${STAGE_H}`);
  const [w, h] = size.split("x").map(Number);
  const scale = Math.min(w / STAGE_W, h / STAGE_H);

  const fullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement != null,
    () => false
  );
  const canFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenEnabled === true,
    () => false
  );

  // Poll, backing off on failure. A 429 carries Retry-After; wait at least
  // that long rather than make the limiter's job harder.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;

    async function poll() {
      let wait = POLL_MS;
      try {
        const res = await fetch(`/api/sessions/${code}/display`, { cache: "no-store" });
        if (res.status === 404) {
          if (!cancelled) setMissing(true);
        } else if (!res.ok) {
          failures += 1;
          const retryAfter = Number(res.headers.get("Retry-After")) * 1000 || 0;
          wait = Math.max(retryAfter, Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS));
          if (!cancelled) setFailing(true);
        } else {
          const body = (await res.json()) as RoundDisplayState;
          failures = 0;
          if (!cancelled) {
            setState(body);
            setFailing(false);
            setMissing(false);
          }
        }
      } catch {
        failures += 1;
        wait = Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
        if (!cancelled) setFailing(true);
      }
      if (!cancelled) timer = window.setTimeout(poll, wait);
    }

    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code]);

  // Keep the screen awake where the browser allows it. The lock is dropped
  // whenever the page is hidden, so it is asked for again on return.
  useEffect(() => {
    type WakeLock = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLock> } };
    let lock: WakeLock | null = null;
    const request = () => {
      if (document.visibilityState !== "visible" || !nav.wakeLock) return;
      nav.wakeLock
        .request("screen")
        .then((l) => {
          lock = l;
        })
        .catch(() => {});
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void lock?.release().catch(() => {});
    };
  }, []);

  return (
    <div className="stage-surface tv-surface fixed inset-0 overflow-hidden bg-stage-deep text-stage-fg">
      <div
        data-testid="tv-stage"
        className="absolute left-1/2 top-1/2 overflow-hidden bg-stage"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {missing ? (
          <Centered>
            <p className="text-[64px] font-semibold">No game with the code {code}</p>
            <p className="mt-6 text-[36px] text-stage-muted">Check the code on the host desk.</p>
          </Centered>
        ) : state ? (
          <Screen state={state} />
        ) : (
          <Centered>
            <p className="text-[48px] text-stage-muted">Connecting…</p>
          </Centered>
        )}

        {failing ? (
          <p
            role="status"
            className="absolute right-10 top-8 rounded-full bg-black/50 px-6 py-2 text-[28px] font-semibold text-stage-fg"
          >
            Reconnecting…
          </p>
        ) : null}
      </div>

      {canFullscreen && !fullscreen ? (
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}
          className="absolute bottom-4 right-4 z-10 min-h-11 rounded-xl bg-white/10 px-4 text-sm font-semibold"
        >
          Full screen
        </button>
      ) : null}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center px-24 text-center">{children}</div>;
}

function Screen({ state }: { state: RoundDisplayState }) {
  if (state.scoreboard && (state.scoreboardShown || state.status === "ENDED")) {
    return <ScoreboardScreen state={state} rows={state.scoreboard} />;
  }
  switch (state.status) {
    case "LOBBY":
      return <Lobby state={state} />;
    case "ROUND_OPEN":
      return <OpenRound state={state} />;
    case "ROUND_MARKING":
      return (
        <Centered>
          <p className="text-[40px] font-semibold uppercase tracking-[0.2em] text-gold">Round {state.roundNumber}</p>
          <p className="mt-6 font-serif text-[120px] leading-none">Answers are in</p>
        </Centered>
      );
    case "ROUND_REVEAL":
      return <Reveal state={state} />;
    default:
      return null;
  }
}

function Lobby({ state }: { state: RoundDisplayState }) {
  // Client component: window is defined by the time this renders.
  const joinUrl = buildJoinUrl(window.location.origin, state.code);
  const host = `${window.location.host}/play`;
  return (
    <div className="flex h-full items-center gap-24 px-28">
      <div className="min-w-0 flex-1">
        <p className="text-[40px] text-stage-muted">Join at</p>
        <p className="text-[64px] font-semibold">{host}</p>
        <p className="mt-10 text-[40px] text-stage-muted">with the code</p>
        <p className="font-mono text-[200px] font-bold leading-none tracking-[0.12em] text-gold">{state.code}</p>
        <ul className="mt-12 flex max-h-[220px] flex-wrap gap-4 overflow-hidden">
          {state.teams.map((team) => (
            <li key={team.name} dir="auto" className="rounded-full bg-white/10 px-6 py-2 text-[32px]">
              {team.name}
            </li>
          ))}
        </ul>
      </div>
      <div className="shrink-0 rounded-3xl bg-white p-8">
        <QRCode value={joinUrl} size={420} role="img" aria-label="Scan to join" />
      </div>
    </div>
  );
}

function questionSize(text: string) {
  if (text.length > 220) return "text-[48px]";
  if (text.length > 140) return "text-[60px]";
  if (text.length > 70) return "text-[72px]";
  return "text-[88px]";
}

function OpenRound({ state }: { state: RoundDisplayState }) {
  const total = state.totalQuestionsInRound;
  return (
    <div className="flex h-full flex-col px-24 py-16">
      <div className="flex items-center justify-between gap-8">
        <p className="text-[44px] font-semibold text-gold">
          {questionLabel(state.roundNumber, state.askedCount, total)}
        </p>
        <RoundCountdown countdown={state.countdown} serverNow={state.serverNow} className="text-[56px]" />
      </div>
      <Dots asked={state.askedCount} total={total} />
      {state.tvShowsAll ? (
        <ol className="mt-10 min-h-0 flex-1 space-y-6 overflow-hidden">
          {state.questions.map((q) => (
            <li key={q.id} className="flex gap-6 text-[40px] leading-tight">
              <span className="shrink-0 font-semibold text-gold">Q{q.index + 1}</span>
              <QuestionText as="span" text={q.text} className="min-w-0 text-start" />
            </li>
          ))}
        </ol>
      ) : (
        <BigQuestion code={state.code} question={state.questions[state.questions.length - 1] ?? null} />
      )}
    </div>
  );
}

function Dots({ asked, total }: { asked: number; total: number }) {
  return (
    <div className="mt-6 flex gap-4" aria-label={`${asked} of ${total} asked`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-5 w-5 rounded-full ${i < asked ? "bg-gold" : "border-2 border-white/25"}`}
        />
      ))}
    </div>
  );
}

function BigQuestion({ code, question }: { code: string; question: RoundQuestionView | null }) {
  if (!question) return null;
  return (
    <div className="mt-10 flex min-h-0 flex-1 gap-12">
      <div className="flex min-w-0 flex-1 flex-col">
        <QuestionText
          text={question.text}
          as="h1"
          className={`font-serif leading-[1.1] text-start ${questionSize(question.text)}`}
        />
        {question.type === "MULTIPLE_CHOICE" && question.options.length > 0 ? (
          <ul className="mt-10 grid grid-cols-2 gap-6">
            {question.options.map((option, i) => (
              <li key={option} className="flex gap-4 rounded-2xl bg-white/10 px-8 py-5 text-[44px]">
                <span className="font-semibold text-gold">{String.fromCharCode(65 + i)}</span>
                <span dir="auto" className="min-w-0">
                  {option}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {question.hasMedia ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own API route, not a next/image-optimizable asset
        <img
          src={questionMediaUrl(question.id, { code, display: true })}
          alt=""
          className="max-h-[720px] max-w-[760px] shrink-0 self-start rounded-3xl bg-white object-contain"
        />
      ) : null}
    </div>
  );
}

function Reveal({ state }: { state: RoundDisplayState }) {
  const total = state.totalQuestionsInRound;
  const all = state.revealedCount >= total;
  if (all) {
    return (
      <div className="flex h-full flex-col px-24 py-16">
        <p className="text-[44px] font-semibold text-gold">Round {state.roundNumber}: the answers</p>
        <ol className="mt-10 min-h-0 flex-1 space-y-5 overflow-hidden">
          {state.questions.map((q) => (
            <li key={q.id} className="flex gap-6 text-[36px] leading-tight">
              <span className="shrink-0 font-semibold text-gold">Q{q.index + 1}</span>
              <span className="min-w-0 flex-1">
                <QuestionText as="span" text={q.text} className="block text-start text-stage-muted" />
                <span dir="auto" className="block font-semibold">
                  {q.answer}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  const question = state.questions[state.questions.length - 1];
  if (!question) return null;
  return (
    <div className="flex h-full flex-col px-24 py-16">
      <p className="text-[44px] font-semibold text-gold">
        {questionLabel(state.roundNumber, question.index + 1, total)}
      </p>
      <QuestionText
        text={question.text}
        as="h1"
        className={`mt-10 font-serif leading-[1.1] text-start ${questionSize(question.text)}`}
      />
      <p className="mt-12 rounded-3xl bg-emerald-500/20 px-10 py-8 text-[72px] font-semibold text-emerald-100">
        <span dir="auto">{question.answer}</span>
      </p>
    </div>
  );
}

function ScoreboardScreen({ state, rows }: { state: RoundDisplayState; rows: ScoreboardRow[] }) {
  const ended = state.status === "ENDED";
  return (
    <div className="flex h-full flex-col px-24 py-16">
      <p className="text-[56px] font-semibold text-gold">{ended ? "Final scores" : "Scoreboard"}</p>
      {noScoresYet(state) ? (
        <p className="mt-10 font-serif text-[72px] leading-[1.1] text-stage-muted">{NO_SCORES_YET}</p>
      ) : (
        <ol className="mt-10 grid min-h-0 flex-1 grid-flow-col grid-rows-8 gap-x-12 gap-y-4 overflow-hidden">
          {rows.map((row) => (
            <li key={row.teamId} className="flex items-center gap-6 rounded-2xl bg-white/10 px-8 text-[40px]">
              <span className="w-16 shrink-0 font-semibold tabular-nums text-gold">{rankOf(rows, row.teamId)}</span>
              <span dir="auto" className="min-w-0 flex-1 truncate">
                {row.name}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{row.score}</span>
            </li>
          ))}
        </ol>
      )}
      {ended ? (
        <p className="mt-8 flex items-center justify-center gap-[0.35em] text-[32px] text-stage-muted">
          Made with <Wordmark />
        </p>
      ) : null}
    </div>
  );
}
