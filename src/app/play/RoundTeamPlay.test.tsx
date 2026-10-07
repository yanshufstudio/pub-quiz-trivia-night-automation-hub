// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RoundQuestionView, RoundTeamState } from "@/lib/api-types";
import { RoundTeamPlay } from "./RoundTeamPlay";

const team = { code: "ABCDE", token: "t0ken", teamId: "team-1", teamName: "Quizzly Bears" };

function question(index: number): RoundQuestionView {
  return { index, id: `q${index}`, text: `Question ${index + 1}?`, points: 1, type: "TEXT", options: [], hasMedia: false, answer: null };
}

function roundState(asked: number, myAnswers: RoundTeamState["myAnswers"] = []): RoundTeamState {
  return {
    mode: "ROUND",
    code: team.code,
    status: "ROUND_OPEN",
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
    teamName: team.teamName,
    sitsOutRound: false,
    myAnswers,
    myRoundTotal: null,
  };
}

const folded = (container: HTMLElement) => container.querySelector("details summary")?.textContent ?? "";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("saving with no connection", () => {
  it("says the answer was not saved, not the browser's own error", async () => {
    // Safari's words for a fetch that never reached the server; Chrome says "Failed to fetch".
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Load failed"))));
    render(<RoundTeamPlay state={roundState(1)} team={team} onChanged={async () => {}} />);

    fireEvent.change(screen.getByLabelText("Answer to Round 1 · Q1"), { target: { value: "Canberra" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("No connection, your answer was not saved")).toBeTruthy();
    expect(screen.queryByText("Load failed")).toBeNull();
    // The typed answer is still there to save again.
    expect((screen.getByLabelText("Answer to Round 1 · Q1") as HTMLInputElement).value).toBe("Canberra");
  });

  it("still shows the server's reason when the server did answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "The round is closed" }), { status: 409 }))
    );
    render(<RoundTeamPlay state={roundState(1)} team={team} onChanged={async () => {}} />);

    fireEvent.change(screen.getByLabelText("Answer to Round 1 · Q1"), { target: { value: "Canberra" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("The round is closed")).toBeTruthy();
  });
});
