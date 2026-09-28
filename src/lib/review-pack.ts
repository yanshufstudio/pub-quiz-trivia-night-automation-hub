import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, isAnthropicCreditExhausted } from "@/lib/anthropic";
import { callOptions, usageOf, type CallUsage, type ModelCallConfig } from "@/lib/model-call";
import { degradeInvalidMultipleChoice, type GeneratedPack, type GeneratedQuestion } from "@/lib/quiz-schema";
import { QUESTION_TYPE } from "@/lib/question-types";
import { isLikelyCorrect } from "@/lib/scoring";

/**
 * ACC2 — a second, independent read of every generated question before the
 * pack is saved.
 *
 * Why independent rather than a re-read: the errors that reached a room on
 * 28 Sep were in the question's wording ("British-Irish", "US"), with the
 * answer right. A model asked "is this correct?" with the answer in front of
 * it tends to agree. So the checker is asked to answer each question itself,
 * and to verify every factual claim in the wording, not only the answer.
 *
 * Two ways to do that, measured by the accuracy harness before one is chosen:
 *
 * - "blind": the checker sees the questions without our answers and answers
 *   them, flagging wording it doubts. Questions where its answer matches ours
 *   (by the same comparison that marks a team's answer) and nothing was
 *   flagged are done. Only the rest go to a second, small call that sees both
 *   answers and gives a verdict. This is the only way to be genuinely blind:
 *   a model reads its whole prompt before writing anything, so within one
 *   call it has always seen our answer.
 * - "single": one call that sees our answers and is told to answer first
 *   anyway. Cheaper, not blind.
 *
 * Whatever goes wrong here must not cost the host their pack: the caller
 * saves the unreviewed pack as not checked (see the generate route).
 */

export type ReviewMode = "blind" | "single";

export type ReviewerConfig = ModelCallConfig & { mode: ReviewMode };

/**
 * Provisional until the ACC5 measurement picks the checker (Paul decides).
 * Sonnet 5 as the generator runs it, blind.
 */
export const PRODUCTION_REVIEWER: ReviewerConfig = {
  model: "claude-sonnet-5",
  thinking: "default",
  toolMode: "forced",
  mode: "blind",
};

const MAX_TOKENS = 16000;

export type Verdict = {
  id: string;
  verdict: "ok" | "fix" | "drop";
  reason: string;
  text?: string;
  answer?: string;
  options?: string[];
};

export type ReviewChange = {
  id: string;
  reason: string;
  before: { text: string; answer: string };
  after?: { text: string; answer: string };
};

export type ReviewOutcome = {
  pack: GeneratedPack;
  /** Every question got a verdict. Anything less is saved as not checked. */
  complete: boolean;
  fixed: ReviewChange[];
  dropped: ReviewChange[];
  /** Questions the checker returned no verdict for; kept as they were. */
  unreviewed: string[];
  /** Blind answers, per question, for the harness. Empty in single mode. */
  blindAnswers: Record<string, { answer: string; agreed: boolean; flags: string[] }>;
  verdicts: Verdict[];
  usage: CallUsage[];
};

export type ReviewFailureKind =
  | "timeout"
  | "api_error"
  | "credit_exhausted"
  | "not_configured"
  | "declined"
  | "unusable_output"
  | "nothing_left";

/** The review could not produce a usable result. Never shown to the host. */
export class ReviewFailedError extends Error {
  readonly kind: ReviewFailureKind;
  readonly usage: CallUsage[];

  constructor(kind: ReviewFailureKind, message: string, usage: CallUsage[] = []) {
    super(message);
    this.name = "ReviewFailedError";
    this.kind = kind;
    this.usage = usage;
  }
}

/** "R1Q3": stable, readable ids the model can echo back. */
export function questionId(roundIndex: number, questionIndex: number): string {
  return `R${roundIndex + 1}Q${questionIndex + 1}`;
}

function questionsFor(pack: GeneratedPack, withAnswers: boolean) {
  return pack.rounds.flatMap((round, r) =>
    round.questions.map((q, i) => ({
      id: questionId(r, i),
      round: round.category || round.title,
      type: q.type,
      question: q.text,
      ...(q.type === QUESTION_TYPE.MULTIPLE_CHOICE && q.options ? { options: q.options } : {}),
      ...(withAnswers ? { setter_answer: q.answer } : {}),
    }))
  );
}

