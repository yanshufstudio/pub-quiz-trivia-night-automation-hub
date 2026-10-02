import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

import { POST as createPack } from "@/app/api/packs/seed/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { db } from "@/lib/db";
import { signInTestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";
const host = await signInTestHost();

function jsonRequest(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...host.cookieHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

afterAll(async () => {
  await db.$disconnect();
});

describe("round mode is the only mode for new sessions (RM0)", () => {
  it("a new session runs round by round, with no per-question timer even if one is asked for", async () => {
    const { pack } = await (await createPack(jsonRequest(`${BASE}/api/packs/seed`))).json();
    const res = await createSession(
      jsonRequest(`${BASE}/api/sessions`, { packId: pack.id, questionDurationSeconds: 30 })
    );
    expect(res.status).toBe(201);
    const { session } = await res.json();

    const row = await db.session.findUniqueOrThrow({ where: { code: session.code } });
    expect(row.mode).toBe("ROUND");
    expect(row.questionDurationSeconds).toBeNull();
    expect(row.askedCount).toBe(0);
    expect(row.revealedCount).toBe(0);
    expect(row.scoreboardShown).toBe(false);
    expect(row.tvShowsAll).toBe(false);
    expect(row.countdownStartedAt).toBeNull();
    expect(row.countdownSeconds).toBeNull();
  });

  it("a session row written without a mode — every session that existed before — reads as QUESTION", async () => {
    const { pack } = await (await createPack(jsonRequest(`${BASE}/api/packs/seed`))).json();
    const row = await db.session.create({
      data: { packId: pack.id, code: "OLD01", hostToken: `old-${Math.random()}` },
    });
    expect(row.mode).toBe("QUESTION");
  });

  it("a team is a phone team unless marked as paper", async () => {
    const session = await db.session.findUniqueOrThrow({ where: { code: "OLD01" } });
    const team = await db.team.create({ data: { sessionId: session.id, name: "Phones", token: `t-${Math.random()}` } });
    expect(team.isPaper).toBe(false);
  });

  it("stores one typed round total per team and round", async () => {
    const session = await db.session.findUniqueOrThrow({ where: { code: "OLD01" }, include: { teams: true } });
    const teamId = session.teams[0].id;
    await db.roundScore.create({ data: { sessionId: session.id, teamId, roundIndex: 0, points: 7 } });
    await expect(
      db.roundScore.create({ data: { sessionId: session.id, teamId, roundIndex: 0, points: 8 } })
    ).rejects.toThrow();
  });
});

describe("the round-mode migration is purely additive", () => {
  // Previews run `prisma migrate deploy` against the production database, so a
  // migration that dropped, renamed or rewrote anything would do it to live data
  // the moment the branch was pushed.
  it("only adds columns, tables and indexes", () => {
    const dir = path.resolve(__dirname, "../../prisma/migrations");
    const name = readdirSync(dir).find((d) => d.endsWith("_round_mode"));
    expect(name).toBeDefined();
    const sql = readFileSync(path.join(dir, name!, "migration.sql"), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    // Foreign-key actions are part of a CREATE TABLE, not statements of their own.
    expect(sql.replace(/ON (DELETE|UPDATE) CASCADE/g, "")).not.toMatch(/\b(DROP|RENAME|DELETE|UPDATE|INSERT)\b/i);
    for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      expect(statement).toMatch(/^(ALTER TABLE "\w+" ADD COLUMN|CREATE TABLE|CREATE (UNIQUE )?INDEX)/);
    }
  });
});
