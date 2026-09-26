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