const LANGUAGE_RULE =
  "Write everything in the language the question is written in; a Hebrew question gets a Hebrew " +
  "answer and a Hebrew correction.";

const NOT_A_QUESTION =
  "An item that is not a quiz question at all — an apology, a refusal, an explanation or an " +
  "instruction — must be dropped: the pack is read aloud to a room.";

const FIX_RULES =
  "A fix must leave one question with a single unambiguous answer. Put in it only facts you are " +
  "certain of; if you are unsure of a detail, remove it rather than guess, and never make a " +
  "question harder or change its topic to fix it. For a MULTIPLE_CHOICE question, return the full " +
  "set of options with exactly one of them equal to the answer. If it cannot be made right with " +
  "confidence, drop it.";

const verdictItemSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "The question's id, exactly as given, e.g. 'R2Q4'." },
    verdict: {
      type: "string",
      enum: ["ok", "fix", "drop"],
      description: "ok: correct as written. fix: corrected below. drop: remove it.",
    },
    reason: { type: "string", description: "One line: what was wrong, or why it is fine." },
    text: { type: "string", description: "fix only: the corrected question text, if it changed." },
    answer: { type: "string", description: "fix only: the corrected answer, if it changed." },
    options: {
      type: "array",
      items: { type: "string" },
      description: "fix only, MULTIPLE_CHOICE only: the full corrected option list.",
    },
  },
  required: ["id", "verdict", "reason"],
};

const VERDICT_TOOL: Anthropic.Tool = {
  name: "emit_review",
  description: "Record a verdict for each question.",
  input_schema: {
    type: "object",
    properties: { reviews: { type: "array", items: verdictItemSchema } },
    required: ["reviews"],
  },
};

const BLIND_TOOL: Anthropic.Tool = {
  name: "emit_blind_check",
  description: "Record your own answer and your checks for each question.",
  input_schema: {
    type: "object",
    properties: {
      checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "The question's id, exactly as given." },
            answer: {
              type: "string",
              description: "Your own answer. For MULTIPLE_CHOICE, one of the options exactly.",
            },
            more_than_one_answer: {
              type: "boolean",
              description: "True if a well-informed player could defensibly give a different correct answer.",
            },
            wording_issue: {
              type: "string",
              description:
                "Empty if every factual claim in the wording is right. Otherwise quote the claim " +
                "and say what is true, or that you cannot confirm it.",
            },
            not_a_question: { type: "boolean", description: "True for an apology, refusal or explanation." },
          },
          required: ["id", "answer", "more_than_one_answer", "wording_issue", "not_a_question"],
        },
      },
    },
    required: ["checks"],
  },
};

type BlindCheck = {
  id: string;
  answer: string;
  more_than_one_answer: boolean;
  wording_issue: string;
  not_a_question: boolean;
};

type CallOptions = { timeoutMs?: number };

async function callTool(
  config: ModelCallConfig,
  tool: Anthropic.Tool,
  system: string,
  user: string,
  options: CallOptions,
  usage: CallUsage[]
): Promise<unknown> {
  let anthropic;
  try {
    anthropic = getAnthropicClient();
  } catch (err) {
    throw new ReviewFailedError("not_configured", String(err), usage);
  }

  const started = Date.now();
  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create(
      {
        max_tokens: MAX_TOKENS,
        system,
        ...callOptions(config, tool),
        messages: [{ role: "user", content: user }],
      },
      // One retry, not the default two: the route is waiting on this with a
      // 300s ceiling, and a review that cannot finish is not worth the pack.
      {
        maxRetries: 1,
        // The SDK refuses an undefined or fractional timeout outright.
        ...(options.timeoutMs !== undefined ? { timeout: Math.max(1, Math.floor(options.timeoutMs)) } : {}),
      }
    );
  } catch (err) {
    throw classifyApiError(err, usage);
  }
  usage.push(usageOf(message, config.model, Date.now() - started));

  if (message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded") {
    throw new ReviewFailedError("unusable_output", `review cut off (${message.stop_reason})`, usage);
  }
  if (message.stop_reason === "refusal") {
    throw new ReviewFailedError("declined", "review declined", usage);
  }
  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new ReviewFailedError("unusable_output", "review returned no tool call", usage);
  }
  return toolUse.input;
}

