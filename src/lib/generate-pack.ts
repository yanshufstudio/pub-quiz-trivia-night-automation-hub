import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/anthropic";
import { generatedPackSchema, salvageGeneratedPack, type GeneratedPack } from "@/lib/quiz-schema";
import { callOptions, todayIso, usageOf, type CallUsage, type ModelCallConfig } from "@/lib/model-call";
import { QUESTION_TYPE } from "@/lib/question-types";

export type GeneratorConfig = ModelCallConfig & {
  /**
   * "before-acc1" drops the ACC1 sentence from the system prompt. It exists
   * only so the accuracy harness can measure what ACC1 changed; production
   * never sends it.
   */
  promptRules?: "current" | "before-acc1";
};

/**
 * What production sends: Opus 5.5 at low effort, no `thinking` parameter,
 * auto tool choice with a strict tool — ACC5's G3, which made 2.6 errors per
 * 100 questions against 12-17 for the Sonnet 5 configurations it replaced
 * (Paul, 28 Sep). Opus 5.5 refuses forced tool choice, so the model and the
 * tool mode go together.
 *
 * Until then it was Sonnet 5 with forced tool choice. ACC5 measured 0
 * thinking tokens on every forced call: a forced tool call opens the
 * response, so the model never thought, whatever the defaults say.
 */
export const PRODUCTION_GENERATOR: GeneratorConfig = {
  model: "claude-opus-5-5",
  thinking: "default",
  effort: "low",
  toolMode: "auto-strict",
};

/**
 * A four-round/40-question pack lands around 3-4k output tokens, but the
 * brief is free text: "eight rounds of fifteen questions" is a perfectly
 * ordinary thing for a quizmaster to ask for, and at 8000 the model ran out
 * of budget mid-tool-call and the response came back truncated. Truncation
 * is deterministic per brief, so "please try again" was never going to clear
 * it. The model's ceiling is far above this; the real limit on pack size is the
 * route's 300s maxDuration, not this number.
 */
const MAX_TOKENS = 16000;

const TOOL_NAME = "emit_quiz_pack";

const quizPackJsonSchema: Anthropic.Tool.InputSchema = {
  type: "object",
  // The counts come first on purpose: properties are generated in schema
  // order, so the model commits to what the brief asked for before it writes
  // a round, and the pack is then checked against its own statement (ACC8).
  properties: {
    requested_rounds: {
      type: "integer",
      minimum: 1,
      description:
        "Fill this in first, before any round: how many rounds the brief asks for. If the " +
        "brief gives no number, the number of rounds you are about to write.",
    },
    requested_questions_per_round: {
      type: "array",
      items: { type: "integer", minimum: 1 },
      description:
        "Fill this in second, before any round: how many questions the brief asks for in each " +
        "round, one number per round, in order. If the brief gives no numbers, the numbers you " +
        "are about to write.",
    },
    decline_reason: {
      type: "string",
      description:
        "Set this ONLY if you will not write the quiz the brief asks for. A short " +
        "explanation addressed to the quizmaster, saying what you will not write and " +
        "why. When you set it, send no rounds. Never substitute a different quiz, and " +
        "never put an explanation, apology or refusal inside a question or an answer.",
    },
    title: { type: "string", description: "Short title for the whole quiz pack" },
    rounds: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "A short, distinct round name — never just the ordinal (not 'Round 1'). " +
              "The UI already numbers rounds, so this is the name shown next to that number, " +
              "e.g. 'Warm-Up', 'Music Bingo', 'Around the World'.",
          },
          category: { type: "string", description: "e.g. '19th-Century History'" },
          questions: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                answer: { type: "string" },
                points: { type: "integer", minimum: 1, maximum: 10 },
                type: {
                  type: "string",
                  enum: ["TEXT", "MULTIPLE_CHOICE"],
                  description:
                    "Almost always 'TEXT' (a free-text answer). Use 'MULTIPLE_CHOICE' only " +
                    "occasionally for variety, and only when paired with 'options'.",
                },
                options: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 2,
                  maxItems: 6,
                  description:
                    "Required when type is 'MULTIPLE_CHOICE', omitted otherwise. 2-6 short " +
                    "choices, in no particular order, one of which must exactly equal 'answer'.",
                },
              },
              required: ["text", "answer"],
            },
          },
        },
        required: ["title", "category", "questions"],
      },
    },
  },
  // Only the counts are required (ACC13): a decline states them too, and
  // carries neither a title nor rounds. Left optional, Opus 5.5 sometimes
  // skipped them on a correct pack. The parse in generateQuizPack enforces the
  // rest: either a decline_reason, or a pack with at least one round.
  required: ["requested_rounds", "requested_questions_per_round"],
};

