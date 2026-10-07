import type { RoundQuestionView, RoundStatus, RoundTeamState } from "@/lib/api-types";

/** A team as the phone remembers it, for the phone's component tests. */
export const fixtureTeam = { code: "ABCDE", token: "t0ken", teamId: "team-1", teamName: "Quizzly Bears" };

function question(index: number): RoundQuestionView {
  return { index, id: `q${index}`, text: `Question ${index + 1}?`, points: 1, type: "TEXT", options: [], hasMedia: false, answer: null };
}

/** What GET /api/sessions/[code]?token= sends a phone: round 1 with `asked` questions asked. */
export function roundTeamState(
  asked: number,
  myAnswers: RoundTeamState["myAnswers"] = [],
  status: RoundStatus = asked > 0 ? "ROUND_OPEN" : "LOBBY"
): RoundTeamState {
  return {
    mode: "ROUND",
    code: fixtureTeam.code,
    status,
    packTitle: "Pack",
    roundNumber: 1,
    totalRounds: 2,
    totalQuestionsInRound: 3,
    askedCount: asked,
    revealedCount: 0,
    round: { title: "General", category: "General" },
    scoreboardShown: false,
    countedRounds: 0,
    tvShowsAll: false,
    countdown: null,
    serverNow: new Date().toISOString(),
    questions: Array.from({ length: asked }, (_, i) => question(i)),
    scoreboard: null,
    teamName: fixtureTeam.teamName,
    sitsOutRound: false,
    myAnswers,
    myRoundTotal: null,
  };
}
