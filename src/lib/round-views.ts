import type { Answer, RoundScore, Session, Team } from "@prisma/client";
import type { PackWithRounds } from "@/lib/session-state";
import { SESSION_STATUS } from "@/lib/session-state";
import { parseOptions, type QuestionType } from "@/lib/question-types";
import { computeRoundScoreboard, countedRounds, roundTotals } from "@/lib/round-scoreboard";
import type {
  RoundDisplayState,
  RoundHostState,
  RoundQuestionView,
  RoundTeamState,
  ScoreboardRow,
} from "@/lib/api-types";

/**
 * What each screen of a round-mode game is sent (RM4). One rule runs through
 * all of it, and it is the whole point of the file: a screen cannot show what
 * it was never sent.
 *
 * - A question is sent only once it has been asked (index < askedCount), and
 *   nothing at all in the lobby (L2).
 * - A question's answer, and any team's mark for it, is sent to a team only
 *   once that question is revealed (index < revealedCount).
 * - The scoreboard goes to a team only while the host is showing it, or at the
 *   end, and even then counts only fully revealed rounds (round-scoreboard.ts).
 * - The host's desk is private in round mode — the room watches the TV — so
 *   from the close of the round it gets every answer, the key and the marks it
 *   needs to check. While the round is open it gets who has answered, not what,
 *   the same no-peek rule the one-question desk has always had.
 */

export type LoadedSession = Session & { teams: Team[]; answers: Answer[]; roundScores: RoundScore[] };

const { LOBBY, ROUND_MARKING, ROUND_REVEAL, ENDED } = SESSION_STATUS;

function questionView(
  question: PackWithRounds["rounds"][number]["questions"][number],
  index: number,
  showAnswer: boolean
): RoundQuestionView {
  return {
    index,
    id: question.id,
    text: question.text,
    points: question.points,
    type: question.type as QuestionType,
    options: parseOptions(question.options),
    hasMedia: question.media != null,
    answer: showAnswer ? question.answer : null,
  };
}

/** The questions asked so far in the current round; none in the lobby. */
export function askedQuestions(session: Session, pack: PackWithRounds, showAllAnswers: boolean) {
  if (session.status === LOBBY) return [];
  const round = pack.rounds[session.currentRoundIndex];
  if (!round) return [];
  return round.questions
    .slice(0, session.askedCount)
    .map((q, i) => questionView(q, i, showAllAnswers || i < session.revealedCount));
}

function roundLengths(pack: PackWithRounds) {
  return pack.rounds.map((r) => r.questions.length);
}

export function roundScoreboard(session: LoadedSession, pack: PackWithRounds): ScoreboardRow[] {
  return computeRoundScoreboard(
    session.teams,
    session.answers,
    session.roundScores,
    countedRounds(session, roundLengths(pack))
  );
}

/** Whether the room may see the scoreboard right now. */
export function scoreboardVisible(session: Session) {
  return session.scoreboardShown || session.status === ENDED;
}

function roundFullyRevealed(session: Session, pack: PackWithRounds) {
  return (
    (session.status === ROUND_REVEAL || session.status === ENDED) &&
    session.revealedCount >= (pack.rounds[session.currentRoundIndex]?.questions.length ?? 0)
  );
}

export function roundBase(session: Session, pack: PackWithRounds, now: Date) {
  const inPlay = session.status !== LOBBY;
  const round = pack.rounds[session.currentRoundIndex];
  return {
    mode: "ROUND" as const,
    code: session.code,
    status: session.status as RoundTeamState["status"],
    packTitle: pack.title,
    roundNumber: session.currentRoundIndex + 1,
    totalRounds: pack.rounds.length,
    totalQuestionsInRound: round?.questions.length ?? 0,
    askedCount: inPlay ? session.askedCount : 0,
    revealedCount: session.revealedCount,
    round: inPlay && round ? { title: round.title, category: round.category } : null,
    scoreboardShown: session.scoreboardShown,
    countedRounds: countedRounds(session, roundLengths(pack)),
    tvShowsAll: session.tvShowsAll,
    countdown:
      session.countdownStartedAt && session.countdownSeconds
        ? { startedAt: session.countdownStartedAt.toISOString(), durationSeconds: session.countdownSeconds }
        : null,
    serverNow: now.toISOString(),
  };
}

function roundClosed(session: Session) {
  return session.status === ROUND_MARKING || session.status === ROUND_REVEAL || session.status === ENDED;
}

