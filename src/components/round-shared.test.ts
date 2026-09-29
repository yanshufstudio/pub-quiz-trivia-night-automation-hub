import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionText } from "@/components/QuestionText";
import { Scoreboard } from "@/components/Scoreboard";
import { questionLabel } from "@/lib/question-number";

describe("one numbering helper for every screen (RM6)", () => {
  it("names a question by round and number", () => {
    expect(questionLabel(2, 5)).toBe("Round 2 · Q5");
    expect(questionLabel(2, 5, 10)).toBe("Round 2 · Q5 of 10");
  });
});

describe("right-to-left groundwork: dir=\"auto\" (RM6)", () => {
  it("on question text", () => {
    const html = renderToStaticMarkup(createElement(QuestionText, { text: "מהי בירת אוסטרליה?" }));
    expect(html).toContain('dir="auto"');
    expect(html).toContain("מהי בירת אוסטרליה?");
  });

  it("on every scoreboard entry's name", () => {
    const html = renderToStaticMarkup(
      createElement(Scoreboard, {
        rows: [
          { teamId: "a", name: "הצוות", score: 3 },
          { teamId: "b", name: "Quizzly Bears", score: 1 },
        ],
      })
    );
    expect(html.match(/dir="auto"/g)?.length).toBe(2);
  });
});
