import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SESSION_STATUS } from "@/lib/session-state";
import { packOwnership, type OwnerTarget } from "@/lib/pack-access";

/**
 * A pack being played cannot be restructured underneath the game.
 *
 * A live session addresses its position by *index* — currentRoundIndex and
 * currentQuestionIndex, walked by computeNextPosition in
 * src/lib/session-state.ts — and every answer already submitted is stored
 * against the (roundIndex, questionIndex) pair it was asked at. So adding,
 * deleting or moving a question or a round during a game does not edit the
 * quiz, it rewrites the meaning of every score in it: delete question 2 and
 * the shift that closes the index gap silently re-points every later answer at
 * the wrong question. Teams' points change after the fact, and nothing tells
 * anyone. Deleting the pack outright takes the session with it
 * (onDelete: Cascade), mid-game, along with the scores.
 *
 * Editing a question's *text* or its answer key is a different thing and stays
 * allowed: it changes no index, so no stored answer changes meaning. (Changing
 * the answer key mid-question does need the current question rescored at
 * reveal — that is M7, not this.)
 *
 * The guard is in code rather than in the schema. Making Session.pack
 * onDelete: Restrict would be the stronger statement, but SQLite has to
 * rebuild the table to alter a foreign key, so that migration is not purely
 * additive and previews share the production database.
 */

export const LIVE_GAME_MESSAGE = "This pack has a live game. End the game first.";

/**
 * A session with no activity for this long is treated as over, whatever its
 * status says.
 *
 * Without this the guard would be a trap rather than a safeguard: a host who
 * opens a lobby and never plays, or closes the tab mid-question, leaves a row
 * that is not ENDED for ever — and the pack could never be edited again. The
 * host's own "End game" button (L9) is the deliberate way out; this is the one
 * that does not need anybody to remember.
 *
 * Twelve hours is chosen to be longer than any real quiz night and shorter
 * than the gap to the next one.
 */
export const STALE_SESSION_HOURS = 12;

export function staleSessionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - STALE_SESSION_HOURS * 60 * 60 * 1000);
}

/**
 * Is any session on this pack still live?
 *
 * "Last activity" is `questionStartedAt` when the game has started and
 * `createdAt` while it is still in the lobby — questionStartedAt is stamped
 * fresh on every transition into QUESTION_ACTIVE, so on a game being played it
 * moves with each question. Team joins and answer submissions are deliberately
 * not consulted: they would need a join per check, and they cannot happen
 * without the host having advanced the session recently anyway.
 *
 * The bias is towards letting an edit through. A pack wrongly treated as busy
 * cannot be edited at all, which is the failure a host cannot work around; a
 * pack wrongly treated as free can only be edited during a game that has been
 * silent for half a day.
 */
export async function packHasLiveGame(packId: string, now: Date = new Date()): Promise<boolean> {
  const cutoff = staleSessionCutoff(now);
  const live = await db.session.findFirst({
    where: {
      packId,
      status: { not: SESSION_STATUS.ENDED },
      OR: [
        { questionStartedAt: { gte: cutoff } },
        { questionStartedAt: null, createdAt: { gte: cutoff } },
      ],
    },
    select: { id: true },
  });
  return live !== null;
}

/** 409, not 403: the request is allowed, the pack's state is what refuses it.
 * `liveGame` lets the editor tell this apart from any other conflict without
 * matching on the prose. */
export function liveGameConflict(): NextResponse {
  return NextResponse.json({ error: LIVE_GAME_MESSAGE, liveGame: true }, { status: 409 });
}

/** For a route that already has the pack id. */
export async function refuseIfLiveGame(packId: string, now?: Date): Promise<NextResponse | null> {
  return (await packHasLiveGame(packId, now)) ? liveGameConflict() : null;
}

/**
 * For a route holding a round or question id instead, so it reads the same way
 * as the `requirePackOwner` call it follows. Callers 404 on a missing row
 * before reaching this; a row that has gone in between cannot have a live game.
 */
export async function refuseIfLiveGameFor(target: OwnerTarget, now?: Date): Promise<NextResponse | null> {
  const ownership = await packOwnership(target);
  return ownership ? refuseIfLiveGame(ownership.packId, now) : null;
}
