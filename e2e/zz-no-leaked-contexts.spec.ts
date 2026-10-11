import { test, expect } from "@playwright/test";

/**
 * Runs last (the files run in name order, on one worker), and says which live
 * game pages an earlier test left open.
 *
 * A context that is not closed keeps its pages, and a page on a live game
 * polls /api/sessions/CODE every 3 seconds for the rest of the run. In CI run
 * 37636138346 (attempt 3) the trace of quiz-flow showed three such pages, from
 * host-desk-no-peek and host-link-recovery, still polling four minutes after
 * the tests that opened them, when the database locked up.
 *
 * Only the pages that poll are checked: the host desk, a team's phone and the
 * TV display. A pack page, /pricing or /sign-in left open asks the server for
 * nothing.
 *
 * A failed test restarts the worker and its browser with it, so this can only
 * fail on a leak, never on the leftovers of another failure.
 */
const POLLING_PAGE = /^\/(host|play|tv)(\/|$)/;

test("no live game page outlives the test that opened it", async ({ browser }) => {
  const leaked = browser
    .contexts()
    .flatMap((context) => context.pages().map((page) => new URL(page.url()).pathname))
    .filter((pathname) => POLLING_PAGE.test(pathname));
  expect(leaked, "live game pages still open at the end of the run").toEqual([]);
});
