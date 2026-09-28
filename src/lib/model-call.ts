import type Anthropic from "@anthropic-ai/sdk";

/**
 * How one model call is configured: which model, how hard it thinks, and how
 * it is made to call its one tool. Shared by the generator and the review
 * pass so the accuracy harness (scripts/eval-accuracy.ts) can measure the same
 * code production runs under other settings, rather than a copy of it (ACC6).
 */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ModelCallConfig = {
  model: string;
  /**
   * Omitted means the model's own default is used and nothing is sent. That
   * default differs by model: Sonnet 5's is "high", Opus 5.5's is "medium".
   */
  effort?: Effort;
  /**
   * "default" sends no `thinking` parameter at all. On Sonnet 5 that is not
   * "no thinking": a request without the parameter runs adaptive thinking.
   * "disabled" is the only way to turn it off, and Opus 5.5 refuses it (400).
   */
  thinking: "default" | "adaptive" | "disabled";
  /**
   * "forced" is `tool_choice: {type: "tool"}` — what production sent until
   * ACC9, and it leaves no room to think first. Opus 5.5 rejects forced tool choice with a 400, so "auto-strict"
   * sends `tool_choice: {type: "auto"}` with `strict: true` on the tool and
   * relies on the prompt to ask for the call; a response without one is
   * handled as the caller already handles it.
   */
  toolMode: "forced" | "auto-strict";
};

export type CallUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Part of outputTokens; null when the API did not break it out. */
  thinkingTokens: number | null;
  durationMs: number;
};

/** Today as YYYY-MM-DD (UTC), for the prompts' date line (ACC10). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function usageOf(message: Anthropic.Message, model: string, durationMs: number): CallUsage {
  return {
    model,
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    thinkingTokens: message.usage?.output_tokens_details?.thinking_tokens ?? null,
    durationMs,
  };
}

/**
 * A strict tool's schema may not carry numeric bounds or array-length bounds
 * other than 0/1, and every object must close with `additionalProperties:
 * false`. Those are removed here rather than in the schema we write, so the
 * forced path keeps sending exactly what it sent before. Zod validates the
 * result afterwards either way, so nothing a bound used to catch goes
 * unchecked.
 */
export function strictCompatibleSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictCompatibleSchema);
  if (typeof schema !== "object" || schema === null) return schema;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "minimum" || key === "maximum" || key === "maxItems") continue;
    if (key === "minItems" && typeof value === "number" && value > 1) continue;
    out[key] = strictCompatibleSchema(value);
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

/** The parts of a request that differ between configurations. */
export function callOptions(
  config: ModelCallConfig,
  tool: Anthropic.Tool
): Pick<Anthropic.MessageCreateParamsNonStreaming, "model" | "tools" | "tool_choice" | "thinking" | "output_config"> {
  const strict = config.toolMode === "auto-strict";
  return {
    model: config.model,
    tools: [
      strict
        ? { ...tool, strict: true, input_schema: strictCompatibleSchema(tool.input_schema) as Anthropic.Tool.InputSchema }
        : tool,
    ],
    tool_choice: strict ? { type: "auto" } : { type: "tool", name: tool.name },
    ...(config.thinking === "default" ? {} : { thinking: { type: config.thinking } }),
    ...(config.effort ? { output_config: { effort: config.effort } } : {}),
  };
}
