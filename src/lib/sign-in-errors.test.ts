import { describe, expect, it } from "vitest";
import {
  RATE_LIMITED_MESSAGE,
  googleSignInError,
  isRateLimited,
  signInCodeError,
  signInSendError,
} from "@/lib/sign-in-errors";

/**
 * The wording rules, which are a security property as much as a copy one.
 *
 * Everything except a 429 has to read the same whatever went wrong, or the
 * form becomes a way to test whether an address has an account. A 429 is the
 * exception and has to be named, because the limiter knows nothing about the
 * address and sending someone off to re-read it is advice about the wrong
 * thing entirely.
 */

describe("isRateLimited", () => {
  it("is true only for a 429", () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
    for (const err of [null, undefined, {}, { status: 400 }, { status: 500 }, { code: "INVALID_OTP" }]) {
      expect(isRateLimited(err), JSON.stringify(err)).toBe(false);
    }
  });
});

describe("a throttled attempt is named, wherever it happens", () => {
  it("says to wait, on all four failure surfaces", () => {
    const throttled = { status: 429 };
    expect(signInSendError(throttled)).toBe(RATE_LIMITED_MESSAGE);
    expect(googleSignInError(throttled)).toBe(RATE_LIMITED_MESSAGE);
    expect(signInCodeError(throttled)).toBe(RATE_LIMITED_MESSAGE);
    expect(signInCodeError(throttled, { fromLink: true })).toBe(RATE_LIMITED_MESSAGE);
  });

  it("mentions waiting and not the address", () => {
    // The whole point of the change: the old wording told a throttled
    // person to re-read an email address that was never the problem.
    expect(RATE_LIMITED_MESSAGE).toMatch(/wait/i);
    expect(RATE_LIMITED_MESSAGE).not.toMatch(/address|email|code|link/i);
  });

  it("wins over the code table, which a 429 never reaches anyway", () => {
    // A throttled request is refused before the endpoint runs, so there is
    // no `code` on it — without the check first this fell through to the
    // generic fallback and told someone to ask for a fresh code they were
    // about to be throttled out of asking for.
    expect(signInCodeError({ status: 429, code: "INVALID_OTP" })).toBe(RATE_LIMITED_MESSAGE);
  });
});

describe("everything else stays indistinguishable", () => {
  it("says the same thing for a send failure however it failed", () => {
    const messages = new Set(
      [{ status: 400 }, { status: 500 }, { status: 503 }, {}, null, { code: "WHATEVER" }].map(signInSendError)
    );
    expect(messages.size).toBe(1);
    expect([...messages][0]).not.toMatch(/exist|account|unknown|found/i);
  });

  it("maps the three code failures, and falls back for anything else", () => {
    expect(signInCodeError({ status: 400, code: "INVALID_OTP" })).toMatch(/didn't match/);
    expect(signInCodeError({ status: 400, code: "OTP_EXPIRED" })).toMatch(/expired/);
    expect(signInCodeError({ status: 403, code: "TOO_MANY_ATTEMPTS" })).toMatch(/Too many wrong codes/);
    expect(signInCodeError({ status: 400, code: "SOMETHING_NEW" })).toMatch(/Couldn't sign you in/);
    expect(signInCodeError(null)).toMatch(/Couldn't sign you in/);
  });

  it("words a link failure for someone with nothing to correct", () => {
    // They pressed a button on a page they arrived at from an email; there
    // are no digits for them to check.
    expect(signInCodeError({ code: "INVALID_OTP" }, { fromLink: true })).toMatch(/no longer works/);
    expect(signInCodeError({ code: "INVALID_OTP" }, { fromLink: true })).not.toMatch(/six digits/);
  });
});
