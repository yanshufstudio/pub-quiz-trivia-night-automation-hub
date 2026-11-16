"use client";

import { useState } from "react";
import { QuestionText } from "@/components/QuestionText";
import { RoundCountdown } from "@/components/RoundCountdown";
import { Scoreboard } from "@/components/Scoreboard";
import type { RoundQuestionView, RoundTeamState } from "@/lib/api-types";
import { questionLabel } from "@/lib/question-number";
import { questionMediaUrl } from "@/lib/question-media-url";
import { noScoresYet } from "@/lib/scoreboard-summary";
import type { StoredTeam } from "@/lib/team-session";
import { errorText } from "@/i18n";
import { useT } from "@/i18n/react";

/**
 * A team's phone in a round-mode game (RM8).
 *
 * While the round is open the phone shows every question asked so far in it,
 * newest at the top and open, earlier ones folded away; each has its own answer
 * box, says "Saved" once the server has it, and can be changed until the host
 * closes the round. Then it locks ("Answers are in"), and as the host reveals,
 * each question shows the right answer and this team's own mark, and the round
 * total once the whole round is out. The scoreboard appears only while the host
 * is showing it.
 */
export function RoundTeamPlay({
  state,
  team,
  onChanged,
}: {
  state: RoundTeamState;
  team: StoredTeam;
  onChanged: () => Promise<void>;
}) {
  const t = useT();
  // Unsaved edits, keyed by round and question so a new round starts clean.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = state.status === "ROUND_OPEN";
  const key = (qi: number) => `${state.roundNumber}:${qi}`;
  const saved = (qi: number) => state.myAnswers.find((a) => a.questionIndex === qi) ?? null;

  async function save(qi: number, text: string) {
    setSaving(qi);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${team.code}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: team.token, questionIndex: qi, text: text.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(t, data, "team.couldNotSave"));
      await onChanged();
      setDrafts((d) => {
        const next = { ...d };
        delete next[key(qi)];
        return next;
      });
    } catch (err) {
      // A fetch that never reached the server rejects with a TypeError whose
      // text is the browser's own ("Failed to fetch", "Load failed").
      const offline = err instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);
      setError(
        offline ? t("team.noConnection") : err instanceof Error ? err.message : t("team.couldNotSave")
      );
    } finally {
      setSaving(null);
    }
  }

  if (state.status === "LOBBY") {
    return (
      <div className="flex flex-1 flex-col">
        <h2 className="font-serif text-3xl font-semibold" dir="auto">
          {t("team.youreIn", { team: state.teamName })}
        </h2>
        <p className="mt-3 text-lg text-stage-muted">{t("team.waitingForHost")}</p>
      </div>
    );
  }

  // The ending is TeamPortal's EndedPanel, the same in both modes.
  if (state.status === "ENDED") return null;

  // Newest first: the question the host has just asked is the one on top.
  // During the reveal the answer just revealed goes on top instead — newest
  // first had it sinking under cards not revealed yet — and the rest of the
  // revealed ones follow it, then the unrevealed ones in the order they will
  // come out.
  const revealing = state.status === "ROUND_REVEAL";
  const revealed = state.questions.filter((q) => q.answer !== null).reverse();
  const ordered = revealing
    ? [...revealed, ...state.questions.filter((q) => q.answer === null)]
    : [...state.questions].reverse();
  const justRevealedId = revealing ? (revealed[0]?.id ?? null) : null;
  const scoreboard = state.scoreboard ? <ScoreboardPanel state={state} title={t("common.scoreboard")} /> : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold" dir="auto">
          {[t("common.roundN", { round: state.roundNumber }), state.round?.title].filter((part) => part != null).join(t("common.partsSeparator"))}
        </p>
        {open ? <RoundCountdown countdown={state.countdown} serverNow={state.serverNow} /> : null}
      </div>

      {state.sitsOutRound ? (
        // Joined after the round closed: nothing of it to show, only when to play.
        <p className="mt-4 rounded-2xl bg-white/5 px-4 py-4 text-lg font-semibold">
          <span dir="auto">{t("team.youreIn", { team: state.teamName })}</span>{" "}
          {state.roundNumber < state.totalRounds
            ? t("team.playFromRound", { round: state.roundNumber + 1 })
            : t("team.lastRound")}
        </p>
      ) : state.status === "ROUND_MARKING" ? (
        <p className="mt-4 rounded-2xl bg-white/5 px-4 py-4 text-lg font-semibold">
          {t("team.answersIn")}
        </p>
      ) : null}
      {state.status === "ROUND_REVEAL" && state.myRoundTotal !== null ? (
        <p className="mt-4 rounded-2xl bg-gold/15 px-4 py-4 text-lg font-semibold">
          {t("team.roundTotal", {
            round: state.roundNumber,
            points: t("common.points", { count: state.myRoundTotal }),
          })}
        </p>
      ) : null}
      {error ? <p className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      {/* During the reveal the scoreboard the host is showing sits under the
          round total, where a phone sees it without scrolling past the round. */}
      {revealing ? scoreboard : null}

      <ol className="mt-4 space-y-3">
        {ordered.map((question, i) => (
          <li key={question.id}>
            <QuestionCard
              question={question}
              label={questionLabel(t, state.roundNumber, question.index + 1)}
              team={team}
              newest={i === 0}
              justRevealed={question.id === justRevealedId}
              open={open}
              saved={saved(question.index)}
              draft={drafts[key(question.index)]}
              saving={saving === question.index}
              onDraft={(text) => setDrafts((d) => ({ ...d, [key(question.index)]: text }))}
              onSave={(text) => void save(question.index, text)}
            />
          </li>
        ))}
      </ol>

      {revealing ? null : scoreboard}
    </div>
  );
}