/**
 * Thrown when the model's response can't be turned into any usable pack at
 * all. `truncated` distinguishes the two cases the caller must word
 * differently: the brief asked for more than one generation can hold (the
 * user can fix that by asking for less — retrying cannot), versus the model
 * returning something unusable this once (retrying genuinely may help).
 */
export class UnusableModelOutputError extends Error {
  readonly truncated: boolean;
  /** Tokens and time of every call made before the failure (ACC13). */
  usage?: CallUsage;
  attempts?: number;

  constructor(message: string, truncated: boolean) {
    super(message);
    this.name = "UnusableModelOutputError";
    this.truncated = truncated;
  }
}

/**
 * ACC8: the pack came back short of what the model itself said the brief
 * asked for, or with an option set that can't be read aloud, twice in a row.
 * Not a size problem (that is `truncated`), so another generation may well
 * work; `hostMessage` says what happened in words the host can act on.
 */
export class IncompletePackError extends UnusableModelOutputError {
  readonly hostMessage: string;

  constructor(message: string, hostMessage: string) {
    super(message, false);
    this.name = "IncompletePackError";
    this.hostMessage = hostMessage;
  }
}

/** One attempt's structural fault. Internal: retried once, then surfaced as
 * IncompletePackError. */
class MalformedPackError extends Error {
  constructor(
    message: string,
    readonly hostMessage: string
  ) {
    super(message);
  }
}

/** The longest decline we will repeat back to the user. The text comes from
 * the model, so it is arbitrary-length content being put on a page; a couple
 * of sentences is all a decline ever needs, and the cap keeps a runaway
 * response out of the UI. */
export const MAX_DECLINE_REASON_CHARS = 400;

/**
 * The model read the brief and declined to write it — a refusal, not a
 * failure. It comes back as a turn with no tool_use block and
 * stop_reason "end_turn", carrying the model's own explanation as text.
 *
 * This used to be indistinguishable from a broken response: both threw
 * UnusableModelOutputError, the route answered 502 "Please try again", and
 * the explanation was discarded. Retrying a decline cannot work — the brief
 * has to change — so inviting a retry, after up to 60 seconds of waiting,
 * wastes the user's time and a second generation's worth of tokens.
 */
export class ModelDeclinedError extends Error {
  /** The model's own words, trimmed and capped. Empty when it declined
   * without saying anything. */
  readonly reason: string;
  /** Tokens and time of the call that declined (ACC13). */
  usage?: CallUsage;
  attempts?: number;

  constructor(reason: string) {
    super(reason || "The question generator declined this brief");
    this.name = "ModelDeclinedError";
    this.reason = reason;
  }
}

export type GenerationResult = {
  pack: GeneratedPack;
  /** Questions and rounds dropped to salvage the rest — 0/0 on a clean run. */
  droppedQuestions: number;
  droppedRounds: number;
  /** The model hit MAX_TOKENS, so the pack is short of what the brief asked for. */
  truncated: boolean;
  /** Tokens and time for every call made, for cost logging. No brief text. */
  usage: CallUsage;
  /** 1, or 2 when the first pack was short or malformed (ACC8). */
  attempts: number;
  /** Questions beyond what the model said the brief asked for: kept, logged. */
  surplusQuestions: number;
};

/** The tool's own decline channel: a non-empty `decline_reason` on the tool
 * input, trimmed and capped. Anything else — absent, blank, not a string —
 * is not a decline. */
function declineReasonFromTool(input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const raw = (input as { decline_reason?: unknown }).decline_reason;
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_DECLINE_REASON_CHARS).trim();
}

/**
 * What the model said when it declined, trimmed and capped.
 *
 * A "refusal" turn carries the reason in stop_details.explanation; an
 * ordinary "end_turn" carries it in text blocks, of which there may be
 * several. Prefer the structured field and fall back to the prose, so both
 * shapes give the user something to act on. Empty is a valid answer — the
 * model can decline without elaborating — and the caller supplies the
 * wording for that case.
 */
