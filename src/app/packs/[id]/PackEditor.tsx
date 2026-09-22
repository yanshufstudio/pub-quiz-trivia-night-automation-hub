"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Pack, Question, QuestionType, Round } from "@/lib/api-types";
import { writeHostToken } from "@/lib/host-session";
import { SITE_URL } from "@/lib/site";

type Draft = Pick<Question, "text" | "answer" | "points" | "type" | "options"> & {
  // Kept as the raw comma-separated text the host is typing, not a parsed
  // string[] — splitting on every keystroke would fight the host's typing
  // (e.g. trailing ", " while starting the next entry). Only split/cleaned
  // right before it goes into the PATCH request body, in saveQuestion.
  acceptableAnswersText: string;
};

function draftsEqual(a: Draft, b: Draft): boolean {
  return (
    a.text === b.text &&
    a.answer === b.answer &&
    a.points === b.points &&
    a.type === b.type &&
    a.acceptableAnswersText === b.acceptableAnswersText &&
    a.options.length === b.options.length &&
    a.options.every((o, i) => o === b.options[i])
  );
}

/** Same rule the PATCH route enforces server-side — checked here too so we
 * only attempt an immediate save (add/remove/mark-correct option) once the
 * draft is actually valid, instead of firing a network call that's certain
 * to 400 while the host is still mid-edit (e.g. a freshly added blank row). */
function isDraftSaveable(draft: Draft): boolean {
  if (!draft.text.trim() || !draft.answer.trim()) return false;
  if (draft.type === "MULTIPLE_CHOICE") {
    const cleaned = Array.from(new Set(draft.options.map((o) => o.trim()).filter(Boolean)));
    return cleaned.length >= 2 && cleaned.includes(draft.answer);
  }
  return true;
}

