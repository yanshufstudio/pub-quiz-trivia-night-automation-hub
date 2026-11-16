// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  HostSessionState,
  Pack,
  RoundDisplayState,
  RoundHostState,
  RoundQuestionView,
  TeamSessionState,
} from "@/lib/api-types";
import { fixtureTeam, roundTeamState } from "@/test/round-team-fixture";
import { memoryStorage, readable } from "@/test/readable";

/**
 * L1: every word a game screen shows, frozen as it was before the screens
 * moved to message files. English output must not change, so these snapshots
 * were written on master before the move and must still match after it.
 *
 * What is compared is what a person reads or hears: text, and the labels a
 * screen reader announces (aria-label, placeholder, title, alt). Class names
 * are left out on purpose, because RTL-readiness swaps left/right for
 * start/end without changing anything an English reader sees.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { TeamPortal } = await import("@/app/play/TeamPortal");
const { RoundTeamPlay } = await import("@/app/play/RoundTeamPlay");
const { TvDisplay } = await import("@/app/tv/[code]/TvDisplay");
const { RoundHostDesk } = await import("@/app/host/[code]/RoundHostDesk");
const { HostDashboard } = await import("@/app/host/[code]/HostDashboard");
const { PrintPreview } = await import("@/app/packs/[id]/print/PrintPreview");

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function q(index: number, extra: Partial<RoundQuestionView> = {}): RoundQuestionView {
  return {
    index,
    id: `q${index}`,
    text: `Question ${index + 1}?`,
    points: index === 2 ? 2 : 1,
    type: "TEXT",
    options: [],
    hasMedia: false,
    answer: null,
    ...extra,
  };
}

const board = [
  { teamId: "team-1", name: "Quizzly Bears", score: 7 },
  { teamId: "team-2", name: "The Underdogs", score: 7 },
  { teamId: "team-3", name: "Paper Tigers", score: 1 },
];

// --- Team phone ------------------------------------------------------------

async function phone(body: unknown) {
  window.localStorage.setItem("quiz-hub:team", JSON.stringify(fixtureTeam));
  vi.stubGlobal("fetch", vi.fn(async () => ok(body)));
  const { container } = render(<TeamPortal />);
  await act(async () => {});
  await act(async () => {});
  return readable(container);
}

function teamQuestionState(status: TeamSessionState["status"], extra: Partial<TeamSessionState> = {}): TeamSessionState {
  return {
    mode: "QUESTION",
    code: fixtureTeam.code,
    language: "en",
    status,
    packTitle: "Pack",
    roundNumber: 1,
    totalRounds: 2,
    questionNumber: 2,
    totalQuestionsInRound: 5,
    round: { title: "General", category: "General" },
    question:
      status === "LOBBY"
        ? null
        : {
            id: "q1",
            text: "Capital of Australia?",
            points: 2,
            answer: status === "REVEAL" ? "Canberra" : null,
            type: "TEXT",
            options: [],
            hasMedia: false,
          },
    scoreboard: board,
    timer: null,
    teamName: fixtureTeam.teamName,
    myAnswer: null,
    ...extra,
  };
}

describe("team phone", () => {
  it("join form", async () => {
    const { container } = render(<TeamPortal />);
    await act(async () => {});
    expect(readable(container)).toMatchSnapshot();
  });

  it("round mode: lobby", async () => {
    expect(await phone(roundTeamState(0))).toMatchSnapshot();
  });

  it("round mode: open round, saved and unanswered questions, multiple choice", async () => {
    const state = roundTeamState(3, [{ questionIndex: 0, text: "Canberra", isCorrect: null, pointsAwarded: null }]);
    state.questions[1] = q(1, { type: "MULTIPLE_CHOICE", options: ["Five", "Seven"] });
    expect(await phone(state)).toMatchSnapshot();
  });

  it("round mode: answers in", async () => {
    expect(await phone(roundTeamState(3, [], "ROUND_MARKING"))).toMatchSnapshot();
  });

  it("round mode: reveal with a total and the scoreboard", async () => {
    const state = roundTeamState(
      3,
      [
        { questionIndex: 0, text: "Canberra", isCorrect: true, pointsAwarded: 1 },
        { questionIndex: 1, text: "Six", isCorrect: false, pointsAwarded: 0 },
      ],
      "ROUND_REVEAL"
    );
    state.questions = [q(0, { answer: "Canberra" }), q(1, { answer: "Seven" }), q(2, { answer: "Mars" })];
    state.revealedCount = 3;
    state.myRoundTotal = 1;
    state.scoreboard = board;
    state.scoreboardShown = true;
    state.countedRounds = 1;
    expect(await phone(state)).toMatchSnapshot();
  });

  it("round mode: scoreboard before any round counts", async () => {
    const state = roundTeamState(1);
    state.scoreboard = board;
    state.scoreboardShown = true;
    expect(await phone(state)).toMatchSnapshot();
  });

  it("round mode: sits out a closed round, and the last round", async () => {
    const state = roundTeamState(3, [], "ROUND_MARKING");
    state.sitsOutRound = true;
    const first = await phone(state);
    cleanup();
    state.roundNumber = 2;
    expect(`${first}\n---\n${await phone(state)}`).toMatchSnapshot();
  });

  it("round mode: ended, winner tied", async () => {
    const state = roundTeamState(3, [], "ENDED");
    state.scoreboard = board;
    expect(await phone(state)).toMatchSnapshot();
  });

  it("round mode: ended, not the winner", async () => {
    const state = roundTeamState(3, [], "ENDED");
    state.scoreboard = [board[1], { ...board[0], score: 1 }];
    expect(await phone(state)).toMatchSnapshot();
  });

  it("question mode: lobby, live question, answered, reveal", async () => {
    const parts = [
      await phone(teamQuestionState("LOBBY")),
      await phone(teamQuestionState("QUESTION_ACTIVE")),
      await phone(
        teamQuestionState("QUESTION_ACTIVE", { myAnswer: { text: "Sydney", isCorrect: null, pointsAwarded: null } })
      ),
      await phone(
        teamQuestionState("QUESTION_ACTIVE", {
          question: {
            id: "q1",
            text: "Pick one",
            points: 1,
            answer: null,
            type: "MULTIPLE_CHOICE",
            options: ["Red", "Blue"],
            hasMedia: false,
          },
        })
      ),
      await phone(teamQuestionState("REVEAL", { myAnswer: { text: "Canberra", isCorrect: true, pointsAwarded: 2 } })),
      await phone(teamQuestionState("REVEAL", { myAnswer: { text: "Sydney", isCorrect: false, pointsAwarded: 0 } })),
      await phone(teamQuestionState("REVEAL")),
    ];
    expect(parts.join("\n---\n")).toMatchSnapshot();
  });

  it("errors: a join that fails, a save that cannot reach the server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ error: "That team name is already taken in this session" }, 409)));
    const { container } = render(<TeamPortal />);
    await act(async () => {});
    fireEvent.change(screen.getByPlaceholderText("AB3K7"), { target: { value: "ABCDE" } });
    fireEvent.change(screen.getByPlaceholderText("Quizards of Oz"), { target: { value: "Bears" } });
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });
    const join = readable(container);
    cleanup();

    const state = roundTeamState(1);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const played = render(<RoundTeamPlay state={state} team={fixtureTeam} onChanged={async () => {}} />);
    fireEvent.change(screen.getByLabelText("Answer to Round 1 · Q1"), { target: { value: "x" } });
    await act(async () => {
      fireEvent.submit(played.container.querySelector("form")!);
    });
    expect(`${join}\n---\n${readable(played.container)}`).toMatchSnapshot();
  });
});

// --- TV --------------------------------------------------------------------

function displayState(extra: Partial<RoundDisplayState> = {}): RoundDisplayState {
  return {
    mode: "ROUND",
    code: "ABCDE",
    language: "en",
    status: "LOBBY",
    packTitle: "Pack",
    roundNumber: 1,
    totalRounds: 2,
    totalQuestionsInRound: 3,
    askedCount: 0,
    revealedCount: 0,
    round: null,
    scoreboardShown: false,
    countedRounds: 0,
    tvShowsAll: false,
    countdown: null,
    serverNow: new Date().toISOString(),
    questions: [],
    teams: [{ name: "Quizzly Bears" }, { name: "The Underdogs" }],
    paperOnly: false,
    scoreboard: null,
    ...extra,
  };
}

async function tv(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => ok(body, status)));
  const { container } = render(<TvDisplay code="ABCDE" />);
  await act(async () => {});
  await act(async () => {});
  return readable(container);
}

describe("TV", () => {
  it("every screen", async () => {
    const open = { status: "ROUND_OPEN" as const, askedCount: 2, round: { title: "General", category: "General" } };
    const mc = q(1, { type: "MULTIPLE_CHOICE", options: ["Five", "Seven"] });
    const parts = [
      await tv({}, 404),
      await tv(displayState()),
      await tv(displayState({ paperOnly: true })),
      await tv(displayState({ ...open, questions: [q(0), mc] })),
      await tv(displayState({ ...open, tvShowsAll: true, questions: [q(0), q(1)] })),
      await tv(displayState({ ...open, status: "ROUND_MARKING", askedCount: 3, questions: [q(0), q(1), q(2)] })),
      await tv(
        displayState({
          ...open,
          status: "ROUND_REVEAL",
          askedCount: 3,
          revealedCount: 1,
          questions: [q(0, { answer: "Canberra" })],
        })
      ),
      await tv(
        displayState({
          ...open,
          status: "ROUND_REVEAL",
          askedCount: 3,
          revealedCount: 3,
          questions: [q(0, { answer: "Canberra" }), q(1, { answer: "Seven" }), q(2, { answer: "Mars" })],
        })
      ),
      await tv(displayState({ ...open, scoreboardShown: true, scoreboard: board })),
      await tv(displayState({ ...open, scoreboardShown: true, countedRounds: 1, scoreboard: board })),
      await tv(displayState({ status: "ENDED", countedRounds: 2, scoreboard: board })),
    ];
    expect(parts.join("\n---\n")).toMatchSnapshot();
  });

  it("reconnecting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({}, 500)));
    const { container } = render(<TvDisplay code="ABCDE" />);
    await act(async () => {});
    await act(async () => {});
    expect(readable(container)).toMatchSnapshot();
  });
});

// --- Round host desk ------------------------------------------------------

function hostState(extra: Partial<RoundHostState> = {}): RoundHostState {
  return {
    mode: "ROUND",
    code: "ABCDE",
    language: "en",
    status: "LOBBY",
    packTitle: "Friday Quiz",
    roundNumber: 1,
    totalRounds: 2,
    totalQuestionsInRound: 3,
    askedCount: 0,
    revealedCount: 0,
    round: null,
    scoreboardShown: false,
    countedRounds: 0,
    tvShowsAll: false,
    countdown: null,
    serverNow: new Date().toISOString(),
    questions: [],
    scoreboard: board,
    teams: [
      { id: "team-1", name: "Quizzly Bears", isPaper: false, answered: [0] },
      { id: "team-3", name: "Paper Tigers", isPaper: true, answered: [] },
    ],
    marks: null,
    ...extra,
  };
}

const marks: NonNullable<RoundHostState["marks"]> = [
  {
    teamId: "team-1",
    name: "Quizzly Bears",
    isPaper: false,
    auto: 1,
    typed: null,
    total: 1,
    sitsOut: false,
    answers: [
      { questionIndex: 0, id: "a1", text: "Canberra", isCorrect: true, pointsAwarded: 1, hostOverride: false },
      { questionIndex: 1, id: "a2", text: "Six", isCorrect: false, pointsAwarded: 0, hostOverride: false },
    ],
  },
  { teamId: "team-4", name: "Latecomers", isPaper: false, auto: 0, typed: null, total: 0, sitsOut: true, answers: [] },
  { teamId: "team-5", name: "Typed Team", isPaper: false, auto: 1, typed: 4, total: 4, sitsOut: false, answers: [] },
  { teamId: "team-3", name: "Paper Tigers", isPaper: true, auto: 0, typed: null, total: 0, sitsOut: false, answers: [] },
];

function desk(state: RoundHostState, error: string | null = null) {
  vi.stubGlobal("fetch", vi.fn(async () => ok({})));
  return render(
    <RoundHostDesk
      code="ABCDE"
      hostToken="host"
      state={state}
      error={error}
      onError={() => {}}
      refresh={async () => {}}
      languages={["en"]}
      onLanguage={() => {}}
    />
  );
}

/** Press a button by its exact words. */
const press = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

