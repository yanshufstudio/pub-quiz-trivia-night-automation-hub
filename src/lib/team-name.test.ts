import { describe, expect, it } from "vitest";
import { normalizeTeamName, teamNameKey } from "./team-name";

const NUL = String.fromCharCode(0);
const ZWSP = String.fromCharCode(0x200b);
const RLO = String.fromCharCode(0x202e);

describe("normalizeTeamName", () => {
  it("strips control and format characters and collapses whitespace", () => {
    expect(normalizeTeamName("Quiz\nPigs")).toBe("Quiz Pigs");
    expect(normalizeTeamName(`Quiz${NUL}Pigs`)).toBe("QuizPigs");
    expect(normalizeTeamName(`Quiz${ZWSP}Pigs`)).toBe("QuizPigs");
    expect(normalizeTeamName(`${RLO}gnip ziuQ`)).toBe("gnip ziuQ");
    expect(normalizeTeamName("  Quiz   Pigs  ")).toBe("Quiz Pigs");
  });
  it("keeps emoji, Hebrew, punctuation and HTML-looking text", () => {
    expect(normalizeTeamName("🍺 Beer Necessities")).toBe("🍺 Beer Necessities");
    expect(normalizeTeamName("צוות הינשופים")).toBe("צוות הינשופים");
    expect(normalizeTeamName("<b>Bold</b> & 'Quotes'")).toBe("<b>Bold</b> & 'Quotes'");
  });
  it("can leave nothing behind", () => {
    expect(normalizeTeamName(`${NUL}${ZWSP}  `)).toBe("");
  });
});

describe("teamNameKey", () => {
  it("treats names that differ only by case, spacing or width as the same", () => {
    expect(teamNameKey("quiz pigs")).toBe(teamNameKey("Quiz Pigs"));
    expect(teamNameKey("QUIZ  PIGS")).toBe(teamNameKey("Quiz Pigs"));
    expect(teamNameKey("Team Ａ")).toBe(teamNameKey("Team A"));
  });
  it("still tells genuinely different names apart", () => {
    expect(teamNameKey("Quiz Pigs")).not.toBe(teamNameKey("Quiz Pigs 2"));
  });
});