function draftFromQuestion(q: Question): Draft {
  return {
    text: q.text,
    answer: q.answer,
    points: q.points,
    type: q.type,
    options: q.options,
    acceptableAnswersText: q.acceptableAnswers.join(", "),
  };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/** `canEdit` false = a shared (ownerless) pack, or one another creator owns:
 * every field is shown read-only and the add/delete/reorder controls are
 * hidden. The server enforces the same rule (403) — this only keeps the UI
 * honest about it. Export, print and starting a session stay available. */
export function PackEditor({ pack, canEdit }: { pack: Pack; canEdit: boolean }) {
  const router = useRouter();
  // The pack's own structure (which rounds, which questions, in what order)
  // lives in state, separate from `drafts` below (which only tracks each
  // existing question's in-progress field edits) — add/delete/reorder change
  // *this*, never `drafts` directly.
  const [rounds, setRounds] = useState<Round[]>(pack.rounds);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(pack.rounds.flatMap((round) => round.questions.map((q) => [q.id, draftFromQuestion(q)])))
  );
  const [saved, setSaved] = useState<Record<string, Draft>>(() => ({ ...drafts }));
  const [status, setStatus] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two-step confirm for destructive actions (delete question/round): the
  // first click arms it (stores a "q:<id>" or "r:<id>" tag here), a second
  // click on the same button while armed actually performs the delete. No
  // native confirm() dialog, matching the rest of the app's UI.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  // "" means no timer (manual reveal) — kept as the default so a host who
  // never touches this still gets the exact behavior the app shipped with
  // before per-question timers existed.
  const [duration, setDuration] = useState("");
  // Per-question image state, keyed by question id. `mediaVersion` busts the
  // browser cache after an attach/replace — the served bytes change but the
  // URL wouldn't, since it's just the question id (see the ETag/Cache-Control
  // on GET /api/questions/[id]/media, which otherwise revalidate to the old
  // image for the rest of this page's life).
  const [mediaBusy, setMediaBusy] = useState<Record<string, boolean>>({});
  const [mediaError, setMediaError] = useState<Record<string, string | null>>({});
  const [mediaVersion, setMediaVersion] = useState<Record<string, number>>({});

  function mediaUrl(questionId: string) {
    return `/api/questions/${questionId}/media?v=${mediaVersion[questionId] ?? 0}`;
  }

  function setQuestionHasMedia(roundId: string, questionId: string, hasMedia: boolean) {
    setRounds((current) =>
      current.map((round) =>
        round.id === roundId
          ? { ...round, questions: round.questions.map((q) => (q.id === questionId ? { ...q, hasMedia } : q)) }
          : round
      )
    );
  }

  async function uploadQuestionMedia(roundId: string, questionId: string, file: File) {
    setMediaError((current) => ({ ...current, [questionId]: null }));
    setMediaBusy((current) => ({ ...current, [questionId]: true }));
    try {
      // The route's body is the raw image — no multipart, no JSON envelope
      // (see the POST handler's own comment) — so the file's bytes go
      // straight through as the request body.
      const res = await fetch(`/api/questions/${questionId}/media`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: await file.arrayBuffer(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMediaError((current) => ({ ...current, [questionId]: data.error ?? "Could not upload image" }));
        return;
      }
      setQuestionHasMedia(roundId, questionId, true);
      setMediaVersion((current) => ({ ...current, [questionId]: (current[questionId] ?? 0) + 1 }));
    } catch {
      setMediaError((current) => ({ ...current, [questionId]: "Could not upload image" }));
    } finally {
      setMediaBusy((current) => ({ ...current, [questionId]: false }));
    }
  }

  async function removeQuestionMedia(roundId: string, questionId: string) {
    setMediaError((current) => ({ ...current, [questionId]: null }));
    setMediaBusy((current) => ({ ...current, [questionId]: true }));
    try {
      const res = await fetch(`/api/questions/${questionId}/media`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMediaError((current) => ({ ...current, [questionId]: data.error ?? "Could not remove image" }));
        return;
      }
      setQuestionHasMedia(roundId, questionId, false);
    } catch {
      setMediaError((current) => ({ ...current, [questionId]: "Could not remove image" }));
    } finally {
      setMediaBusy((current) => ({ ...current, [questionId]: false }));
    }
  }

  const questionCount = useMemo(() => rounds.reduce((sum, round) => sum + round.questions.length, 0), [rounds]);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
    setStatus((current) => ({ ...current, [id]: "idle" }));
  }

  /** For interactions that should save immediately (toggling type, adding /
   * removing / marking an option) rather than waiting for a blur — but only
   * once the resulting draft is actually valid, so mid-edit states never
   * flash an error. Takes the next draft explicitly rather than reading
   * `drafts[id]` back after a `setDrafts` call, since that state update
   * hasn't flushed yet when this runs. */
  function commit(id: string, patch: Partial<Draft>) {
    const next: Draft = { ...drafts[id], ...patch };
    setDrafts((current) => ({ ...current, [id]: next }));
    setStatus((current) => ({ ...current, [id]: "idle" }));
    if (isDraftSaveable(next)) void saveQuestion(id, next);
  }

  async function saveQuestion(id: string, override?: Draft) {
    const draft = override ?? drafts[id];
    const previous = saved[id];
    if (!draft || !previous) return;
    if (draftsEqual(draft, previous)) return;
    if (!isDraftSaveable(draft)) {
      setStatus((current) => ({ ...current, [id]: "error" }));
      return;
    }

    setStatus((current) => ({ ...current, [id]: "saving" }));
    const res = await fetch(`/api/questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: draft.text,
        answer: draft.answer,
        points: draft.points,
        type: draft.type,
        options: draft.type === "MULTIPLE_CHOICE" ? draft.options.map((o) => o.trim()).filter(Boolean) : undefined,
        acceptableAnswers: draft.acceptableAnswersText
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      }),
    });
    if (!res.ok) {
      setStatus((current) => ({ ...current, [id]: "error" }));
      return;
    }
    setSaved((current) => ({ ...current, [id]: draft }));
    setStatus((current) => ({ ...current, [id]: "saved" }));
  }

  function setQuestionType(id: string, type: QuestionType) {
    const draft = drafts[id];
    if (type === draft.type) return;
    if (type === "MULTIPLE_CHOICE") {
      // Seed with the current answer as the first (correct) option, plus one
      // blank slot to fill in — left as a local, unsaved edit until the host
      // fills that second option in (see isDraftSaveable). Alternate answers
      // don't apply once correctness is defined by an explicit option list
      // (the PATCH route clears them server-side too), so drop them here so
      // the UI doesn't show a stale value it's about to hide anyway.
      updateDraft(id, {
        type,
        options: draft.options.length >= 2 ? draft.options : [draft.answer, ""],
        acceptableAnswersText: "",
      });
    } else {
      // TEXT is always immediately valid (text/answer/points are unchanged),
      // so this one saves right away, clearing the now-irrelevant options.
      commit(id, { type, options: [] });
    }
  }

  function updateOption(id: string, optionIndex: number, text: string) {
    const draft = drafts[id];
    const wasCorrect = draft.options[optionIndex] === draft.answer;
    const nextOptions = draft.options.map((o, i) => (i === optionIndex ? text : o));
    updateDraft(id, { options: nextOptions, answer: wasCorrect ? text : draft.answer });
  }

  function markOptionCorrect(id: string, optionIndex: number) {
    const draft = drafts[id];
    commit(id, { answer: draft.options[optionIndex] });
  }

  function addOption(id: string) {
    const draft = drafts[id];
    if (draft.options.length >= 6) return;
    updateDraft(id, { options: [...draft.options, ""] });
  }

  function removeOption(id: string, optionIndex: number) {
    const draft = drafts[id];
    if (draft.options.length <= 2) return;
    const removedText = draft.options[optionIndex];
    const nextOptions = draft.options.filter((_, i) => i !== optionIndex);
    commit(id, { options: nextOptions, answer: removedText === draft.answer ? nextOptions[0] : draft.answer });
  }

  async function addQuestion(roundId: string) {
    setError(null);
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not add question");
      return;
    }
    const question: Question = data.question;
    setRounds((current) =>
      current.map((round) =>
        round.id === roundId ? { ...round, questions: [...round.questions, question] } : round
      )
    );
    const draft = draftFromQuestion(question);
    setDrafts((current) => ({ ...current, [question.id]: draft }));
    setSaved((current) => ({ ...current, [question.id]: draft }));
  }

  async function deleteQuestion(roundId: string, questionId: string) {
    const tag = `q:${questionId}`;
    if (confirmingDelete !== tag) {
      setConfirmingDelete(tag);
      return;
    }
    setError(null);
    const res = await fetch(`/api/questions/${questionId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not delete question");
      setConfirmingDelete(null);
      return;
    }
    setRounds((current) =>
      current.map((round) =>
        round.id === roundId
          ? {
              ...round,
              questions: round.questions.filter((q) => q.id !== questionId).map((q, i) => ({ ...q, index: i })),
            }
          : round
      )
    );
    setDrafts((current) => omitKey(current, questionId));
    setSaved((current) => omitKey(current, questionId));
    setStatus((current) => omitKey(current, questionId));
    setConfirmingDelete(null);
  }

  async function deleteRound(roundId: string) {
    const tag = `r:${roundId}`;
    if (confirmingDelete !== tag) {
      setConfirmingDelete(tag);
      return;
    }
    setError(null);
    const res = await fetch(`/api/rounds/${roundId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not delete round");
      setConfirmingDelete(null);
      return;
    }
    const removedIds = rounds.find((r) => r.id === roundId)?.questions.map((q) => q.id) ?? [];
    setRounds((current) => current.filter((r) => r.id !== roundId).map((r, i) => ({ ...r, index: i })));
    setDrafts((current) => removedIds.reduce(omitKey, current));
    setSaved((current) => removedIds.reduce(omitKey, current));
    setStatus((current) => removedIds.reduce(omitKey, current));
    setConfirmingDelete(null);
  }

  async function moveRound(roundId: string, direction: "up" | "down") {
    setError(null);
    const res = await fetch(`/api/rounds/${roundId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not reorder round");
      return;
    }
    if (!data.moved) return;
    setRounds((current) => {
      const i = current.findIndex((r) => r.id === roundId);
      const j = direction === "up" ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= current.length) return current;
      const next = [...current];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((r, idx) => ({ ...r, index: idx }));
    });
  }

  async function startSession() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId: pack.id,
          questionDurationSeconds: duration ? Number(duration) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start session");
      writeHostToken(data.session.code, data.hostToken);
      router.push(`/host/${data.session.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session");
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            <Link href="/packs" className="hover:text-foreground">
              Packs
            </Link>
            <span className="px-2">/</span>
            Editor
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">{pack.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {pack.rounds.length} rounds · {questionCount} questions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/packs/${pack.id}/export`}
            download
            className="inline-flex h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold"
          >
            Export JSON
          </a>
          <Link
            href={`/packs/${pack.id}/print`}
            className="inline-flex h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold"
          >
            Print preview
          </Link>
          <label className="flex items-center gap-2 text-sm text-muted">
            <span className="sr-only">Per-question timer</span>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="h-11 rounded-xl border border-line bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-amber"
            >
              <option value="">No timer (manual reveal)</option>
              <option value="20">20s per question</option>
              <option value="30">30s per question</option>
              <option value="45">45s per question</option>
              <option value="60">60s per question</option>
            </select>
          </label>
          <button
            type="button"
            onClick={startSession}
            disabled={starting}
            className="inline-flex h-11 items-center rounded-xl bg-amber px-4 text-sm font-semibold text-white hover:bg-amber-hover disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start live session"}
          </button>
        </div>
      </div>

      {/* What that amber button actually does, said once, here, where it is
          about to be pressed. Nothing on the site explained that the host
          screen and the team phones are two different surfaces, so the first
          time most hosts found out was during a quiz night. */}
      <p className="mt-3 text-sm text-muted">
        <strong className="font-semibold text-foreground">Start live session</strong> opens your host
        screen with a five-character code teams enter at{" "}
        <span className="font-semibold">{SITE_URL.replace(/^https:\/\//, "")}/play</span>.{" "}
        <Link className="font-medium text-amber hover:underline" href="/how-it-works">
          How to run a quiz night
        </Link>
      </p>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      {!canEdit ? (
        <p className="mt-4 rounded-lg border border-line bg-white px-3 py-2 text-sm text-muted" role="note">
          This is a shared pack, so it&apos;s read-only here. Export JSON, then import it from the packs list to get your
          own editable copy.
        </p>
      ) : null}

      <div className="mt-8 space-y-8">
        {rounds.map((round, roundIndex) => (
          <section key={round.id} className="paper-sheet rounded-xl border border-line p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber">
                  Round {round.index + 1}
                </p>
                <h2 className="mt-1 text-xl font-semibold">{round.title}</h2>
                <p className="text-sm text-muted">{round.category}</p>
              </div>
              {canEdit ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => moveRound(round.id, "up")}
                  disabled={roundIndex === 0}
                  aria-label="Move round up"
                  className="h-9 w-9 rounded-lg border border-line text-muted disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveRound(round.id, "down")}
                  disabled={roundIndex === rounds.length - 1}
                  aria-label="Move round down"
                  className="h-9 w-9 rounded-lg border border-line text-muted disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => deleteRound(round.id)}
                  disabled={rounds.length <= 1}
                  className={`h-9 rounded-lg border px-3 text-xs font-semibold disabled:opacity-30 ${
                    confirmingDelete === `r:${round.id}`
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-line text-muted"
                  }`}
                  title={rounds.length <= 1 ? "A pack needs at least one round" : undefined}
                >
                  {confirmingDelete === `r:${round.id}` ? "Confirm delete round?" : "Delete round"}
                </button>
                {confirmingDelete === `r:${round.id}` ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(null)}
                    className="h-9 rounded-lg px-2 text-xs font-semibold text-muted"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              ) : null}
            </div>

            <ul className="mt-5 space-y-6">
              {round.questions.map((question) => {
                const draft = drafts[question.id];
                const saveState = status[question.id] ?? "idle";
                return (
                  <li key={question.id} className="grid gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">Q{question.index + 1}</span>
                        {canEdit ? (
                        <div className="flex rounded-lg border border-line bg-white p-0.5 text-xs font-medium">
                          <button
                            type="button"
                            onClick={() => setQuestionType(question.id, "TEXT")}
                            className={`rounded-md px-2.5 py-1 ${
                              draft.type === "TEXT" ? "bg-foreground text-background" : "text-muted"
                            }`}
                          >
                            Free text
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuestionType(question.id, "MULTIPLE_CHOICE")}
                            className={`rounded-md px-2.5 py-1 ${
                              draft.type === "MULTIPLE_CHOICE" ? "bg-foreground text-background" : "text-muted"
                            }`}
                          >
                            Multiple choice
                          </button>
                        </div>
                        ) : (
                          <span className="text-xs text-muted">
                            {draft.type === "MULTIPLE_CHOICE" ? "Multiple choice" : "Free text"}
                          </span>
                        )}
                      </div>
                      {canEdit ? (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted">
                          {saveState === "saving"
                            ? "Saving…"
                            : saveState === "saved"
                              ? "Saved"
                              : saveState === "error"
                                ? "Couldn’t save"
                                : "Edits save on blur"}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteQuestion(round.id, question.id)}
                          disabled={round.questions.length <= 1}
                          className={`h-8 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-30 ${
                            confirmingDelete === `q:${question.id}`
                              ? "border-red-300 bg-red-50 text-red-700"
                              : "border-line text-muted"
                          }`}
                          title={round.questions.length <= 1 ? "A round needs at least one question" : undefined}
                        >
                          {confirmingDelete === `q:${question.id}` ? "Confirm?" : "Delete"}
                        </button>
                        {confirmingDelete === `q:${question.id}` ? (
                          <button
                            type="button"
                            onClick={() => setConfirmingDelete(null)}
                            className="text-xs font-semibold text-muted"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                      ) : null}
                    </div>
                    <label className="block">
                      <span className="sr-only">Question text</span>
                      <textarea
                        value={draft.text}
                        onChange={(e) => updateDraft(question.id, { text: e.target.value })}
                        onBlur={() => saveQuestion(question.id)}
                        readOnly={!canEdit}
                        rows={2}
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-amber"
                      />
                    </label>

                    {draft.type === "MULTIPLE_CHOICE" ? (
                      <div className="grid gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted">
                          Options — mark the correct one
                        </span>
                        {draft.options.map((option, i) => (
                          <div key={i} className="flex items-center gap-2">
                            {/* The 44px label is the tap target; the radio itself stays small. */}
                            <label className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                              <input
                                type="radio"
                                name={`correct-${question.id}`}
                                checked={option === draft.answer && option.trim().length > 0}
                                onChange={() => markOptionCorrect(question.id, i)}
                                disabled={!canEdit || !option.trim()}
                                className="h-5 w-5 accent-amber"
                                aria-label={`Option ${i + 1} is correct`}
                              />
                            </label>
                            <input
                              value={option}
                              onChange={(e) => updateOption(question.id, i, e.target.value)}
                              onBlur={() => saveQuestion(question.id)}
                              readOnly={!canEdit}
                              placeholder={`Option ${i + 1}`}
                              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-amber"
                            />
                            {canEdit ? (
                            <button
                              type="button"
                              onClick={() => removeOption(question.id, i)}
                              disabled={draft.options.length <= 2}
                              className="h-10 w-10 shrink-0 rounded-lg border border-line text-muted disabled:opacity-30"
                              aria-label={`Remove option ${i + 1}`}
                            >
                              ×
                            </button>
                            ) : null}
                          </div>
                        ))}
                        {canEdit ? (
                        <button
                          type="button"
                          onClick={() => addOption(question.id)}
                          disabled={draft.options.length >= 6}
                          className="mt-1 h-9 w-fit rounded-lg border border-dashed border-line px-3 text-xs font-semibold text-muted disabled:opacity-40"
                        >
                          + Add option
                        </button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                      {draft.type === "TEXT" ? (
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                            Answer
                          </span>
                          <input
                            value={draft.answer}
                            onChange={(e) => updateDraft(question.id, { answer: e.target.value })}
                            onBlur={() => saveQuestion(question.id)}
                            readOnly={!canEdit}
                            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-base outline-none focus:ring-2 focus:ring-amber"
                          />
                        </label>
                      ) : (
                        <div />
                      )}
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                          Points
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={draft.points}
                          onChange={(e) =>
                            updateDraft(question.id, { points: Number(e.target.value) || 1 })
                          }
                          onBlur={() => saveQuestion(question.id)}
                          readOnly={!canEdit}
                          className="h-11 w-full rounded-lg border border-line bg-white px-3 text-base outline-none focus:ring-2 focus:ring-amber"
                        />
                      </label>
                    </div>

                    {draft.type === "TEXT" ? (
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                          Alternate answers (comma-separated)
                        </span>
                        <input
                          value={draft.acceptableAnswersText}
                          onChange={(e) => updateDraft(question.id, { acceptableAnswersText: e.target.value })}
                          onBlur={() => saveQuestion(question.id)}
                          readOnly={!canEdit}
                          placeholder="e.g. Leo, Leonardo"
                          className="h-11 w-full rounded-lg border border-line bg-white px-3 text-base outline-none focus:ring-2 focus:ring-amber"
                        />
                        <span className="mt-1 block text-xs text-muted">
                          Also scored correct alongside the answer above — nicknames, alternate spellings, etc.
                        </span>
                      </label>
                    ) : null}

                    <div className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted">Image</span>
                      <div className="flex flex-wrap items-center gap-3">
                        {question.hasMedia ? (
                          // eslint-disable-next-line @next/next/no-img-element -- served from our own API route, not next/image-optimizable
                          <img
                            src={mediaUrl(question.id)}
                            alt=""
                            className="h-20 w-28 rounded-lg border border-line object-contain bg-white"
                          />
                        ) : canEdit ? (
                          <span className="text-xs text-muted">No image attached</span>
                        ) : null}
                        {canEdit ? (
                          <>
                            <label
                              className={`inline-flex h-9 cursor-pointer items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold ${
                                mediaBusy[question.id] ? "opacity-50" : ""
                              }`}
                            >
                              {mediaBusy[question.id] ? "Uploading…" : question.hasMedia ? "Replace image" : "Add image"}
                              <input
                                type="file"
                                accept="image/png,image/jpeg"
                                className="sr-only"
                                disabled={mediaBusy[question.id]}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file) void uploadQuestionMedia(round.id, question.id, file);
                                }}
                              />
                            </label>
                            {question.hasMedia ? (
                              <button
                                type="button"
                                onClick={() => removeQuestionMedia(round.id, question.id)}
                                disabled={mediaBusy[question.id]}
                                className="h-9 rounded-lg border border-line px-3 text-xs font-semibold text-muted disabled:opacity-50"
                              >
                                Remove
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                      {mediaError[question.id] ? (
                        <p className="text-xs text-red-700">{mediaError[question.id]}</p>
                      ) : null}
                      <span className="text-xs text-muted">JPEG or PNG, up to 2 MB.</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {canEdit ? (
            <button
              type="button"
              onClick={() => addQuestion(round.id)}
              className="mt-5 h-10 w-fit rounded-lg border border-dashed border-line px-4 text-sm font-semibold text-muted"
            >
              + Add question
            </button>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
