import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as readInbox, DELETE as clearInbox } from "@/app/api/test/sign-in-emails/route";
import { EMAIL_CAPTURE_ENV } from "@/lib/sign-in-email";
import { requestSignInCode } from "./auth-fixture";

/**
 * The e2e suite reads sign-in codes back through an HTTP route, because a
 * browser cannot open an email. This is the test that the route is
 * unreachable in production — the requirement that makes the convenience
 * acceptable at all.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/test/sign-in-emails", () => {
  it("serves the captured emails in the test environment", async () => {
    const address = `readback-${Math.random().toString(36).slice(2)}@example.test`;
    const code = await requestSignInCode(address);

    const res = await readInbox();
    expect(res.status).toBe(200);
    const { emails } = await res.json();
    expect(emails.at(-1).email).toBe(address);
    expect(emails.at(-1).code).toBe(code);
    // The link is a page of ours carrying the same code, never an endpoint
    // that would spend it on a GET.
    expect(emails.at(-1).url).toContain("/sign-in/confirm?email=");
    expect(emails.at(-1).url).toContain(`code=${code}`);
  });

  it("404s in production, whatever else is configured", async () => {
    for (const captureFlag of ["1", "true", "0", ""]) {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv(EMAIL_CAPTURE_ENV, captureFlag);
      vi.stubEnv("RESEND_API_KEY", "");

      const res = await readInbox();
      expect(res.status, `${EMAIL_CAPTURE_ENV}=${captureFlag}`).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });

      const deleted = await clearInbox();
      expect(deleted.status).toBe(404);
    }
  });

  it("404s outside production too unless the capture flag is set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(EMAIL_CAPTURE_ENV, "");
    expect((await readInbox()).status).toBe(404);
  });

  it("404s whenever a real mail provider is configured, even in development", async () => {
    // Capture replaces sending; it never runs alongside it, so a deploy that
    // can actually mail people can never also park a copy here.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(EMAIL_CAPTURE_ENV, "1");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    expect((await readInbox()).status).toBe(404);
  });

  it("says nothing that distinguishes it from a route that does not exist", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await readInbox();
    expect(res.status).toBe(404);
    // No 403, no "disabled", no hint that a capture exists at all.
    expect(JSON.stringify(await res.json())).not.toMatch(/capture|disabled|forbidden|test/i);
  });
});
