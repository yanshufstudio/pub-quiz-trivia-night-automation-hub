import path from "node:path";
import { createClient } from "@libsql/client";

/**
 * Turn a freshly created e2e session into a one-question-at-a-time session.
 *
 * New games are round mode only (RM0), but sessions already running when
 * round mode shipped keep the old flow, and one spec (quiz-flow) keeps walking
 * it in a real browser. Written straight to the e2e database — the same file
 * the dev server under test uses (playwright.config.ts) — because no route
 * creates a QUESTION-mode session any more, on purpose.
 */
export async function switchToQuestionMode(code: string) {
  const db = createClient({ url: `file:${path.resolve(__dirname, "../prisma/e2e.db")}` });
  try {
    await db.execute({ sql: `UPDATE "Session" SET "mode" = 'QUESTION' WHERE "code" = ?`, args: [code] });
  } finally {
    db.close();
  }
}
