import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/anthropic";
import { generatedPackSchema, salvageGeneratedPack, type GeneratedPack } from "@/lib/quiz-schema";

const MODEL = "claude-sonnet-5";

/**
 * A four-round/40-question pack lands around 3-4k output tokens, but the
 * brief is free text: "eight rounds of fifteen questions" is a perfectly
 * ordinary thing for a quizmaster to ask for, and at 8000 the model ran out
 * of budget mid-tool-call and the response came back truncated. Truncation
 * is deterministic per brief, so "please try again" was never going to clear
 * it. Sonnet's ceiling is far above this; the real limit on pack size is the
 * route's 60s maxDuration, not this number.
 */
const MAX_TOKENS = 16000;

const TOOL_NAME = "emit_quiz_pack";

const quizPackJsonSchema: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short title for the whole quiz pack" },
    rounds: {
      type: "array",
      minItems: 1,
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
  required: ["title", "rounds"],
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

  constructor(message: string, truncated: boolean) {
    super(message);
    this.name = "UnusableModelOutputError";
    this.truncated = truncated;
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
};

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

export async function generateQuizPack(userPrompt: string): Promise<GenerationResult> {
  const anthropic = getAnthropicClient();

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system:
      "You are a pub quiz question setter. Given a request describing the desired " +
      "rounds and topics, produce a complete, well-researched quiz pack. Each question " +
      "must have a single unambiguous factual answer. Every question must be answerable " +
      "from its own text alone: the app shows players nothing but the words you write — " +
      "there is no audio, image, video or map — so never set a question that depends on " +
      "hearing or seeing something (no 'listen to the clip', 'identify the logo shown', " +
      "'name this film still'), and if the brief asks for a picture or music round, cover " +
      "that topic in words instead. Vary difficulty within each round " +
      "from easy to hard. Do not repeat questions or trivia facts across rounds. Most " +
      "questions should be free-text; sprinkle in the occasional multiple-choice question " +
      "for variety, never more than one or two per round. Call the " +
      `${TOOL_NAME} tool exactly once with the full pack.`,
    tools: [
      {
        name: TOOL_NAME,
        description: "Emit a complete generated quiz pack.",
        input_schema: quizPackJsonSchema,
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userPrompt }],
  });

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

  const parsed = generatedPackSchema.safeParse(toolUse.input);
  if (parsed.success) {
    return { pack: parsed.data, droppedQuestions: 0, droppedRounds: 0, truncated };
  }

  // Strict validation is all-or-nothing, and one unusable question is not a
  // reason to throw away the other thirty-nine. Keep every question that
  // stands on its own; fail only when nothing does.
  const salvaged = salvageGeneratedPack(toolUse.input);
  if (!salvaged) {
    throw new UnusableModelOutputError(
      `Generated quiz pack failed validation: ${parsed.error.message}`,
      truncated
    );
  }

  return { ...salvaged, truncated };
}