function QuestionCard({
  question,
  label,
  team,
  newest,
  justRevealed,
  open,
  saved,
  draft,
  saving,
  onDraft,
  onSave,
}: {
  question: RoundQuestionView;
  label: string;
  team: StoredTeam;
  newest: boolean;
  justRevealed: boolean;
  open: boolean;
  saved: RoundTeamState["myAnswers"][number] | null;
  draft: string | undefined;
  saving: boolean;
  onDraft: (text: string) => void;
  onSave: (text: string) => void;
}) {
  const t = useT();
  const value = draft ?? saved?.text ?? "";
  const unsaved = draft !== undefined && draft !== (saved?.text ?? "");
  const revealed = question.answer !== null;

  const body = (
    <div className="mt-3">
      <QuestionText text={question.text} as="h2" className="font-serif text-xl font-semibold leading-snug" />
      {question.hasMedia ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own API route, not a next/image-optimizable asset
        <img
          src={questionMediaUrl(question.id, { code: team.code, token: team.token })}
          alt=""
          className="mx-auto mt-3 max-h-64 rounded-xl border border-white/15"
        />
      ) : null}

      {open ? (
        question.type === "MULTIPLE_CHOICE" ? (
          <div className="mt-4 grid gap-2" role="group" aria-label={t("team.options", { label })}>
            {question.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={saving}
                aria-pressed={saved?.text === option}
                onClick={() => onSave(option)}
                className={`min-h-12 rounded-xl border px-4 text-start text-lg font-medium ${
                  saved?.text === option ? "border-gold bg-gold text-stage" : "border-white/15 bg-white text-stage"
                }`}
              >
                <span dir="auto">{option}</span>
              </button>
            ))}
          </div>
        ) : (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (value.trim()) onSave(value);
            }}
          >
            <input
              aria-label={t("team.answerTo", { label })}
              value={value}
              maxLength={500}
              dir="auto"
              onChange={(e) => onDraft(e.target.value)}
              className="h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-white px-3 text-lg text-stage outline-none focus:ring-2 focus:ring-gold"
            />
            <button
              type="submit"
              disabled={saving || !value.trim() || !unsaved}
              className="h-12 min-h-12 rounded-xl bg-gold px-4 text-base font-semibold text-stage disabled:opacity-40"
            >
              {saving ? t("team.saving") : t("team.save")}
            </button>
          </form>
        )
      ) : saved ? (
        <p className="mt-3 text-lg">{t.rich("team.youSaid", { answer: <span dir="auto">{saved.text}</span> })}</p>
      ) : revealed ? null : (
        // Once revealed, the verdict below says "No answer"; saying it here too doubled it.
        <p className="mt-3 text-lg">
          <span className="text-stage-muted">{t("team.noAnswer")}</span>
        </p>
      )}

      {open ? (
        <p className="mt-2 text-sm text-stage-muted" aria-live="polite">
          {/* While saving, say so: a poll can bring the saved answer back
              before the save itself answers, and the line said "Saved"
              beside a button still saying "Saving…". */}
          {saving
            ? t("team.saving")
            : unsaved
              ? t("team.notSavedYet")
              : saved
                ? t("team.saved")
                : t("team.notAnsweredYet")}
        </p>
      ) : null}

      {revealed ? (
        <div
          className={`mt-3 rounded-xl px-3 py-3 ${
            saved?.isCorrect ? "bg-emerald-500/15 text-emerald-100" : "bg-red-500/15 text-red-100"
          }`}
        >
          <p className="text-sm font-semibold uppercase tracking-wide">
            {saved
              ? saved.isCorrect
                ? t("team.correctPoints", { points: saved.pointsAwarded ?? 0 })
                : t("team.notThisTime")
              : t("team.noAnswer")}
          </p>
          <p className="mt-1 text-lg font-semibold">
            {t.rich("team.answer", { answer: <span dir="auto">{question.answer}</span> })}
          </p>
        </div>
      ) : null}
    </div>
  );

  // Folding is for the open round, where the newest question is the one being
  // answered; once the round closes every question is shown as it is marked.
  if (newest || !open) {
    return (
      <section
        className={`rounded-2xl p-4 ${(newest && open) || justRevealed ? "bg-white/10 ring-1 ring-gold/40" : "bg-white/5"}`}
      >
        <p className="flex items-center justify-between gap-2 text-sm font-semibold text-gold">
          <span>{label}</span>
          {justRevealed ? (
            <span className="rounded-full bg-gold px-2 py-0.5 text-xs uppercase tracking-wide text-stage">
              {t("team.justRevealed")}
            </span>
          ) : null}
        </p>
        {body}
      </section>
    );
  }
  return (
    <details className="rounded-2xl bg-white/5 p-4">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-semibold">
        <span className="text-gold">{label}</span>
        <span className="text-stage-muted">
          {unsaved ? t("team.notSavedYet") : saved ? t("team.saved") : open ? t("team.notAnsweredYet") : ""}
        </span>
      </summary>
      {body}
    </details>
  );
}

function ScoreboardPanel({ state, title }: { state: RoundTeamState; title: string }) {
  const t = useT();
  return (
    <section className="mt-8 rounded-2xl bg-white/5 p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {noScoresYet(state) ? (
        <p className="text-stage-muted">{t("common.noScoresYet")}</p>
      ) : (
        <Scoreboard rows={state.scoreboard ?? []} highlightName={state.teamName} dark />
      )}
    </section>
  );
}
