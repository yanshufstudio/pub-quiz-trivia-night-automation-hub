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
const CREDIT_EXHAUSTED =
  /credit balance|insufficient (?:funds|credit)|quota|billing|payment required|you have reached your specified (?:workspace )?API usage limits/i;

/**
 * Spend limits are the same failure (PRC14), per docs.claude.com/en/api/rate-limits:
 *
 * - A spend limit the owner set is a 400 `invalid_request_error` whose message
 *   begins "You have reached your specified API usage limits" (or "...specified
 *   workspace API usage limits"). Matched by that message, above.
 * - The tier's spend cap is a 429 `rate_limit_error` — the same type as an
 *   ordinary rate limit — told apart only by `error.details.error_code`
 *   "enforced_spend_limit_reached". So a 429 counts only with that code; every
 *   other 429 is a rate limit, where retrying *is* the right advice.
 */
const SPEND_CAP_CODE = "enforced_spend_limit_reached";

export function isAnthropicCreditExhausted(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  // Payment Required needs no interpretation.
  if (err.status === 402) return true;

  const body = err.error as
    | { error?: { message?: unknown; type?: unknown; details?: { error_code?: unknown } } }
    | undefined;
  if (err.status === 429) return body?.error?.details?.error_code === SPEND_CAP_CODE;
  // Otherwise only the two statuses Anthropic actually uses for it.
  if (err.status !== 400 && err.status !== 403) return false;

  const detail = typeof body?.error?.message === "string" ? body.error.message : "";
  const type = typeof body?.error?.type === "string" ? body.error.type : "";
  return CREDIT_EXHAUSTED.test(`${err.message} ${detail} ${type}`);
}

/** The string to alert on. Grep for it; it appears nowhere else. */
export const CREDIT_EXHAUSTED_LOG = "anthropic-credit-exhausted";

/** What a host is told. It does not say "try again" in the next breath, because
 * retrying is exactly what cannot help. */
export const GENERATION_PAUSED_MESSAGE = "Pack generation is paused — please try again later.";
