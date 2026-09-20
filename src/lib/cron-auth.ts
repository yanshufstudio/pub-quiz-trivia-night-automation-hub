import { timingSafeEqual } from "node:crypto";

/**
 * The secret Vercel sends with every cron invocation.
 *
 * When a project has CRON_SECRET set, Vercel's scheduler calls each path in
 * vercel.json's `crons` with `Authorization: Bearer <CRON_SECRET>`. Nothing
 * else knows the value, so a matching header is the scheduler and anything
 * else is somebody who found the path — which is public, because vercel.json
 * is in the repo.
 */
export const CRON_SECRET_ENV = "CRON_SECRET";

/**
 * Fails closed, the same way src/lib/admin-auth.ts does: with no secret
 * configured nobody is the scheduler, so the route refuses everyone rather
 * than running for everyone. A deploy that forgot the variable gets a cron
 * that does nothing — Vercel shows the 401 in the cron's log — never a
 * deletion endpoint open to the internet.
 */
export function isAuthorizedCron(req: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = env[CRON_SECRET_ENV];
  if (!secret) return false;

  const provided = req.headers.get("authorization");
  if (!provided) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
