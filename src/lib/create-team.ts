import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { generateTeamToken } from "@/lib/codes";
import { MAX_TEAMS_PER_SESSION } from "@/lib/team-name";

export type CreateTeamResult =
  | { ok: true; team: { id: string; name: string; token: string } }
  | { ok: false; reason: "full" | "name-taken" };

/**
 * Adds a team unless the game is full, for the phone join and the host's paper
 * team alike (M3).
 *
 * One statement: the row is inserted only if the count it reads is under the
 * cap. Writes land one at a time, so of several joins at once each sees the
 * ones before it, and none can take the game past the cap. Six joins at 58
 * teams used to leave 64, and when the cap was an insert followed by a delete,
 * a TV or host poll in between could show the extra team.
 *
 * Raw SQL, because Prisma has no conditional insert. The id is cuid-shaped and
 * the Date is stored by the adapter in the same form as a Prisma create
 * (checked 16 Nov 2026), so these rows read back like any other.
 *
 * An exact duplicate name is refused by the unique index; that answers
 * "name-taken" instead of escaping as a 500.
 */
export async function createTeamUnderCap(data: {
  sessionId: string;
  name: string;
  isPaper?: boolean;
}): Promise<CreateTeamResult> {
  const id = `c${generateTeamToken()}`;
  const token = generateTeamToken();
  try {
    const inserted = await db.$executeRaw`
      INSERT INTO "Team" ("id", "sessionId", "name", "token", "createdAt", "isPaper")
      SELECT ${id}, ${data.sessionId}, ${data.name}, ${token}, ${new Date()}, ${data.isPaper ?? false}
      WHERE (SELECT COUNT(*) FROM "Team" WHERE "sessionId" = ${data.sessionId}) < ${MAX_TEAMS_PER_SESSION}`;
    if (inserted === 0) return { ok: false, reason: "full" };
    return { ok: true, team: { id, name: data.name, token } };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
}

// A raw statement reports a unique violation as a failed raw query (P2010)
// carrying SQLite's message, not as P2002.
function isUniqueViolation(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === "P2002" || (error.code === "P2010" && /UNIQUE constraint failed/i.test(error.message));
}
