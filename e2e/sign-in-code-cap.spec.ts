import { test, expect } from "@playwright/test";
import { newAnonContext, pageAlert } from "./sign-in-helper";

/**
 * When we will not email another code, the form says so and Google still works
 * (M2).
 *
 * Resend's free plan allows 100 emails a day and that allowance is shared with
 * another product on the same account, so the cap protects something outside
 * this app. What matters on the page is that the refusal reads as a limit with a
 * way through it, rather than as "check the address and try again" — which is
 * what a swallowed refusal used to produce.
 *
 * This exercises the per-address cap (3 an hour by default) because a spec
 * cannot change the running server's environment to shrink the daily one. The
 * day's cap shares the same code path and refusal shape; its wording and its
 * mapping to the page are covered in src/lib/sign-in-limits.test.ts and
 * src/test/sign-in-code-limits.integration.test.ts.
 */
test("the form names the cap, and the refusal disables nothing", async ({ browser, baseURL }) => {
  const context = await newAnonContext(browser, baseURL!);
  const page = await context.newPage();
  const address = `capped-${Math.random().toString(36).slice(2)}@example.test`;

  // Spend the address's hourly allowance through the real endpoint. Three, which
  // is the default cap and under Better Auth's own 5-per-60s per-IP rule.
  for (let i = 0; i < 3; i++) {
    const res = await context.request.post("/api/auth/email-otp/send-verification-otp", {
      data: { email: address, type: "sign-in" },
    });
    expect(res.status(), `request ${i + 1} should have been sent`).toBe(200);
  }

  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(address);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();

  // The refusal, in words that say what to do instead.
  await expect(pageAlert(page)).toContainText("Too many codes sent to that address");
  await expect(pageAlert(page)).toContainText("Google");

  // Not the generic "check the address" wording, which is what a swallowed
  // refusal produced, and not the one-minute throttle message either.
  await expect(pageAlert(page)).not.toContainText("Check the address");
  await expect(pageAlert(page)).not.toContainText("Wait a minute");

  // The refusal disables nothing. The Google button is rendered only when
  // Google is configured (`googleEnabled` in SignInForm), and the e2e server
  // sets no Google credentials — Google sign-in cannot work on anything but the
  // production domain anyway, since the OAuth client registers exactly one
  // redirect URI. So this asserts what is true in both cases: if the button is
  // there, being capped has not taken it away or disabled it.
  const google = page.getByRole("button", { name: "Continue with Google" });
  if ((await google.count()) > 0) {
    await expect(google).toBeVisible();
    await expect(google).toBeEnabled();
  }

  // The email form is still usable — the refusal did not replace the page with
  // an error state.
  await expect(page.getByLabel("Email address")).toBeEditable();
  await expect(page.getByRole("button", { name: "Email me a sign-in code" })).toBeEnabled();

  // And it stayed on the ask-for-a-code step rather than pretending a code was
  // on its way, which is what the swallowed refusal did.
  await expect(page.getByLabel("Sign-in code")).toHaveCount(0);
});
