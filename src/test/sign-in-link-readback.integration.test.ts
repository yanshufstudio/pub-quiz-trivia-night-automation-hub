import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as readLinks, DELETE as clearLinks } from "@/app/api/test/sign-in-links/route";
import { LINK_CAPTURE_ENV } from "@/lib/sign-in-email";
import { requestMagicLink } from "./auth-fixture";

/**
 * The e2e suite reads magic links back through an HTTP route, because a
 * browser cannot open an email. This is the test that the route is
 * unreachable in production — the requirement that makes the convenience
 * acceptable at all.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/test/sign-in-links", () => {
  it("serves the captured links in the test environment", async () => {
    const address = `readback-${Math.random().toString(36).slice(2)}@example.test`;
    await requestMagicLink(address);

    const res = await readLinks();
    expect(res.status).toBe(200);
    const { links } = await res.json();
    expect(links.at(-1).email).toBe(address);
    expect(links.at(-1).url).toContain("/api/auth/magic-link/verify?token=");
  });

  it("404s in production, whatever else is configured", async () => {
    for (const captureFlag of ["1", "true", "0", ""]) {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv(LINK_CAPTURE_ENV, captureFlag);
      vi.stubEnv("RESEND_API_KEY", "");

      const res = await readLinks();
      expect(res.status, `${LINK_CAPTURE_ENV}=${captureFlag}`).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });

      const deleted = await clearLinks();
      expect(deleted.status).toBe(404);
    }
  });

  it("404s outside production too unless the capture flag is set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(LINK_CAPTURE_ENV, "");
    expect((await readLinks()).status).toBe(404);
  });

  it("404s whenever a real mail provider is configured, even in development", async () => {
    // Capture replaces sending; it never runs alongside it, so a deploy that
    // can actually mail people can never also park a copy here.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(LINK_CAPTURE_ENV, "1");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    expect((await readLinks()).status).toBe(404);
  });

  it("says nothing that distinguishes it from a route that does not exist", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await readLinks();
    expect(res.status).toBe(404);
    // No 403, no "disabled", no hint that a capture exists at all.
    expect(JSON.stringify(await res.json())).not.toMatch(/capture|disabled|forbidden|test/i);
  });
});
