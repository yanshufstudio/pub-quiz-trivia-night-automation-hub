import { describe, expect, it } from "vitest";
import { IN_APP_BROWSER_NOTICE, isInAppBrowser } from "@/lib/in-app-browser";

/**
 * Recognising an app's embedded browser (N3).
 *
 * Google refuses OAuth inside embedded webviews, and the person sees Google's
 * refusal rather than ours. The notice can only be worth showing if it is right,
 * so the false-positive cases below matter at least as much as the true ones: a
 * false negative costs nothing (the unconditional line on /sign-in still applies
 * and the email code still works), while a false positive tells somebody in a
 * perfectly good browser that their sign-in may be blocked.
 */

// Real-shaped user agents, trimmed to what matters.
const IN_APP = {
  "LinkedIn on iOS":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.1",
  "Facebook on iOS":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone15,2;FBMD/iPhone]",
  "Facebook on Android":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 [FBAV/468.0.0.35.108;]",
  Instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 330.0.0.40.92",
  LINE: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/14.9.0",
  "a generic Android WebView":
    "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36",
};

const REAL_BROWSERS = {
  "Chrome on Android":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
  "Safari on iOS":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Chrome on macOS":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Firefox on Linux":
    "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
  /**
   * The case worth naming. LinkedIn on Android opens a Chrome Custom Tab, which is
   * a real Chrome sending a normal Chrome user agent with no LinkedIn token in it,
   * and Google sign-in works there — tested 27 Sep. So this must NOT be flagged,
   * and it is not flagged because the token that catches LinkedIn is the iOS
   * webview's.
   */
  "LinkedIn on Android (a Chrome Custom Tab)":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
};

describe("isInAppBrowser", () => {
  it.each(Object.entries(IN_APP))("flags %s", (_name, ua) => {
    expect(isInAppBrowser(ua)).toBe(true);
  });

  it.each(Object.entries(REAL_BROWSERS))("does not flag %s", (_name, ua) => {
    expect(isInAppBrowser(ua)).toBe(false);
  });

  it("does not flag a word that merely contains a token", () => {
    // "Line/" carries its slash for this reason: without it, an "outline" or a
    // "Linux" build string would match.
    expect(isInAppBrowser("Mozilla/5.0 (X11; Linux x86_64) Outline/1.0")).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 Linux Lineage/21")).toBe(false);
  });

  it("does not flag an Android UA that merely mentions a version, not a webview", () => {
    // The webview marker is "; wv)" specifically — "Version/4.0" alone is not it.
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36"
      )
    ).toBe(false);
  });

  it("needs the whole `; wv)` marker, not the letters w and v somewhere", () => {
    /**
     * Constructed rather than observed: I have no real user agent to hand where
     * "wv" appears outside the webview marker, and Android build tokens are
     * arbitrary alphanumerics, so one could. Mutation testing is why this exists —
     * loosening the token to a bare "wv" left every other case in this file
     * passing, which meant the precision of that marker was untested.
     */
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/TQ3A.wv230605.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36"
      )
    ).toBe(false);
  });

  it("says nothing when there is no user agent to read", () => {
    expect(isInAppBrowser(null)).toBe(false);
    expect(isInAppBrowser(undefined)).toBe(false);
    expect(isInAppBrowser("")).toBe(false);
  });
});

describe("the notice", () => {
  it("says where they are, what may happen, and both ways out", () => {
    expect(IN_APP_BROWSER_NOTICE).toBe(
      "You're in an in-app browser. Google may block sign-in here — use the email code below, " +
        "or open this page in your browser."
    );
  });

  it("does not claim Google will definitely fail", () => {
    // It may not: some in-app browsers let it through, and being told a thing is
    // broken when it works is its own kind of wrong.
    expect(IN_APP_BROWSER_NOTICE).toContain("may block");
    expect(IN_APP_BROWSER_NOTICE).not.toMatch(/will block|cannot sign|won't work/i);
  });
});
