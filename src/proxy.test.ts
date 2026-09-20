import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";

/**
 * The proxy is an optimistic redirect and nothing more — the real check is
 * `auth.api.getSession` in src/lib/auth-guard.ts, which every gated page and
 * API runs for itself. These pin the two things the proxy must not get
 * wrong: it must not gate a public or team page, and it must not be mistaken
 * for a defence (the last block here forges a cookie and gets through).
 */

function request(pathname: string, cookie?: string) {
  return new NextRequest(`https://triviafoundry.com${pathname}`, {
    headers: cookie ? { cookie } : {},
  });
}

function redirectTarget(res: Response | undefined): URL | null {
  const location = res?.headers.get("location");
  return location ? new URL(location) : null;
}

describe("proxy — host pages", () => {
  it("sends a signed-out visitor to /sign-in, carrying where they were going", () => {
    for (const pathname of ["/create", "/packs", "/packs/abc123", "/packs/abc123/print", "/host/QUIZ42"]) {
      const target = redirectTarget(proxy(request(pathname)));
      expect(target?.pathname, pathname).toBe("/sign-in");
      expect(target?.searchParams.get("next"), pathname).toBe(pathname);
    }
  });

  it("carries the query string too, so a deep link survives signing in", () => {
    const req = new NextRequest("https://triviafoundry.com/create?brief=pub+quiz");
    expect(redirectTarget(proxy(req))?.searchParams.get("next")).toBe("/create?brief=pub+quiz");
  });
});

describe("proxy — everything else is left alone", () => {
  it("never redirects a public page", () => {
    for (const pathname of ["/", "/pricing", "/terms", "/privacy", "/refunds", "/sign-in"]) {
      expect(redirectTarget(proxy(request(pathname))), pathname).toBeNull();
    }
  });

  it("never redirects a team surface — teams do not sign in", () => {
    for (const pathname of ["/play", "/play/", "/playlist-of-quizzes"]) {
      expect(redirectTarget(proxy(request(pathname))), pathname).toBeNull();
    }
  });

  it("does not gate a path that merely starts with a host prefix's letters", () => {
    // "/packsomething" is not under "/packs"; a bare startsWith would say it was.
    for (const pathname of ["/packsomething", "/creation-story", "/hosting-guide"]) {
      expect(redirectTarget(proxy(request(pathname))), pathname).toBeNull();
    }
  });

  it("leaves /api to answer for itself, via the matcher", () => {
    // A redirect to an HTML page is a useless reply to `fetch`, so the API
    // tree is excluded here and every gated route answers 401 JSON instead.
    const matcher = Array.isArray(config.matcher) ? config.matcher[0] : config.matcher;
    const pattern = new RegExp(`^${matcher}$`);
    expect(pattern.test("/api/packs/generate")).toBe(false);
    expect(pattern.test("/api/auth/callback/google")).toBe(false);
    expect(pattern.test("/_next/static/chunk.js")).toBe(false);
    expect(pattern.test("/packs")).toBe(true);
  });
});

describe("proxy — a cookie is not a session", () => {
  it("lets any value of the session cookie straight through", () => {
    // Deliberate, and the reason this file is not a security test: the proxy
    // cannot validate a cookie cheaply, so it does not try. What stops this
    // forged cookie is src/lib/auth-guard.ts, one layer in.
    const forged = "better-auth.session_token=not-a-real-token";
    expect(redirectTarget(proxy(request("/packs", forged)))).toBeNull();
  });

  it("also accepts the __Secure- prefixed name used over HTTPS", () => {
    const secure = "__Secure-better-auth.session_token=whatever";
    expect(redirectTarget(proxy(request("/packs", secure)))).toBeNull();
  });
});
