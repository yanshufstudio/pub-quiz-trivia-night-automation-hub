import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/.claude/**"],
    globalSetup: "./vitest.integration.setup.ts",
    env: {
      DATABASE_URL: `file:${path.resolve(__dirname, "prisma/test.db")}`,
      // Host routes need a real session, so the suite signs in for real. The
      // magic link has to be readable back, which is what SIGN_IN_LINK_CAPTURE
      // does — and it does nothing at all unless NODE_ENV is not "production"
      // and RESEND_API_KEY is unset (src/lib/sign-in-email.ts, asserted in
      // src/lib/sign-in-email.test.ts).
      SIGN_IN_LINK_CAPTURE: "1",
      BETTER_AUTH_SECRET: "integration-suite-secret-not-used-anywhere-else",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
    fileParallelism: false,
  },
});
