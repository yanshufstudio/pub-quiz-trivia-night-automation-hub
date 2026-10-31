import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { request, type FullConfig } from "@playwright/test";

/** A join code and an id that nothing in the suite has. */
const CODE = "WARMU";
const ID = "warm-up";

/**
 * Every route the suite uses, requested once before the first test.
 *
 * The suite runs against `next dev`, which builds a route on its first request
 * and now and then resets that first connection (ECONNRESET): seen on the quiz
 * share pictures, the sign-in helper and tie-ending's own advance. Building
 * them here, where a reset is simply sent again, keeps those resets out of the
 * tests. Nothing here changes anything: a page is only rendered, and an API
 * route gets a GET, which it either reads or refuses (405 where it has none).
 */
const WARM_UP = [
  "/",
  "/faq",
  "/how-it-works",
  "/pricing",
  "/privacy",
  "/terms",
  "/refunds",
  "/sign-in",
  "/sign-in/confirm",
  "/play",
  "/create",
  "/packs",
  `/packs/${ID}`,
  `/packs/${ID}/print`,
  `/host/${CODE}`,
  `/tv/${CODE}`,
  "/quizzes",
  "/quizzes/halloween",
  "/quizzes/halloween.png",
  "/quizzes/bonfire-night",
  "/quizzes/bonfire-night.png",
  "/quizzes/thanksgiving",
  "/quizzes/thanksgiving.png",
  "/og.png",
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/api/auth/get-session",
  "/api/sessions",
  `/api/sessions/${CODE}`,
  `/api/sessions/${CODE}/advance`,
  `/api/sessions/${CODE}/answers`,
  `/api/sessions/${CODE}/answers/${ID}`,
  `/api/sessions/${CODE}/display`,
  `/api/sessions/${CODE}/host-key`,
  `/api/sessions/${CODE}/join`,
  `/api/sessions/${CODE}/leave`,
  `/api/sessions/${CODE}/round-scores`,
  `/api/sessions/${CODE}/teams`,
  "/api/packs",
  "/api/packs/import",
  "/api/packs/seed",
  `/api/packs/${ID}`,
  `/api/packs/${ID}/export`,
  "/api/questions",
  `/api/questions/${ID}`,
  `/api/questions/${ID}/media`,
  `/api/rounds/${ID}`,
  `/api/rounds/${ID}/move`,
  "/api/creator/status",
  "/api/billing/checkout",
  "/api/paddle/webhook",
  "/api/test/sign-in-emails",
];

export default async function globalSetup(config: FullConfig) {
  const dbPath = path.resolve(__dirname, "../prisma/e2e.db");
  if (existsSync(dbPath)) rmSync(dbPath);
  if (existsSync(`${dbPath}-journal`)) rmSync(`${dbPath}-journal`);

  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: "inherit",
  });

  // Playwright starts the webServer before it runs globalSetup, so the dev
  // server is already up here.
  const api = await request.newContext({
    baseURL: config.projects[0].use.baseURL,
    // src/proxy.ts sends /create, /packs and /host to /sign-in before the page
    // is built when there is no session cookie. This one gets past the proxy,
    // and the page's own check refuses it once the page is built.
    extraHTTPHeaders: { cookie: "better-auth.session_token=warm-up" },
  });
  const started = Date.now();
  try {
    for (const route of WARM_UP) {
      // maxRetries resends on ECONNRESET only, waiting 250ms and doubling.
      const res = await api.get(route, { maxRetries: 5, maxRedirects: 0, failOnStatusCode: false, timeout: 120_000 });
      if (res.status() >= 500) {
        throw new Error(
          `Warm-up: GET ${route} answered ${res.status()} ${res.statusText()}, so the dev server could not build or run that route. Stopping before the first test.`
        );
      }
    }
  } finally {
    await api.dispose();
  }
  console.log(`Warm-up: ${WARM_UP.length} routes in ${Math.round((Date.now() - started) / 1000)}s`);
}