/**
 * Whether a team took part in the current round: it answered something in it,
 * or the host typed a total for it. A phone team that did neither — most often
 * one that joined after the round closed — sits the closed round out: its phone
 * shows no "No answer" cards, and the host's marks grid leaves it out.
 */
function playedRound(session: LoadedSession, teamId: string) {
  const round = session.currentRoundIndex;
  return (
    session.answers.some((a) => a.teamId === teamId && a.roundIndex === round) ||
    session.roundScores.some((s) => s.teamId === teamId && s.roundIndex === round)
  );
}

export function roundTeamView(session: LoadedSession, pack: PackWithRounds, team: Team, now: Date): RoundTeamState {
  const inPlay = session.status !== LOBBY;
  const mine = inPlay
    ? session.answers
        .filter((a) => a.teamId === team.id && a.roundIndex === session.currentRoundIndex)
        .sort((a, b) => a.questionIndex - b.questionIndex)
    : [];
  const sitsOutRound = roundClosed(session) && !playedRound(session, team.id);
  const fullyRevealed = !sitsOutRound && roundFullyRevealed(session, pack);
  return {
    ...roundBase(session, pack, now),
    questions: sitsOutRound ? [] : askedQuestions(session, pack, false),
    sitsOutRound,
    scoreboard: scoreboardVisible(session) ? roundScoreboard(session, pack) : null,
    teamName: team.name,
    myAnswers: mine.map((a) => {
      const revealed = a.questionIndex < session.revealedCount;
      return {
        questionIndex: a.questionIndex,
        text: a.text,
        isCorrect: revealed ? a.isCorrect : null,
        pointsAwarded: revealed ? a.pointsAwarded : null,
      };
    }),
    myRoundTotal: fullyRevealed
      ? (roundTotals([team], session.answers, session.roundScores, session.currentRoundIndex)[0]?.total ?? 0)
      : null,
  };
}

/**
 * The TV (RM5). The room's view and nothing more: while the round is open, the
 * question being asked (or every asked question, if the host switches the TV
 * to that); nothing while the round is being marked; the revealed questions
 * with their answers during the reveal; team names; the scoreboard only while
 * the host shows it. Never a mark, a team's answer, a token or the host key.
 */
export function roundDisplayView(session: LoadedSession, pack: PackWithRounds, now: Date): RoundDisplayState {
  let questions: RoundQuestionView[] = [];
  if (session.status === SESSION_STATUS.ROUND_OPEN) {
    const asked = askedQuestions(session, pack, false);
    questions = session.tvShowsAll ? asked : asked.slice(-1);
  } else if (session.status === ROUND_REVEAL) {
    questions = askedQuestions(session, pack, false).slice(0, session.revealedCount);
  }
  return {
    ...roundBase(session, pack, now),
    questions,
    teams: session.teams.map((t) => ({ name: t.name })),
    scoreboard: scoreboardVisible(session) ? roundScoreboard(session, pack) : null,
  };
}

export function roundHostView(session: LoadedSession, pack: PackWithRounds, now: Date): RoundHostState {
  const closed = roundClosed(session);
  const inPlay = session.status !== LOBBY;
  const roundAnswers = session.answers.filter((a) => a.roundIndex === session.currentRoundIndex);

  return {
    ...roundBase(session, pack, now),
    questions: askedQuestions(session, pack, closed),
    // Counted rounds only, as the room would see it — so the host previews
    // exactly what "Show scoreboard" will put up.
    scoreboard: roundScoreboard(session, pack),
    teams: session.teams.map((t) => ({
      id: t.id,
      name: t.name,
      isPaper: t.isPaper,
      answered: inPlay
        ? roundAnswers
            .filter((a) => a.teamId === t.id)
            .map((a) => a.questionIndex)
            .sort((a, b) => a - b)
        : [],
    })),
    marks: closed
      ? roundTotals(session.teams, session.answers, session.roundScores, session.currentRoundIndex).map((row) => ({
          ...row,
          sitsOut: !row.isPaper && !playedRound(session, row.teamId),
          answers: roundAnswers
            .filter((a) => a.teamId === row.teamId)
            .sort((a, b) => a.questionIndex - b.questionIndex)
            .map((a) => ({
              questionIndex: a.questionIndex,
              id: a.id,
              text: a.text,
              isCorrect: a.isCorrect,
              pointsAwarded: a.pointsAwarded,
              hostOverride: a.hostOverride,
            })),
        }))
      : null,
  };
}