function classifyApiError(err: unknown, usage: CallUsage[]): ReviewFailedError {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new ReviewFailedError("timeout", message, usage);
  }
  if (isAnthropicCreditExhausted(err)) {
    return new ReviewFailedError("credit_exhausted", message, usage);
  }
  const status = err instanceof Anthropic.APIError ? err.status : undefined;
  return new ReviewFailedError("api_error", status ? `${status}: ${message}` : message, usage);
}

function parseVerdicts(input: unknown, usage: CallUsage[]): Verdict[] {
  const reviews = (input as { reviews?: unknown } | null)?.reviews;
  if (!Array.isArray(reviews)) throw new ReviewFailedError("unusable_output", "no reviews array", usage);
  return reviews.flatMap((raw): Verdict[] => {
    const r = raw as Partial<Verdict>;
    if (typeof r.id !== "string" || !["ok", "fix", "drop"].includes(r.verdict as string)) return [];
    return [
      {
        id: r.id,
        verdict: r.verdict as Verdict["verdict"],
        reason: typeof r.reason === "string" ? r.reason : "",
        ...(typeof r.text === "string" && r.text.trim() ? { text: r.text.trim() } : {}),
        ...(typeof r.answer === "string" && r.answer.trim() ? { answer: r.answer.trim() } : {}),
        ...(Array.isArray(r.options) ? { options: r.options.filter((o): o is string => typeof o === "string") } : {}),
      },
    ];
  });
}

function parseBlind(input: unknown, usage: CallUsage[]): BlindCheck[] {
  const checks = (input as { checks?: unknown } | null)?.checks;
  if (!Array.isArray(checks)) throw new ReviewFailedError("unusable_output", "no checks array", usage);
  return checks.flatMap((raw): BlindCheck[] => {
    const c = raw as Partial<BlindCheck>;
    if (typeof c.id !== "string" || typeof c.answer !== "string") return [];
    return [
      {
        id: c.id,
        answer: c.answer,
        more_than_one_answer: c.more_than_one_answer === true,
        wording_issue: typeof c.wording_issue === "string" ? c.wording_issue.trim() : "",
        not_a_question: c.not_a_question === true,
      },
    ];
  });
}

/** Same comparison a team's answer gets, in both directions. */
function answersAgree(q: GeneratedQuestion, blind: string): boolean {
  return isLikelyCorrect(blind, q.answer) || isLikelyCorrect(q.answer, blind);
}

/** By content: a checker returns a new array even when nothing in it changed. */
function sameOptions(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((o, i) => o === b[i]);
}

/**
 * Apply verdicts to a pack. Pure, so every rule is tested without a model.
 *
 * - ok, or no verdict: kept as it is (a missing verdict is recorded).
 * - fix: text and/or answer replaced; for multiple choice the returned
 *   options replace the old ones, and a set that no longer contains the
 *   answer exactly once falls back to free text — the answer is still
 *   known, which is the rule the generator's own output already follows. A
 *   fix that changes nothing usable is treated as a drop: the checker said
 *   the question was wrong.
 * - drop: removed. A round left empty is removed with it.
 */
export function applyVerdicts(
  pack: GeneratedPack,
  verdicts: Verdict[]
): Pick<ReviewOutcome, "pack" | "fixed" | "dropped" | "unreviewed" | "complete"> {
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  const fixed: ReviewChange[] = [];
  const dropped: ReviewChange[] = [];
  const unreviewed: string[] = [];

  const rounds = pack.rounds
    .map((round, r) => {
      const questions = round.questions.flatMap((q, i): GeneratedQuestion[] => {
        const id = questionId(r, i);
        const v = byId.get(id);
        const before = { text: q.text, answer: q.answer };
        if (!v) {
          unreviewed.push(id);
          return [q];
        }
        if (v.verdict === "ok") return [q];
        if (v.verdict === "drop") {
          dropped.push({ id, reason: v.reason, before });
          return [];
        }

        const next = {
          ...q,
          text: v.text ?? q.text,
          answer: v.answer ?? q.answer,
          ...(q.type === QUESTION_TYPE.MULTIPLE_CHOICE && v.options ? { options: v.options } : {}),
        };
        if (next.text === q.text && next.answer === q.answer && sameOptions(next.options, q.options)) {
          dropped.push({ id, reason: `${v.reason} (fix gave no correction)`, before });
          return [];
        }
        const settled = degradeInvalidMultipleChoice(next);
        fixed.push({ id, reason: v.reason, before, after: { text: settled.text, answer: settled.answer } });
        return [settled];
      });
      return { ...round, questions };
    })
    .filter((round) => round.questions.length > 0);

  return {
    pack: { ...pack, rounds },
    fixed,
    dropped,
    unreviewed,
    complete: unreviewed.length === 0,
  };
}

