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
