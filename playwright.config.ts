import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 4517;
const dbPath = path.resolve(__dirname, "prisma/e2e.db");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: `file:${dbPath}`,
      // A browser cannot open an email, so the suite reads the sign-in code
      // back from GET /api/test/sign-in-emails. That route only answers when
      // capture is on, which needs NODE_ENV !== "production" AND this flag
      // AND no RESEND_API_KEY — see src/lib/sign-in-email.ts and the tests
      // in src/test/sign-in-email-readback.integration.test.ts.
      SIGN_IN_EMAIL_CAPTURE: "1",
      RESEND_API_KEY: "",
      // The suite signs in dozens of times over a run, and every one of those
      // goes over HTTP through the real route — so they count against M2's
      // per-day cap on sign-in codes (default 60). At 143 tests the run is under
      // it, but not by much, and the failure mode is nasty: the cap is global for
      // the day, so the tests that tripped it would fail with a 429 about email
      // volume and nothing pointing at the real cause. Raised here rather than
      // lowering the real default, which is a production number chosen against
      // Resend's shared allowance.
      SIGNIN_CODE_DAILY_LIMIT: "100000",
      BETTER_AUTH_SECRET: "e2e-suite-secret-not-used-anywhere-else",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      // Paddle, with test values: enough for /pricing to offer checkout and
      // for /api/paddle/webhook to verify what the suite sends it. Nothing
      // reaches Paddle — e2e/pro-upgrade.spec.ts stands in for Paddle.js, and
      // plays Paddle's side of the webhook itself.
      NEXT_PUBLIC_PADDLE_ENV: "sandbox",
      NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_e2e_client_token",
      NEXT_PUBLIC_PADDLE_PRICE_MONTHLY: "pri_e2e_monthly",
      NEXT_PUBLIC_PADDLE_PRICE_ANNUAL: "pri_e2e_annual",
      PADDLE_NOTIFICATION_WEBHOOK_SECRET: "e2e-paddle-webhook-secret-not-used-anywhere-else",
    },
  },
});
