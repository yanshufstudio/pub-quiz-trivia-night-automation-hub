import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LINK_CAPTURE_ENV,
  SignInEmailNotConfiguredError,
  capturedSignInLinks,
  clearCapturedSignInLinks,
  linkCaptureEnabled,
  sendSignInEmail,
} from "@/lib/sign-in-email";

/**
 * The capture exists so the e2e and integration suites can read a magic link
 * back without a mail provider. A capture that survived into production
 * would be a way to read other people's sign-in links out of a running
 * server, so the first block here is the one that matters.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearCapturedSignInLinks();
});

describe("linkCaptureEnabled — there must be no way to turn this on in production", () => {
  it("is off in production however SIGN_IN_LINK_CAPTURE is set", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on", " 1 ", "0", ""]) {
      expect(
        linkCaptureEnabled({ NODE_ENV: "production", [LINK_CAPTURE_ENV]: value } as NodeJS.ProcessEnv),
        `NODE_ENV=production with ${LINK_CAPTURE_ENV}=${JSON.stringify(value)}`
      ).toBe(false);
    }
  });

  it("is off in production even with no RESEND_API_KEY to displace", () => {
    expect(
      linkCaptureEnabled({ NODE_ENV: "production", [LINK_CAPTURE_ENV]: "1" } as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it("is off outside production unless the flag is exactly \"1\"", () => {
    for (const value of [undefined, "", "0", "true", "yes", "2", " 1"]) {
      expect(
        linkCaptureEnabled({ NODE_ENV: "test", [LINK_CAPTURE_ENV]: value } as NodeJS.ProcessEnv),
        `${LINK_CAPTURE_ENV}=${JSON.stringify(value)}`
      ).toBe(false);
    }
  });

  it("is off whenever a real mail provider is configured", () => {
    expect(
      linkCaptureEnabled({
        NODE_ENV: "test",
        [LINK_CAPTURE_ENV]: "1",
        RESEND_API_KEY: "re_live_key",
      } as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it("is on only for the exact test-shaped environment", () => {
    expect(linkCaptureEnabled({ NODE_ENV: "test", [LINK_CAPTURE_ENV]: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe("capturedSignInLinks", () => {
  it("returns nothing when capture is off, rather than links from another configuration", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(LINK_CAPTURE_ENV, "1");
    vi.stubEnv("RESEND_API_KEY", "");
    await sendSignInEmail({ email: "a@example.test", url: "https://x.test/verify?token=abc" });
    expect(capturedSignInLinks()).toHaveLength(1);

    // The same process, capture switched off: nothing is readable.
    vi.stubEnv(LINK_CAPTURE_ENV, "0");
    expect(capturedSignInLinks()).toHaveLength(0);

    vi.stubEnv(LINK_CAPTURE_ENV, "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(capturedSignInLinks()).toHaveLength(0);
  });
});

describe("sendSignInEmail", () => {
  it("throws in production when RESEND_API_KEY is missing, rather than silently not sending", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "quiz@triviafoundry.com");

    await expect(
      sendSignInEmail({ email: "a@example.test", url: "https://x.test/v?token=1" })
    ).rejects.toBeInstanceOf(SignInEmailNotConfiguredError);
  });

  it("throws when a key is configured but EMAIL_FROM is not", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    vi.stubEnv("EMAIL_FROM", "");

    await expect(
      sendSignInEmail({ email: "a@example.test", url: "https://x.test/v?token=1" })
    ).rejects.toBeInstanceOf(SignInEmailNotConfiguredError);
  });

  it("posts the link to Resend when configured, and never captures it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    vi.stubEnv("EMAIL_FROM", "TriviaFoundry <quiz@triviafoundry.com>");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://triviafoundry.com/api/auth/magic-link/verify?token=t0ken";
    await sendSignInEmail({ email: "host@example.test", url });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_live_key");

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("TriviaFoundry <quiz@triviafoundry.com>");
    expect(body.to).toEqual(["host@example.test"]);
    expect(body.text).toContain(url);
    expect(body.html).toContain(url);

    expect(capturedSignInLinks()).toHaveLength(0);
  });

  it("surfaces a Resend rejection instead of reporting a send that never happened", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    vi.stubEnv("EMAIL_FROM", "quiz@triviafoundry.com");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("domain not verified", { status: 403 })));

    await expect(
      sendSignInEmail({ email: "host@example.test", url: "https://x.test/v?token=1" })
    ).rejects.toThrow(/HTTP 403/);
  });

  it("logs the link outside production when nothing is configured, so local dev works", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv(LINK_CAPTURE_ENV, "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await sendSignInEmail({ email: "dev@example.test", url: "http://localhost:3000/v?token=1" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("http://localhost:3000/v?token=1"));
    log.mockRestore();
  });
});
