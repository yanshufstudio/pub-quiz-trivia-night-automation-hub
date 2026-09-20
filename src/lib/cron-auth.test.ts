import { describe, expect, it } from "vitest";
import { CRON_SECRET_ENV, isAuthorizedCron } from "@/lib/cron-auth";

function call(authorization?: string) {
  return new Request("http://localhost/api/cron/retention", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

const SECRET = "a-long-random-cron-secret";
const env = (value?: string) => ({ NODE_ENV: "production", [CRON_SECRET_ENV]: value }) as NodeJS.ProcessEnv;

describe("isAuthorizedCron", () => {
  it("lets the scheduler's exact header through", () => {
    expect(isAuthorizedCron(call(`Bearer ${SECRET}`), env(SECRET))).toBe(true);
  });

  it("refuses everyone when no secret is configured — including an empty bearer", () => {
    // Fail closed: a deploy that forgot CRON_SECRET must not be a deletion
    // endpoint anyone can call. "Bearer " would match an empty secret if
    // the unset case were not refused first.
    for (const header of [undefined, "", "Bearer ", "Bearer undefined", `Bearer ${SECRET}`]) {
      expect(isAuthorizedCron(call(header), env(undefined)), String(header)).toBe(false);
      expect(isAuthorizedCron(call(header), env("")), String(header)).toBe(false);
    }
  });

  it("refuses a missing, wrong, bare or differently-shaped header", () => {
    for (const header of [
      undefined,
      "",
      SECRET, // no scheme
      `bearer ${SECRET}`, // Vercel sends "Bearer"; nothing else does
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.slice(0, -1)}`,
      `Basic ${SECRET}`,
    ]) {
      expect(isAuthorizedCron(call(header), env(SECRET)), String(header)).toBe(false);
    }
  });
});
