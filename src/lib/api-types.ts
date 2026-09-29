export type PackSummary = {
  id: string;
  title: string;
  createdAt: string;
  roundCount: number;
  questionCount: number;
};

export type QuestionType = "TEXT" | "MULTIPLE_CHOICE";

export type Question = {
  id: string;
  index: number;
  text: string;
  answer: string;
  points: number;
  type: QuestionType;
  /** Only meaningful when type is "MULTIPLE_CHOICE"; empty otherwise. */
  options: string[];
  /** Alternate spellings/nicknames the host has approved as also-correct,
   * checked alongside `answer` when scoring a submission. */
  acceptableAnswers: string[];
  /** Whether an image is attached, to be fetched separately from
   * `/api/questions/[id]/media`. The bytes are deliberately not inlined
   * here — a pack payload carries the flag and nothing more. */
  hasMedia: boolean;
};

export type Round = {
  id: string;
  index: number;
  title: string;
  category: string;
  questions: Question[];
};

export type Pack = {
  id: string;
  title: string;
  prompt: string;
  createdAt: string;
  rounds: Round[];
  /** ACC2: "not_checked" is the only value the editor acts on. */
  reviewStatus?: string | null;
};

export type ScoreboardRow = {
  teamId: string;
  name: string;
  score: number;
};

export type SessionStatus = "LOBBY" | "QUESTION_ACTIVE" | "REVEAL" | "ENDED";

/** A round-mode game's statuses (src/lib/round-state.ts). */
export type RoundStatus = "LOBBY" | "ROUND_OPEN" | "ROUND_MARKING" | "ROUND_REVEAL" | "ENDED";

/** One asked question of the current round. `answer` is null until revealed. */
export type RoundQuestionView = {
  index: number;
  id: string;
  text: string;
  points: number;
  type: QuestionType;
  options: string[];
  hasMedia: boolean;
  answer: string | null;
};

/** The host's optional countdown, stamped by the server. */
export type CountdownInfo = { startedAt: string; durationSeconds: number } | null;

type RoundBase = {
  mode: "ROUND";
  code: string;
  status: RoundStatus;
  packTitle: string;
  roundNumber: number;
  totalRounds: number;
  totalQuestionsInRound: number;
  askedCount: number;
  revealedCount: number;
  round: SessionRound | null;
  scoreboardShown: boolean;
  tvShowsAll: boolean;
  countdown: CountdownInfo;
  /** The server's clock when this was sent, so a countdown agrees on every screen. */
  serverNow: string;
  questions: RoundQuestionView[];
};

export type RoundTeamState = RoundBase & {
  /** Null unless the host is showing it (or the quiz has ended). */
  scoreboard: ScoreboardRow[] | null;
  teamName: string;
  /**
   * The round is closed and this team took no part in it (it joined late):
   * no questions are sent, and the phone waits for the next round.
   */
  sitsOutRound: boolean;
  myAnswers: {
    questionIndex: number;
    text: string;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
  }[];
  /** The team's total for the round, once every answer in it is revealed. */
  myRoundTotal: number | null;
};

/** GET /api/sessions/[code]/display — the TV. */
export type RoundDisplayState = RoundBase & {
  teams: { name: string }[];
  /** Null unless the host is showing it (or the quiz has ended). */
  scoreboard: ScoreboardRow[] | null;
};

export type RoundHostState = RoundBase & {
  scoreboard: ScoreboardRow[];
  teams: { id: string; name: string; isPaper: boolean; answered: number[] }[];
  /** Null while the round is open. */
  marks:
    | {
        teamId: string;
        name: string;
        isPaper: boolean;
        auto: number;
        typed: number | null;
        total: number;
        /**
         * A phone team with no answer and no typed total in this round (most
         * often it joined late). Left out of the marks grid; still offered a
         * typed total, for a team that played the round on a sheet.
         */
        sitsOut: boolean;
        answers: {
          questionIndex: number;
          id: string;
          text: string;
          isCorrect: boolean | null;
          pointsAwarded: number;
          hostOverride: boolean;
        }[];
      }[]
    | null;
};

export type SessionQuestion = {
  id: string;
  text: string;
  points: number;
  answer: string | null;
  type: QuestionType;
  /** The choices to render for a MULTIPLE_CHOICE question; empty for TEXT. */
  options: string[];
  /** Whether an image is attached, fetched separately from
   * `/api/questions/[id]/media` — same contract as `Question.hasMedia`. */
  hasMedia: boolean;
};

export type SessionRound = {
  title: string;
  category: string;
};

/** Null means no timer for this session — manual reveal only. */
export type TimerInfo = {
  startedAt: string;
  durationSeconds: number;
} | null;

export type HostTeam = {
  id: string;
  name: string;
  /** Non-null once the team has answered the current question. Every field
   * inside it is null until the host reveals — see the host branch of
   * GET /api/sessions/[code]. */
  currentAnswer: {
    id: string | null;
    text: string | null;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
  } | null;
};

export type HostSessionState = {
  mode: "QUESTION";
  code: string;
  status: SessionStatus;
  packTitle: string;
  roundNumber: number;
  totalRounds: number;
  questionNumber: number;
  totalQuestionsInRound: number;
  round: SessionRound | null;
  question: SessionQuestion | null;
  scoreboard: ScoreboardRow[];
  timer: TimerInfo;
  teams: HostTeam[];
};

export type TeamSessionState = {
  mode: "QUESTION";
  code: string;
  status: SessionStatus;
  packTitle: string;
  roundNumber: number;
  totalRounds: number;
  questionNumber: number;
  totalQuestionsInRound: number;
  round: SessionRound | null;
  question: SessionQuestion | null;
  scoreboard: ScoreboardRow[];
  timer: TimerInfo;
  teamName: string;
  myAnswer: {
    text: string;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
  } | null;
};
