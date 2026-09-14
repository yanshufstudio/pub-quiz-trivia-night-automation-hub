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

export type GenerationResult = {
  pack: GeneratedPack;
  /** Questions and rounds dropped to salvage the rest — 0/0 on a clean run. */
  droppedQuestions: number;
  droppedRounds: number;
  /** The model hit MAX_TOKENS, so the pack is short of what the brief asked for. */
  truncated: boolean;
};

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
  const truncated = message.stop_reason === "max_tokens";

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
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
