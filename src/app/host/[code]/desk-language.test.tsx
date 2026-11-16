// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RoundHostState } from "@/lib/api-types";
import { readDeskLanguage, writeDeskLanguage } from "@/lib/host-session";
import { LanguageProvider } from "@/i18n/react";
import type { Language } from "@/i18n";
import { memoryStorage } from "@/test/readable";

/**
 * L1: the host can pick the desk's own language on this device; until they
 * do, the desk speaks the game's language. The switch is wired but hidden
 * while English is the only language there is.
 */

const { RoundHostDesk } = await import("./RoundHostDesk");

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const state: RoundHostState = {
  mode: "ROUND",
  code: "ABCDE",
  language: "en",
  status: "LOBBY",
  packTitle: "Friday Quiz",
  roundNumber: 1,
  totalRounds: 1,
  totalQuestionsInRound: 1,
  askedCount: 0,
  revealedCount: 0,
  round: null,
  scoreboardShown: false,
  countedRounds: 0,
  tvShowsAll: false,
  countdown: null,
  serverNow: new Date().toISOString(),
  questions: [],
  scoreboard: [],
  teams: [],
  marks: null,
};

function desk(languages: Language[], onLanguage = vi.fn()) {
  render(
    <RoundHostDesk
      code="ABCDE"
      hostToken="host"
      state={state}
      error={null}
      onError={() => {}}
      refresh={async () => {}}
      languages={languages}
      onLanguage={onLanguage}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  return onLanguage;
}

describe("the desk language switch", () => {
  it("is hidden while there is only one language", () => {
    desk(["en"]);
    expect(screen.queryByLabelText("Desk language")).toBeNull();
  });

  it("offers every language once there is a choice, and reports the pick", () => {
    // Two entries stand in for a second language until one exists.
    const onLanguage = desk(["en", "en"]);
    const select = screen.getByLabelText("Desk language") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["English", "English"]);
    fireEvent.change(select, { target: { value: "en" } });
    expect(onLanguage).toHaveBeenCalledWith("en");
  });

  it("remembers the pick per game on this device", () => {
    expect(readDeskLanguage("abcde")).toBeNull();
    writeDeskLanguage("abcde", "en");
    expect(readDeskLanguage("ABCDE")).toBe("en");
    expect(readDeskLanguage("OTHER")).toBeNull();
  });
});

describe("a game screen's language on <html>", () => {
  it("sets lang and dir while the screen is open, and puts them back after", async () => {
    const html = document.documentElement;
    // As a page in some other language would have left them.
    html.lang = "xx";
    html.dir = "rtl";
    const view = render(
      <LanguageProvider lang="en" document>
        <p>game</p>
      </LanguageProvider>
    );
    await act(async () => {});
    expect(html.lang).toBe("en");
    expect(html.dir).toBe("ltr");
    view.unmount();
    expect(html.lang).toBe("xx");
    expect(html.dir).toBe("rtl");
  });
});