async function reviewSingle(
  pack: GeneratedPack,
  config: ReviewerConfig,
  options: CallOptions,
  usage: CallUsage[]
): Promise<Pick<ReviewOutcome, "verdicts" | "blindAnswers">> {
  const system =
    "You are checking a pub quiz before it is read aloud to a room. For every question, first " +
    "work out your own answer from your own knowledge before you look at the setter's answer. " +
    "Then check every factual claim in the question's wording — nationalities, dates, numbers, " +
    "names, titles, 'first', 'only', 'largest' — not only the answer: a question with the right " +
    "answer and a wrong detail gets challenged just the same. A question whose answer you " +
    "disagree with, that has more than one defensible answer, or whose wording is wrong must be " +
    `fixed or dropped. ${FIX_RULES} ${NOT_A_QUESTION} ${LANGUAGE_RULE} Call the ${VERDICT_TOOL.name} ` +
    "tool once, with a verdict for every id.";
  const input = await callTool(
    config,
    VERDICT_TOOL,
    system,
    JSON.stringify(questionsFor(pack, true)),
    options,
    usage
  );
  return { verdicts: parseVerdicts(input, usage), blindAnswers: {} };
}

async function reviewBlind(
  pack: GeneratedPack,
  config: ReviewerConfig,
  options: CallOptions,
  usage: CallUsage[]
): Promise<Pick<ReviewOutcome, "verdicts" | "blindAnswers">> {
  const deadline = options.timeoutMs ? Date.now() + options.timeoutMs : undefined;

  const blindSystem =
    "You are checking a pub quiz before it is read aloud to a room. You are not shown the " +
    "setter's answers. For every question: give your own answer from your own knowledge; say " +
    "whether a well-informed player could defensibly give a different correct answer; and check " +
    "every factual claim in the question's wording — nationalities, dates, numbers, names, titles, " +
    "'first', 'only', 'largest' — reporting any claim that is false or that you cannot confirm. " +
    `Mark anything that is not a quiz question. ${LANGUAGE_RULE} Call the ${BLIND_TOOL.name} tool ` +
    "once, covering every id.";
  const blind = parseBlind(
    await callTool(config, BLIND_TOOL, blindSystem, JSON.stringify(questionsFor(pack, false)), options, usage),
    usage
  );

  const byId = new Map<string, GeneratedQuestion>();
  pack.rounds.forEach((round, r) => round.questions.forEach((q, i) => byId.set(questionId(r, i), q)));

  const blindAnswers: ReviewOutcome["blindAnswers"] = {};
  const verdicts: Verdict[] = [];
  const flagged: { id: string; checker_answer: string; issues: string[] }[] = [];
  for (const check of blind) {
    const q = byId.get(check.id);
    if (!q) continue;
    const agreed = answersAgree(q, check.answer);
    const flags = [
      ...(agreed ? [] : ["independent answer differs"]),
      ...(check.more_than_one_answer ? ["more than one defensible answer"] : []),
      ...(check.wording_issue ? [`wording: ${check.wording_issue}`] : []),
      ...(check.not_a_question ? ["not a quiz question"] : []),
    ];
    blindAnswers[check.id] = { answer: check.answer, agreed, flags };
    if (flags.length === 0) verdicts.push({ id: check.id, verdict: "ok", reason: "independent answer agrees" });
    else flagged.push({ id: check.id, checker_answer: check.answer, issues: flags });
  }

  if (flagged.length === 0) return { verdicts, blindAnswers };

  const flaggedIds = new Set(flagged.map((f) => f.id));
  const detail = questionsFor(pack, true)
    .filter((q) => flaggedIds.has(q.id))
    .map((q) => ({ ...q, ...flagged.find((f) => f.id === q.id) }));
  const adjudicateSystem =
    "You are the final check on pub quiz questions that an independent check flagged. Each comes " +
    "with the setter's answer, an answer given without seeing the setter's, and the issues found. " +
    "The independent answer can itself be wrong, or be the same answer put another way. Decide: " +
    "ok if the question and the setter's answer are correct and unambiguous as written; fix if " +
    `they can be corrected with confidence; drop otherwise. ${FIX_RULES} ${NOT_A_QUESTION} ` +
    `${LANGUAGE_RULE} Call the ${VERDICT_TOOL.name} tool once, with a verdict for every id.`;
  const remaining = deadline ? Math.max(1, deadline - Date.now()) : undefined;
  const adjudicated = parseVerdicts(
    await callTool(config, VERDICT_TOOL, adjudicateSystem, JSON.stringify(detail), { timeoutMs: remaining }, usage),
    usage
  ).filter((v) => flaggedIds.has(v.id));

  return { verdicts: [...verdicts, ...adjudicated], blindAnswers };
}