function declineReason(message: { stop_details?: { explanation?: string | null } | null; content: unknown[] }): string {
  const structured = message.stop_details?.explanation?.trim();
  if (structured) return structured.slice(0, MAX_DECLINE_REASON_CHARS).trim();

  return (message.content as { type: string; text?: string }[])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join(" ")
    .trim()
    .slice(0, MAX_DECLINE_REASON_CHARS)
    .trim();
}

/** ACC1: the wording is where the 28 Sep errors were, not the answers. */
const CERTAIN_FACTS_ONLY =
  "Put in a question only facts you are " +
  "certain of, in the question as well as in the answer: a wrong detail in the " +
  "wording gets challenged in the room just like a wrong answer. Use the fewest " +
  "descriptors needed for one unambiguous answer, and don't add an incidental " +
  "nationality, year, number or 'first', 'only' or 'largest' unless it is the point " +
  "of the question. If you are unsure of a detail, leave it out rather than guess. ";

/** ACC10: ACC5's G3 named Klose as the World Cup's top scorer, true only
 * until July 2026. Without the date the model can't know a record moved. */
function currentFacts(): string {
  return (
    `Today's date is ${todayIso()}. Avoid questions whose answer is a current record or a ` +
    "current holder that can change (the most World Cup goals, a reigning champion, a " +
    "sitting leader); if you do set one, state the year it is true for in the question. "
  );
}

function systemPrompt(rules: "current" | "before-acc1"): string {
  return (
    "You are a pub quiz question setter. Given a request describing the desired " +
    "rounds and topics, produce a complete, well-researched quiz pack. Each question " +
    "must have a single unambiguous factual answer. " +
    // The harness's "before-acc1" run measures the 28 Sep prompt, so it gets neither.
    (rules === "current" ? CERTAIN_FACTS_ONLY + currentFacts() : "") +
    "Every question must be answerable " +
    "from its own text alone: the app shows players nothing but the words you write — " +
    "there is no audio, image, video or map — so never set a question that depends on " +
    "hearing or seeing something (no 'listen to the clip', 'identify the logo shown', " +
    "'name this film still'), and if the brief asks for a picture or music round, cover " +
    "that topic in words instead. Vary difficulty within each round " +
    "from easy to hard. Do not repeat questions or trivia facts across rounds. Most " +
    "questions should be free-text; sprinkle in the occasional multiple-choice question " +
    "for variety, never more than one or two per round. Call the " +
    `${TOOL_NAME} tool exactly once with the full pack.` +
    "\n\nIf you will not write the quiz the brief asks for, call the tool with " +
    "decline_reason set to a short explanation addressed to the quizmaster, and no " +
    "rounds. Never substitute a different quiz for the one you were asked for, and " +
    "never put an explanation, apology or refusal inside a question or an answer — a " +
    "pack is printed and read aloud to a room, so a refusal written as question one " +
    "reaches the players as a question."
  );
}

const BROKEN_CHOICE_MESSAGE =
  "The pack came back with a broken multiple-choice question. Please generate again.";

/**
 * A fragment of the tool call's own JSON inside an option, like ACC5's
 * "][0:0]": back-to-back brackets, an index like [0:0], a brace, a quote
 * against a colon, or an escaped quote. A lone colon, quote or bracket pair is
 * punctuation ("Star Wars: A New Hope", 'The "Iron Lady"').
 */
