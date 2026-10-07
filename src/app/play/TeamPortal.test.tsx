// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { fixtureTeam, roundTeamState } from "@/test/round-team-fixture";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { TeamPortal } = await import("./TeamPortal");

/**
 * The phone polls every 3 s. Back from a locked screen or a dropped network
 * it asks at once instead of waiting for the next tick, and while polls fail
 * it shows a calm "Reconnecting…" rather than a red error line.
 */

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const polls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith(`/api/sessions/${fixtureTeam.code}?token=`)).length;

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

/**
 * A plain in-memory Storage. Under Node 26, happy-dom's window.localStorage
 * comes back undefined (Node's own experimental global gets in the way), so
 * the phone's one stored item is given a storage of its own here.
 */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  window.localStorage.setItem("quiz-hub:team", JSON.stringify(fixtureTeam));
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderInLobby(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  render(<TeamPortal />);
  expect(await screen.findByText("Waiting for the host to start the quiz.")).toBeTruthy();
  expect(polls(fetchMock)).toBe(1);
}

describe("polling at once", () => {
  it("polls when the page becomes visible again, without waiting for the next tick", async () => {
    const fetchMock = vi.fn(async () => ok(roundTeamState(0)));
    await renderInLobby(fetchMock);

    setVisibility("hidden");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(polls(fetchMock)).toBe(1);

    setVisibility("visible");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    // waitFor gives up after 1 s, well inside the 3 s interval.
    await waitFor(() => expect(polls(fetchMock)).toBe(2));
  });

  it("polls when the browser comes back online", async () => {
    const fetchMock = vi.fn(async () => ok(roundTeamState(0)));
    await renderInLobby(fetchMock);

    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(polls(fetchMock)).toBe(2));
  });

  it("does not let an older, slower answer overwrite a newer one", async () => {
    let answerFirst!: (res: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => ok(roundTeamState(0)))
      // The second poll hangs, and its answer is from before the host started.
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (answerFirst = resolve)))
      .mockImplementation(async () => ok(roundTeamState(1)));
    await renderInLobby(fetchMock);

    act(() => void window.dispatchEvent(new Event("online")));
    act(() => void window.dispatchEvent(new Event("online")));
    expect(await screen.findByLabelText("Answer to Round 1 · Q1")).toBeTruthy();

    await act(async () => answerFirst(ok(roundTeamState(0))));
    expect(screen.queryByText("Waiting for the host to start the quiz.")).toBeNull();
    expect(screen.getByLabelText("Answer to Round 1 · Q1")).toBeTruthy();
  });
});