describe("round host desk", () => {
  it("lobby, with no teams and with teams, the paper-team form and the menu", () => {
    const empty = readable(desk(hostState({ teams: [] })).container);
    cleanup();
    const { container } = desk(hostState(), "The game moved on. Refresh and try again.");
    const lobby = readable(container);
    press("Add paper team");
    const adding = readable(container);
    press("Menu");
    expect([empty, lobby, adding, readable(container)].join("\n---\n")).toMatchSnapshot();
  });

  it("open round: question, countdown choices, asked so far, close confirmation", async () => {
    const state = hostState({
      status: "ROUND_OPEN",
      askedCount: 2,
      round: { title: "General", category: "General" },
      questions: [q(0), q(1, { type: "MULTIPLE_CHOICE", options: ["Five", "Seven"] })],
    });
    const { container } = desk(state);
    const open = readable(container);
    press("Start countdown");
    const choosing = readable(container);
    cleanup();

    const last = desk({ ...state, askedCount: 3, questions: [q(0), q(1), q(2)] });
    press("Close round…");
    const closing = readable(last.container);
    cleanup();

    const counting = desk({
      ...state,
      countdown: { startedAt: new Date(Date.now() - 120_000).toISOString(), durationSeconds: 60 },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect([open, choosing, closing, readable(counting.container)].join("\n---\n")).toMatchSnapshot();
  });

  it("marking, the menu mid-game, and every confirmation", () => {
    const state = hostState({
      status: "ROUND_MARKING",
      askedCount: 3,
      questions: [q(0, { answer: "Canberra" }), q(1, { answer: "Seven" }), q(2, { answer: "Mars" })],
      marks,
    });
    const { container } = desk(state);
    const marking = readable(container);
    press("Menu");
    const menu = readable(container);
    press("End game");
    const ending = readable(container);
    cleanup();

    const all = desk(state);
    press("Reveal all");
    const revealAll = readable(all.container);
    cleanup();

    const lastOne = desk({ ...state, status: "ROUND_REVEAL", revealedCount: 2, scoreboardShown: true });
    press("Reveal next answer");
    const revealLast = readable(lastOne.container);
    cleanup();

    const next = desk({ ...state, status: "ROUND_REVEAL", revealedCount: 3, countedRounds: 1 });
    const nextRound = readable(next.container);
    press("Next round");
    const confirmingNext = readable(next.container);
    cleanup();

    const finish = desk({ ...state, status: "ROUND_REVEAL", revealedCount: 3, roundNumber: 2, countedRounds: 2 });
    press("Finish quiz…");
    expect(
      [marking, menu, ending, revealAll, revealLast, nextRound, confirmingNext, readable(finish.container)].join("\n---\n")
    ).toMatchSnapshot();
  });

  it("ended, one champion and tied champions", () => {
    const one = readable(desk(hostState({ status: "ENDED", scoreboard: [board[0], board[2]] })).container);
    cleanup();
    expect(`${one}\n---\n${readable(desk(hostState({ status: "ENDED" })).container)}`).toMatchSnapshot();
  });
});

// --- Question-mode host desk ------------------------------------------------

function hostQuestionState(status: HostSessionState["status"], extra: Partial<HostSessionState> = {}): HostSessionState {
  return {
    mode: "QUESTION",
    code: "ABCDE",
    language: "en",
    status,
    packTitle: "Friday Quiz",
    roundNumber: 2,
    totalRounds: 2,
    questionNumber: 5,
    totalQuestionsInRound: 5,
    round: { title: "Music", category: "Music" },
    question:
      status === "LOBBY"
        ? null
        : {
            id: "q1",
            text: "Pick one",
            points: 2,
            answer: status === "QUESTION_ACTIVE" ? null : "Blue",
            type: "MULTIPLE_CHOICE",
            options: ["Red", "Blue"],
            hasMedia: false,
          },
    scoreboard: board,
    timer: null,
    teams: [
      {
        id: "team-1",
        name: "Quizzly Bears",
        currentAnswer:
          status === "QUESTION_ACTIVE"
            ? { id: null, text: null, isCorrect: null, pointsAwarded: null }
            : { id: "a1", text: "Blue", isCorrect: true, pointsAwarded: 2 },
      },
      { id: "team-2", name: "The Underdogs", currentAnswer: null },
    ],
    ...extra,
  };
}

async function oldDesk(body: unknown) {
  window.localStorage.setItem("quiz-hub:host-tokens", JSON.stringify({ ABCDE: "host" }));
  vi.stubGlobal("fetch", vi.fn(async () => ok(body)));
  const view = render(<HostDashboard code="ABCDE" />);
  await act(async () => {});
  await act(async () => {});
  return view;
}

describe("question-mode host desk", () => {
  it("host key needed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({}, 404)));
    const { container } = render(<HostDashboard code="ABCDE" />);
    await act(async () => {});
    await act(async () => {});
    expect(readable(container)).toMatchSnapshot();
  });

  it("lobby, live, reveal, last question, end confirmation, ended", async () => {
    const parts: string[] = [];
    for (const state of [
      hostQuestionState("LOBBY", { teams: [] }),
      hostQuestionState("LOBBY"),
      hostQuestionState("QUESTION_ACTIVE"),
      hostQuestionState("REVEAL", { questionNumber: 2 }),
      hostQuestionState("REVEAL"),
    ]) {
      parts.push(readable((await oldDesk(state)).container));
      cleanup();
    }
    const live = await oldDesk(hostQuestionState("QUESTION_ACTIVE"));
    press("End game");
    parts.push(readable(live.container));
    cleanup();
    parts.push(readable((await oldDesk(hostQuestionState("ENDED"))).container));
    expect(parts.join("\n---\n")).toMatchSnapshot();
  });
});

// --- Print -----------------------------------------------------------------

const pack: Pack = {
  id: "pack-1",
  title: "Friday Quiz",
  prompt: "general knowledge",
  createdAt: "2026-11-01T00:00:00.000Z",
  language: "en",
  rounds: [
    {
      id: "r1",
      index: 0,
      title: "General",
      category: "General knowledge",
      questions: [
        { id: "p1", index: 0, text: "Capital of Australia?", answer: "Canberra", points: 1, type: "TEXT", options: [], acceptableAnswers: [], hasMedia: false },
        {
          id: "p2",
          index: 1,
          text: "Pick one",
          answer: "Blue",
          points: 2,
          type: "MULTIPLE_CHOICE",
          options: ["Red", "Blue"],
          acceptableAnswers: [],
          hasMedia: true,
        },
      ],
    },
  ],
};

describe("print preview", () => {
  it("every sheet, with its page title", () => {
    const { container } = render(<PrintPreview pack={pack} />);
    const parts = [`title: ${document.title}`, readable(container)];
    for (const tab of ["Host answer key", "Team answer sheet"]) {
      press(tab);
      parts.push(`title: ${document.title}`, readable(container));
    }
    expect(parts.join("\n---\n")).toMatchSnapshot();
  });

  it("a pack with one round", () => {
    const { container } = render(<PrintPreview pack={pack} />);
    expect(readable(container.querySelector("header")!)).toMatchSnapshot();
  });
});