const LEAKED_SYNTAX = /\]\[|\[\d+:\d+\]|[{}]|":|\\"/;

/** The counts the model said the brief asked for, one per round; null when
 * it didn't say, or said something that isn't a count. */
function requestedCounts(input: { requested_rounds?: unknown; requested_questions_per_round?: unknown }): number[] | null {
  const rounds = input.requested_rounds;
  const perRound = input.requested_questions_per_round;
  if (typeof rounds !== "number" || !Number.isInteger(rounds) || rounds < 1) return null;
  if (!Array.isArray(perRound) || !perRound.every((n) => Number.isInteger(n) && n >= 1)) return null;
  if (perRound.length === rounds) return perRound;
  // "Four rounds of ten" stated once rather than four times.
  if (perRound.length === 1) return Array(rounds).fill(perRound[0]);
  return null;
}

/**
 * A multiple-choice option set as it will be read aloud. Blank and duplicate
 * options are removed here (duplicates trimmed and case-insensitive, keeping
 * the answer's spelling); what can't be repaired — leaked syntax, fewer than
 * two options, the answer not among them — is a malformed pack. Other
 * question types pass through untouched.
 */
function repairQuestion(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const q = raw as { type?: unknown; answer?: unknown; options?: unknown };
  if (q.type !== QUESTION_TYPE.MULTIPLE_CHOICE) return raw;

  const answer = typeof q.answer === "string" ? q.answer.trim() : "";
  const byKey = new Map<string, string>();
  for (const option of Array.isArray(q.options) ? q.options : []) {
    if (typeof option !== "string" || !option.trim()) continue;
    const text = option.trim();
    if (LEAKED_SYNTAX.test(text)) {
      throw new MalformedPackError(`leaked syntax in an option: ${JSON.stringify(text)}`, BROKEN_CHOICE_MESSAGE);
    }
    const key = text.toLowerCase();
    if (!byKey.has(key) || text === answer) byKey.set(key, text);
  }
  const options = [...byKey.values()];
  if (options.length < 2) {
    throw new MalformedPackError("a multiple-choice question has fewer than two distinct options", BROKEN_CHOICE_MESSAGE);
  }
  if (!options.includes(answer)) {
    throw new MalformedPackError("a multiple-choice answer is not one of its options", BROKEN_CHOICE_MESSAGE);
  }
  return { ...q, options };
}

function repairRounds(rounds: unknown): unknown {
  if (!Array.isArray(rounds)) return rounds;
  return rounds.map((round) => {
    if (typeof round !== "object" || round === null) return round;
    const r = round as { questions?: unknown };
    return Array.isArray(r.questions) ? { ...r, questions: r.questions.map(repairQuestion) } : round;
  });
}

/** Throws when the pack is short of what was asked, in total or in any one
 * round; returns how many questions it has beyond that. */
function checkCounts(pack: GeneratedPack, requested: number[]): number {
  const got = pack.rounds.map((round) => round.questions.length);
  const total = (counts: number[]) => counts.reduce((sum, n) => sum + n, 0);
  const asked = total(requested);
  const produced = total(got);

  if (produced < asked) {
    throw new MalformedPackError(
      `short pack: ${produced} of ${asked} questions, rounds ${JSON.stringify(got)} of ${JSON.stringify(requested)}`,
      `The pack came back incomplete (asked for ${asked} questions, got ${produced}). Please generate again.`
    );
  }
  const shortRound = requested.findIndex((n, i) => (got[i] ?? 0) < n);
  if (shortRound >= 0) {
    throw new MalformedPackError(
      `short round: rounds ${JSON.stringify(got)} of ${JSON.stringify(requested)}`,
      `The pack came back incomplete (round ${shortRound + 1} has ${got[shortRound] ?? 0} of the ` +
        `${requested[shortRound]} questions asked for). Please generate again.`
    );
  }
  return produced - asked;
}

function combinedUsage(usages: CallUsage[], model: string): CallUsage {
  const sum = (key: "inputTokens" | "outputTokens" | "durationMs") => usages.reduce((total, u) => total + u[key], 0);
  const thinking = usages.map((u) => u.thinkingTokens);
  return {
    model,
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    thinkingTokens: thinking.every((t) => t === null) ? null : thinking.reduce<number>((total, t) => total + (t ?? 0), 0),
    durationMs: sum("durationMs"),
  };
}

/**
 * ACC8: a pack short of what was asked, or with an option set that can't be
 * read aloud, gets one more attempt and then fails with a message saying so.
 * It is never returned short. Truncation, declines and API errors are not
 * retried here: asking for less, changing the brief or the SDK's own retries
 * are what fix those.
 */
export async function generateQuizPack(
  userPrompt: string,
  config: GeneratorConfig = PRODUCTION_GENERATOR
): Promise<GenerationResult> {
  const usages: CallUsage[] = [];
  // ACC13: a failure after a paid call still carries what it cost.
  const withUsage = <E extends UnusableModelOutputError | ModelDeclinedError>(err: E, attempts: number): E => {
    if (usages.length > 0) Object.assign(err, { usage: combinedUsage(usages, config.model), attempts });
    return err;
  };
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await generateOnce(userPrompt, config, usages);
      return { ...result, attempts: attempt, usage: combinedUsage(usages, config.model) };
    } catch (err) {
      if (err instanceof UnusableModelOutputError || err instanceof ModelDeclinedError) throw withUsage(err, attempt);
      if (!(err instanceof MalformedPackError)) throw err;
      if (attempt === 2) throw withUsage(new IncompletePackError(err.message, err.hostMessage), attempt);
      console.warn(`Quiz pack attempt ${attempt} unusable (${err.message}); trying once more.`);
    }
  }
}

