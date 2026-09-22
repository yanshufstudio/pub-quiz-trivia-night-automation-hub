import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hostSessionForRequest } from "@/lib/auth-guard";
import { tokensMatch } from "@/lib/host-auth";
import { canReadPack } from "@/lib/pack-access";
import {
  MEDIA_HOST_TOKEN_PARAM,
  MEDIA_SESSION_CODE_PARAM,
  MEDIA_TEAM_TOKEN_PARAM,
} from "@/lib/question-media-url";
import { getCurrentQuestion, packWithRoundsArgs, type PackWithRounds } from "@/lib/session-state";

/**
 * Who may fetch a question's image.
 *
 * `GET /api/questions/[id]/media` was the last read in this app that took no
 * credential at all: anyone holding a question id got the bytes. That was
 * defensible while every pack read was open, and stopped being defensible
 * when they stopped being (see `src/lib/pack-access.ts`) — a picture round is
 * exactly the kind of thing a rival quizmaster would take, and "you need the
 * id" is not a lock.
 *
 * The rule is stated so that it cannot disagree with what the app already
 * shows: **the image is served to whoever the session state would serve the
 * question to.** Two ways to qualify, and no third.
 *
 * 1. **A live session's current question.** Present a valid team token — or
 *    the session's host key — for a session whose current question is this
 *    one. That is the same credential, for the same question, that
 *    `GET /api/sessions/[code]` already answers with `hasMedia: true`; this
 *    route just hands over the bytes that flag promised.
 * 2. **A host who may read the pack.** A signed-in account whose Creator owns
 *    the pack, or any signed-in host when the pack is the ownerless demo —
 *    `canReadPack`, the same predicate the editor, the print sheet, the PDFs
 *    and the export now use.
 *
 * Deliberately the *current* question and not "any question in the session's
 * pack": a team that could walk the whole pack could read round four's
 * picture round during round one, which is the leak this is here to close.
 * The cost is a narrow race — the host advances while a phone is mid-fetch,
 * and that fetch 404s — which resolves itself on the next three-second poll,
 * when the phone asks for the new question's image instead.
 *
 * "Current question" is resolved with `getCurrentQuestion`, the same function
 * the session payload uses, against the same query shape. That is on purpose
 * rather than a cheaper index comparison: if this gate and that payload ever
 * disagreed, the symptom would be images silently missing from a quiz in
 * progress, and the two now cannot disagree because they are one function.
 */
export async function mayReadQuestionMedia(req: NextRequest, questionId: string): Promise<boolean> {
  const params = new URL(req.url).searchParams;

  const code = params.get(MEDIA_SESSION_CODE_PARAM);
  if (code && (await isCurrentQuestionOfSession(code, params, questionId))) return true;

  return hostMayReadQuestion(req, questionId);
}

async function isCurrentQuestionOfSession(
  code: string,
  params: URLSearchParams,
  questionId: string
): Promise<boolean> {
  const session = await db.session.findUnique({
    where: { code: code.toUpperCase() },
    select: {
      packId: true,
      hostToken: true,
      currentRoundIndex: true,
      currentQuestionIndex: true,
      teams: { select: { token: true } },
    },
  });
  if (!session) return false;

  // A team's own token, or the key that drives the desk. Both are compared in
  // constant time, for the same reason src/lib/host-auth.ts does: these are
  // bearer secrets and a length-or-prefix oracle is free to whoever asks.
  const teamToken = params.get(MEDIA_TEAM_TOKEN_PARAM);
  const admitted =
    session.teams.some((team) => tokensMatch(team.token, teamToken)) ||
    tokensMatch(session.hostToken, params.get(MEDIA_HOST_TOKEN_PARAM));
  if (!admitted) return false;

  const pack = (await db.quizPack.findUnique({
    where: { id: session.packId },
    ...packWithRoundsArgs,
  })) as PackWithRounds | null;
  if (!pack) return false;

  const current = getCurrentQuestion(pack, session.currentRoundIndex, session.currentQuestionIndex);
  return current?.id === questionId;
}

async function hostMayReadQuestion(req: NextRequest, questionId: string): Promise<boolean> {
  const question = await db.question.findUnique({
    where: { id: questionId },
    select: { round: { select: { pack: { select: { creatorId: true } } } } },
  });
  if (!question) return false;

  const host = await hostSessionForRequest(req);
  if (!host) return false;
  return canReadPack(question.round.pack, host.creator.id);
}
