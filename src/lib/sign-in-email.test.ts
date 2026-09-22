import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMAIL_CAPTURE_ENV,
  SignInEmailNotConfiguredError,
  capturedSignInEmails,
  clearCapturedSignInEmails,
  sendSignInEmail,
  signInEmailCaptureEnabled,
} from "@/lib/sign-in-email";
import { CONTACT_EMAIL } from "@/lib/site";

/**
 * The capture exists so the e2e and integration suites can read a sign-in
 * code back without a mail provider. A capture that survived into production
 * would be a way to read other people's sign-in codes out of a running
 * server, so the first block here is the one that matters.
 */

const CONFIRM_URL = "https://x.test/sign-in/confirm?email=a%40example.test&code=123456";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearCapturedSignInEmails();
});

describe("signInEmailCaptureEnabled — there must be no way to turn this on in production", () => {
  it("is off in production however SIGN_IN_EMAIL_CAPTURE is set", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on", " 1 ", "0", ""]) {
      expect(
        signInEmailCaptureEnabled({ NODE_ENV: "production", [EMAIL_CAPTURE_ENV]: value } as NodeJS.ProcessEnv),
        `NODE_ENV=production with ${EMAIL_CAPTURE_ENV}=${JSON.stringify(value)}`
      ).toBe(false);
    }
  });

  it("is off in production even with no RESEND_API_KEY to displace", () => {
    expect(
      signInEmailCaptureEnabled({ NODE_ENV: "production", [EMAIL_CAPTURE_ENV]: "1" } as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it("is off outside production unless the flag is exactly \"1\"", () => {
    for (const value of [undefined, "", "0", "true", "yes", "2", " 1"]) {
      expect(
        signInEmailCaptureEnabled({ NODE_ENV: "test", [EMAIL_CAPTURE_ENV]: value } as NodeJS.ProcessEnv),
        `${EMAIL_CAPTURE_ENV}=${JSON.stringify(value)}`
      ).toBe(false);
    }
  });

  it("is off whenever a real mail provider is configured", () => {
    expect(
      signInEmailCaptureEnabled({
        NODE_ENV: "test",
        [EMAIL_CAPTURE_ENV]: "1",
        RESEND_API_KEY: "re_live_key",
      } as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it("is on only for the exact test-shaped environment", () => {
    expect(signInEmailCaptureEnabled({ NODE_ENV: "test", [EMAIL_CAPTURE_ENV]: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe("capturedSignInEmails", () => {
  it("returns nothing when capture is off, rather than codes from another configuration", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(EMAIL_CAPTURE_ENV, "1");
    vi.stubEnv("RESEND_API_KEY", "");
    await sendSignInEmail({ email: "a@example.test", code: "123456", url: CONFIRM_URL });
    expect(capturedSignInEmails()).toHaveLength(1);

    // The same process, capture switched off: nothing is readable.
    vi.stubEnv(EMAIL_CAPTURE_ENV, "0");
    expect(capturedSignInEmails()).toHaveLength(0);

    vi.stubEnv(EMAIL_CAPTURE_ENV, "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(capturedSignInEmails()).toHaveLength(0);
  });
});

describe("sendSignInEmail", () => {
  it("throws in production when RESEND_API_KEY is missing, rather than silently not sending", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "quiz@triviafoundry.com");

    await expect(
      sendSignInEmail({ email: "a@example.test", code: "123456", url: CONFIRM_URL })
    ).rejects.toBeInstanceOf(SignInEmailNotConfiguredError);
  });

  it("throws when a key is configured but EMAIL_FROM is not", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    vi.stubEnv("EMAIL_FROM", "");

    await expect(
      sendSignInEmail({ email: "a@example.test", code: "123456", url: CONFIRM_URL })
    ).rejects.toBeInstanceOf(SignInEmailNotConfiguredError);
  });

  it("posts the code and the link to Resend when configured, and never captures either", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    vi.stubEnv("EMAIL_FROM", "TriviaFoundry <quiz@triviafoundry.com>");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://triviafoundry.com/sign-in/confirm?email=host%40example.test&code=424242";
    await sendSignInEmail({ email: "host@example.test", code: "424242", url });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_live_key");

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("TriviaFoundry <quiz@triviafoundry.com>");
    expect(body.to).toEqual(["host@example.test"]);
    expect(body.text).toContain(url);
    expect(body.html).toContain(url);
    // Both halves, because a host reading this on a phone with the quiz set
    // up on a pub PC needs the digits, not the link.
    expect(body.text).toContain("424242");
    expect(body.html).toContain("424242");

    // Replying to the code is the obvious move when it does not work, and
    // the From domain has no inbox behind it. `reply_to` is the REST API's
    // spelling — Resend's own SDK maps its `replyTo` option onto exactly
    // this field — so a camelCase key here would be accepted and ignored.
    expect(body.reply_to).toBe(CONTACT_EMAIL);
    expect(body.replyTo).toBeUndefined();

    expect(capturedSignInEmails()).toHaveLength(0);
  });

  it("surfaces a Resend rejection instead of reporting a send that never happened", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    vi.stubEnv("EMAIL_FROM", "quiz@triviafoundry.com");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("domain not verified", { status: 403 })));

    await expect(
      sendSignInEmail({ email: "host@example.test", code: "123456", url: CONFIRM_URL })
    ).rejects.toThrow(/HTTP 403/);
  });

  it("logs the code outside production when nothing is configured, so local dev works", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv(EMAIL_CAPTURE_ENV, "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await sendSignInEmail({
      email: "dev@example.test",
      code: "654321",
      url: "http://localhost:3000/sign-in/confirm?email=dev%40example.test&code=654321",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("654321"));
    log.mockRestore();
  });
});