async function generateOnce(
  userPrompt: string,
  config: GeneratorConfig,
  usages: CallUsage[]
): Promise<Omit<GenerationResult, "attempts" | "usage">> {
  const anthropic = getAnthropicClient();

  const started = Date.now();
  const message = await anthropic.messages.create({
    max_tokens: MAX_TOKENS,
    system: systemPrompt(config.promptRules ?? "current"),
    ...callOptions(config, {
      name: TOOL_NAME,
      description: "Emit a complete generated quiz pack.",
      input_schema: quizPackJsonSchema,
    }),
    messages: [{ role: "user", content: userPrompt }],
  });
  usages.push(usageOf(message, config.model, Date.now() - started));

  // A response cut off at max_tokens carries a half-written tool call: the
  // questions before the cut are fine, the last one isn't. Track it so a
  // pack that survives salvage still reports *why* it came up short, and so
  // an unsalvageable one gets an error message that names the real cause.
  // model_context_window_exceeded is the same problem arriving by a different
  // door — the brief did not fit — and wants the same "ask for less" answer.
  const truncated =
    message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded";

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    // No tool call, and the turn ended of its own accord rather than being
    // cut off: the model chose not to answer rather than failing to.
    //
    // Both stop reasons matter, and "refusal" is the one that matters most.
    // The request forces the tool (tool_choice below), so a model that simply
    // finishes its turn without calling it is the unusual shape; a safety
    // classifier declining the brief reports "refusal" and carries its
    // explanation in stop_details rather than in a text block. Watching only
    // for "end_turn" caught the rarer case and let the common one fall
    // through to a generic retryable error.
    if (!truncated && (message.stop_reason === "refusal" || message.stop_reason === "end_turn")) {
      throw new ModelDeclinedError(declineReason(message));
    }
    throw new UnusableModelOutputError("Model did not return structured quiz data", truncated);
  }

  // A decline delivered through the tool itself, which is the route that
  // actually fires. tool_choice forces the tool, so the model satisfies the
  // contract it was given rather than ending its turn: asked for a brief it
  // would not write, it called the tool anyway with a substituted,
  // unobjectionable quiz and its refusal as the text of question one. That
  // saved as a successful pack and spent the user's free generation, and no
  // stop_reason ever said otherwise. Giving the tool an explicit way to say
  // no is what makes refusing cheaper for the model than complying wrongly.
  //
  // Checked before the pack parse, and regardless of what else came with it:
  // a response carrying both a reason and rounds is a decline that also
  // substituted a quiz, and the quiz is the part to throw away.
  const declined = declineReasonFromTool(toolUse.input);
  if (declined) throw new ModelDeclinedError(declined);

  // A truncated pack is short by definition and the brief is why, so it keeps
  // the handling it always had: salvage what came, and say "ask for less".
  let input = toolUse.input;
  let requested: number[] | null = null;
  if (!truncated) {
    const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
    requested = requestedCounts(raw);
    // ACC13: required in the schema, so this should not happen. If it does,
    // a correct pack must not fail for it: keep it, skip only the count
    // check, and warn so a regression shows up in the logs.
    if (!requested) console.warn("Quiz pack stated no requested counts; count check skipped.");
    input = { ...raw, rounds: repairRounds(raw.rounds) };
  }

  const parsed = generatedPackSchema.safeParse(input);
  // Strict validation is all-or-nothing, and one unusable question is not a
  // reason to throw away the other thirty-nine. Keep every question that
  // stands on its own; fail only when nothing does.
  const salvaged = parsed.success
    ? { pack: parsed.data, droppedQuestions: 0, droppedRounds: 0 }
    : salvageGeneratedPack(input);
  if (!salvaged) {
    throw new UnusableModelOutputError(
      `Generated quiz pack failed validation: ${parsed.error?.message}`,
      truncated
    );
  }

  // Questions salvage had to drop count against the pack like missing ones.
  const surplusQuestions = requested ? checkCounts(salvaged.pack, requested) : 0;
  return { ...salvaged, truncated, surplusQuestions };
}
