import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  CREDIT_EXHAUSTED_LOG,
  GENERATION_PAUSED_MESSAGE,
  isAnthropicCreditExhausted,
  MissingApiKeyError,
} from "@/lib/anthropic";

/**
 * The one upstream generation failure that a retry cannot fix (H3).
 *
 * An exhausted Anthropic account arrives as an ordinary `invalid_request_error`
 * — a 400 whose text names the credit balance — so `Anthropic.BadRequestError`
 * covers it and a malformed request alike, and there is no typed class to match
 * on. That is why this reads the message, and why the test list below is mostly
 * about *not* over-matching.
 */

function apiError(status: number, message: string, type = "invalid_request_error") {
  return new Anthropic.APIError(status, { error: { type, message } }, message, undefined);
}

describe("isAnthropicCreditExhausted", () => {
  it("recognises the message Anthropic actually sends", () => {
    expect(
      isAnthropicCreditExhausted(
        apiError(
          400,
          "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."
        )
      )
    ).toBe(true);
  });

  it("takes a 402 on status alone, which needs no interpretation", () => {
    expect(isAnthropicCreditExhausted(apiError(402, "Payment Required"))).toBe(true);
  });

  it("recognises the other phrasings of the same thing", () => {
    for (const message of [
      "insufficient funds on this account",
      "insufficient credit",
      "monthly quota exceeded",
      "billing is not configured for this organization",
    ]) {
      expect(isAnthropicCreditExhausted(apiError(400, message)), message).toBe(true);
    }
  });

  it("does not claim an ordinary bad request is an exhausted account", () => {
    // The failure that matters: telling a host to wait for something that is
    // never going to change, when what they actually sent was malformed.
    for (const message of [
      "max_tokens: must be greater than 0",
      "messages: at least one message is required",
      "model: unknown model",
    ]) {
      expect(isAnthropicCreditExhausted(apiError(400, message)), message).toBe(false);
    }
  });

  it("does not claim a rate limit or an outage is an exhausted account", () => {
    // These are the cases where retrying *is* the right advice, and they keep
    // their own 503 message.
    expect(isAnthropicCreditExhausted(apiError(429, "rate_limit_error", "rate_limit_error"))).toBe(false);
    expect(isAnthropicCreditExhausted(apiError(500, "internal server error", "api_error"))).toBe(false);
    expect(isAnthropicCreditExhausted(apiError(529, "overloaded", "overloaded_error"))).toBe(false);
  });

  it("ignores anything that is not an Anthropic API error at all", () => {
    expect(isAnthropicCreditExhausted(new Error("credit balance is too low"))).toBe(false);
    expect(isAnthropicCreditExhausted(new MissingApiKeyError())).toBe(false);
    expect(isAnthropicCreditExhausted(null)).toBe(false);
    expect(isAnthropicCreditExhausted(undefined)).toBe(false);
  });
});

describe("what it says and logs", () => {
  it("does not tell a host to try again in the next breath", () => {
    // "Please try again" is what the generic 502 said, and it is the one thing
    // that cannot help here.
    expect(GENERATION_PAUSED_MESSAGE).toBe("Pack generation is paused — please try again later.");
    expect(GENERATION_PAUSED_MESSAGE).not.toMatch(/credit|billing|account|balance/i);
  });

  it("has a log string worth alerting on", () => {
    expect(CREDIT_EXHAUSTED_LOG).toBe("anthropic-credit-exhausted");
  });
});
