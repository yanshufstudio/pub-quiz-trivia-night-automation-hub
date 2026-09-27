import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The in-app-browser line on /sign-in.
 *
 * Asserted against the source rather than a rendered page, which is a weaker
 * test than this file would like. The line only renders when Google sign-in is
 * configured (`googleEnabled`), and it cannot be: the OAuth client registers
 * exactly one redirect URI, on the production domain, so neither the e2e server
 * nor a preview deploy can offer Google at all. There is no component-render
 * setup in this project either. What is left worth guarding is that the sentence
 * exists, says the right thing, and sits with the Google button rather than
 * drifting off somewhere it makes no sense.
 */

const SOURCE = readFileSync(path.join("src", "app", "sign-in", "SignInForm.tsx"), "utf8");

describe("/sign-in tells people what to do when Google refuses", () => {
  it("carries the sentence, unbroken by formatting", () => {
    // Collapsed because the JSX wraps it across lines and an apostrophe is
    // escaped.
    const flat = SOURCE.replace(/\s+/g, " ").replace(/&apos;/g, "'");
    expect(flat).toContain(
      "Opened this from LinkedIn or another app? If Google won't let you in, use the email code below."
    );
  });

  it("sits inside the Google block, under the button", () => {
    const googleBlock = SOURCE.indexOf("googleEnabled ? (");
    const button = SOURCE.indexOf("Continue with Google");
    const line = SOURCE.indexOf("Opened this from LinkedIn");
    const blockEnd = SOURCE.indexOf(") : null}", googleBlock);

    expect(googleBlock).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(button);
    expect(line).toBeLessThan(blockEnd);
  });

  it("is not gated on sniffing the user agent", () => {
    // N3 adds a narrower, UA-detected notice. This one is unconditional because
    // it is true whether or not that guess is right, and a person whose app we
    // failed to recognise is exactly the person who needs it.
    const line = SOURCE.indexOf("Opened this from LinkedIn");
    const surrounding = SOURCE.slice(Math.max(0, line - 400), line);
    expect(surrounding).not.toMatch(/userAgent|navigator|LinkedInApp|FBAN|Instagram/);
  });
});

/**
 * N3's narrower notice, and its wiring.
 *
 * Same limitation as above — it renders only where Google is configured, which no
 * test environment can be — so what is guarded here is that it is wired to the
 * detector, sits with the Google button, and replaces the unconditional line
 * rather than stacking with it. The detection itself is covered properly in
 * src/lib/in-app-browser.test.ts.
 */
describe("/sign-in names an in-app browser when it can tell (N3)", () => {
  it("renders the shared notice constant rather than a second copy of the words", () => {
    expect(SOURCE).toContain("IN_APP_BROWSER_NOTICE");
    // The string itself must not be retyped here — two copies drift.
    expect(SOURCE).not.toContain("You&apos;re in an in-app browser");
    expect(SOURCE).not.toContain("You're in an in-app browser");
  });

  it("decides from the user agent after mount, not during render", () => {
    // This is a client component but Next still server-renders it, where there is
    // no navigator: deciding in the render body would make the first client paint
    // disagree with the server's HTML.
    expect(SOURCE).toMatch(/useEffect\([\s\S]*?isInAppBrowser\(window\.navigator\.userAgent\)/);
    const renderStart = SOURCE.indexOf("let body");
    const guard = SOURCE.indexOf("inAppBrowser ?");
    expect(guard).toBeGreaterThan(-1);
    // The guard is in the JSX, and the JSX comes after the effect.
    expect(guard).toBeGreaterThan(SOURCE.indexOf("useEffect("));
    void renderStart;
  });

  it("replaces the unconditional line rather than stacking with it", () => {
    // "You are in one" and "if you are in one" next to each other reads like the
    // page is unsure which.
    const guard = SOURCE.indexOf("inAppBrowser ?");
    const fallback = SOURCE.indexOf("Opened this from LinkedIn", guard);
    expect(fallback).toBeGreaterThan(guard);
    // ...on the `else` side of the same ternary.
    expect(SOURCE.slice(guard, fallback)).toContain(") : (");
  });

  it("sits inside the Google block, where the advice makes sense", () => {
    const googleBlock = SOURCE.indexOf("googleEnabled ? (");
    const blockEnd = SOURCE.indexOf(") : null}", googleBlock);
    const guard = SOURCE.indexOf("inAppBrowser ?");
    expect(guard).toBeGreaterThan(googleBlock);
    expect(guard).toBeLessThan(blockEnd);
  });
});