export async function reviewPack(
  pack: GeneratedPack,
  config: ReviewerConfig = PRODUCTION_REVIEWER,
  options: CallOptions = {}
): Promise<ReviewOutcome> {
  const usage: CallUsage[] = [];
  const { verdicts, blindAnswers } =
    config.mode === "single"
      ? await reviewSingle(pack, config, options, usage)
      : await reviewBlind(pack, config, options, usage);

  const applied = applyVerdicts(pack, verdicts);
  if (applied.pack.rounds.length === 0) {
    // Every question dropped. Saving nothing is not an option and saving the
    // lot as "checked" would be false, so the caller keeps the unreviewed
    // pack and marks it not checked.
    throw new ReviewFailedError("nothing_left", "review dropped every question", usage);
  }
  return { ...applied, verdicts, blindAnswers, usage };
}

/** The kill switch. Anything but "off" leaves the review on. */
export function reviewEnabled(): boolean {
  return (process.env.PACK_REVIEW ?? "").trim().toLowerCase() !== "off";
}

/** Below this, a review would be cut off by the route's own ceiling. */
export const MIN_REVIEW_MS = 30_000;

export type ReviewedForSaving = {
  pack: GeneratedPack;
  record: {
    status: "checked" | "not_checked";
    fixed: number;
    dropped: number;
    notes: string;
  };
  usage: CallUsage[];
  /** Why the pack is not checked; absent when it is. */
  failure?: ReviewFailureKind | "disabled" | "no_time" | "incomplete";
};

/**
 * What the generate route calls. It never throws: every way the review can
 * go wrong ends in the unreviewed pack, marked not checked, because the
 * generation already happened and the host must not lose it to the check.
 */
export async function reviewForSaving(
  pack: GeneratedPack,
  timeLeftMs: number,
  config: ReviewerConfig = PRODUCTION_REVIEWER
): Promise<ReviewedForSaving> {
  const unchecked = (failure: NonNullable<ReviewedForSaving["failure"]>, usage: CallUsage[] = [], detail?: string) => ({
    pack,
    record: {
      status: "not_checked" as const,
      fixed: 0,
      dropped: 0,
      notes: JSON.stringify({ failure, ...(detail ? { detail } : {}) }),
    },
    usage,
    failure,
  });

  if (!reviewEnabled()) return unchecked("disabled");
  if (timeLeftMs < MIN_REVIEW_MS) return unchecked("no_time");

  let outcome: ReviewOutcome;
  try {
    outcome = await reviewPack(pack, config, { timeoutMs: timeLeftMs });
  } catch (err) {
    if (err instanceof ReviewFailedError) return unchecked(err.kind, err.usage, err.message);
    return unchecked("unusable_output", [], err instanceof Error ? err.message : String(err));
  }

  // Verdicts that did arrive are still applied — a fix is a fix — but a pack
  // with any question the checker skipped is not called checked.
  return {
    pack: outcome.pack,
    record: {
      status: outcome.complete ? "checked" : "not_checked",
      fixed: outcome.fixed.length,
      dropped: outcome.dropped.length,
      notes: JSON.stringify({
        fixed: outcome.fixed,
        dropped: outcome.dropped,
        ...(outcome.complete ? {} : { unreviewed: outcome.unreviewed }),
      }),
    },
    usage: outcome.usage,
    ...(outcome.complete ? {} : { failure: "incomplete" as const }),
  };
}
