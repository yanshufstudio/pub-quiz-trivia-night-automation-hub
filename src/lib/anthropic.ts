import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set");
    this.name = "MissingApiKeyError";
  }
}

export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new MissingApiKeyError();
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Has the Anthropic account run out of credit (or been billing-blocked)?
 *
 * This is the one upstream failure that looks transient and is not: the SDK's
 * retries do not help, the model produces nothing, and it stays broken until
 * somebody tops up an account. It used to arrive as the generic 502 "Couldn't
 * generate a quiz pack right now. Please try again." — which tells a host to keep
 * pressing a button that cannot work, and tells us nothing in the logs (H3).
 *
 * There is **no typed SDK class for it**, which is why this reads the message.
 * Anthropic reports it as an ordinary `invalid_request_error` — a 400 whose text
 * names the credit balance — so a status check alone cannot tell it from a
 * malformed request, and `Anthropic.BadRequestError` covers both. A 402 is
 * unambiguous and is taken on status alone.
 *
 * Deliberately narrow. Anything it does not recognise keeps the handling it has
 * today, because mistaking a real bad request for an exhausted account would
 * tell a host to wait for something that is never going to change.
 */
const CREDIT_EXHAUSTED = /credit balance|insufficient (?:funds|credit)|quota|billing|payment required/i;

export function isAnthropicCreditExhausted(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  // Payment Required needs no interpretation.
  if (err.status === 402) return true;
  // Otherwise only the two statuses Anthropic actually uses for it.
  if (err.status !== 400 && err.status !== 403) return false;

  const body = err.error as { error?: { message?: unknown; type?: unknown } } | undefined;
  const detail = typeof body?.error?.message === "string" ? body.error.message : "";
  const type = typeof body?.error?.type === "string" ? body.error.type : "";
  return CREDIT_EXHAUSTED.test(`${err.message} ${detail} ${type}`);
}

/** The string to alert on. Grep for it; it appears nowhere else. */
export const CREDIT_EXHAUSTED_LOG = "anthropic-credit-exhausted";

/** What a host is told. It does not say "try again" in the next breath, because
 * retrying is exactly what cannot help. */
export const GENERATION_PAUSED_MESSAGE = "Pack generation is paused — please try again later.";
