import { beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

// Only the transport is stubbed. The prompt, the tool schema and the
// salvage path all stay real, so these assert what generateQuizPack
// actually sends and what it makes of what comes back.
const create = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: () => ({ messages: { create } }),
  MissingApiKeyError: class MissingApiKeyError extends Error {},
}));

import { generateQuizPack } from "@/lib/generate-pack";

type Request = Anthropic.MessageCreateParamsNonStreaming;

function packInput() {
  return {
    title: "Friday Night Quiz",
    rounds: [
      {
        title: "Warm-Up",
        category: "General Knowledge",
        questions: [{ text: "What is the capital of France?", answer: "Paris", points: 1 }],
      },
    ],
  };
}

function modelReplies(input: unknown, stopReason = "end_turn") {
  create.mockResolvedValue({
    stop_reason: stopReason,
    content: [{ type: "tool_use", id: "tu_1", name: "emit_quiz_pack", input }],
  });
}

/** The request generateQuizPack actually put on the wire. */
async function captureRequest(): Promise<Request> {
  modelReplies(packInput());
  await generateQuizPack("Four rounds of pub trivia.");
  return create.mock.calls[0][0] as Request;
}

beforeEach(() => {
  create.mockReset();
});

describe("generateQuizPack — the brief sent to the model", () => {
  /**
   * The app renders question text and nothing else: no audio player, no
   * image. Nothing downstream can catch a question that needs media —
   * validation only checks the fields are non-empty, so "Listen to the clip.
   * Which band is playing?" passes every check and reaches the table
   * unanswerable, with every team scoring zero. Until the app can carry
   * media, this instruction is the only thing standing between the model and
   * that pack, so assert it survives in the prompt that is really sent
   * rather than in a constant someone could stop passing.
   */
  it("requires questions to be answerable from their own text", async () => {
    const system = (await captureRequest()).system as string;

    expect(system).toMatch(/answerable\s+from\s+its\s+own\s+text\s+alone/i);
    expect(system).toMatch(/no audio, image, video or map/i);
  });

  it("tells the model what to do with a brief that asks for a picture round", async () => {
    // The wizard's own default brief asks for a "picture-round-style"
    // closer, so "don't need media" alone would leave the model stuck.
    const system = (await captureRequest()).system as string;

    expect(system).toMatch(/picture or music round/i);
    expect(system).toMatch(/in words instead/i);
  });

  it("forces exactly one call to the pack tool", async () => {
    const req = await captureRequest();

    expect(req.tool_choice).toEqual({ type: "tool", name: "emit_quiz_pack" });
    expect(req.tools?.[0]).toMatchObject({ name: "emit_quiz_pack" });
  });

  /**
   * The 502 this pass was opened for: at 8000, a brief like "eight rounds of
   * fifteen questions" ran the model out of budget mid-tool-call and the
   * truncated response collapsed into a blanket 502. The ceiling is the fix,
   * so pin it — a later edit trimming it back reopens that bug.
   */
  it("allows enough output budget for a large brief", async () => {
    expect((await captureRequest()).max_tokens).toBeGreaterThanOrEqual(16000);
  });
});

describe("generateQuizPack — reading the response", () => {
  it("returns a clean pack with nothing dropped", async () => {
    modelReplies(packInput());

    const result = await generateQuizPack("Four rounds.");

    expect(result.pack.title).toBe("Friday Night Quiz");
    expect(result).toMatchObject({ droppedQuestions: 0, droppedRounds: 0, truncated: false });
  });

  it("flags a pack cut short at max_tokens, so the caller can say why", async () => {
    modelReplies(packInput(), "max_tokens");

    expect((await generateQuizPack("Eight rounds of fifteen.")).truncated).toBe(true);
  });
});
