import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { countOf } from "@/lib/plural";
import { FREE_PACK_ALLOWANCE } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";
import { QUIZZES, getQuiz } from "./index";
import {
  ANSWERS_HEADING,
  PRINT_BUTTON_LABEL,
  PRINTED_SHEETS_IMAGE,
  QUIZZES_HUB,
  answersLabel,
  questionsLabel,
  roundHeading,
} from "./page-copy";

const PUBLIC = path.resolve(__dirname, "../../../public");
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

/** Every string anywhere inside a value, so a new field is covered without touching this file. */
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

describe("the quiz list", () => {
  it("has a unique, URL-safe slug for every quiz", () => {
    const slugs = QUIZZES.map((quiz) => quiz.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("finds a quiz by slug and returns nothing for an unknown one", () => {
    expect(getQuiz("halloween")?.slug).toBe("halloween");
    expect(getQuiz("bonfire-night")?.slug).toBe("bonfire-night");
    expect(getQuiz("thanksgiving")?.slug).toBe("thanksgiving");
    expect(getQuiz("not-a-quiz")).toBeUndefined();
  });

  it("lists Halloween, Bonfire Night, then Thanksgiving, which is the order the quizzes page shows", () => {
    expect(QUIZZES.map((quiz) => quiz.slug)).toEqual(["halloween", "bonfire-night", "thanksgiving"]);
  });

  it("has two rounds of ten in every quiz", () => {
    for (const quiz of QUIZZES) {
      expect(quiz.rounds, quiz.slug).toHaveLength(2);
      for (const round of quiz.rounds) expect(round.questions, `${quiz.slug}: ${round.title}`).toHaveLength(10);
    }
  });

  it("has a non-empty question and answer everywhere", () => {
    for (const quiz of QUIZZES) {
      expect(quiz.rounds.length, `${quiz.slug} has rounds`).toBeGreaterThan(0);
      for (const round of quiz.rounds) {
        expect(round.title.trim()).not.toBe("");
        for (const item of round.questions) {
          expect(item.question.trim()).not.toBe("");
          expect(item.answer.trim()).not.toBe("");
        }
      }
    }
  });

  it("keeps each quiz's picture under /quizzes in public, at the size it declares", () => {
    for (const quiz of QUIZZES) {
      expect(quiz.image.url).toBe(`/quizzes/${quiz.slug}.png`);
      const png = readFileSync(path.join(PUBLIC, quiz.image.url));
      // IHDR: width and height are big-endian u32s at bytes 16 and 20.
      expect(png.readUInt32BE(16)).toBe(quiz.image.width);
      expect(png.readUInt32BE(20)).toBe(quiz.image.height);
    }
  });
});

describe("the Halloween quiz", () => {
  const halloween = getQuiz("halloween");

  it("has two rounds of ten questions, each with an answer", () => {
    expect(halloween).toBeDefined();
    expect(halloween!.rounds).toHaveLength(2);
    for (const round of halloween!.rounds) {
      expect(round.questions).toHaveLength(10);
      for (const item of round.questions) expect(item.answer.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries the exact title the page is published under", () => {
    expect(halloween!.title).toBe("Halloween trivia questions and answers: 20 free questions for your trivia night");
  });

  it("says trivia, not quiz, in the copy marketing switched", () => {
    expect(halloween!.description).toBe(
      "Two Halloween trivia rounds with answers: traditions and history, then horror films and books. Free to use. Or make your own Halloween trivia night in minutes.",
    );
    expect(halloween!.heading).toBe("Halloween trivia questions and answers");
    expect(halloween!.intro).toBe(
      "Two rounds of ten for a Halloween trivia night: one on where the traditions came from, one on horror films and books. Answers are under each round. Use them as they are, print them, or swap in your own.",
    );
    expect(halloween!.image.alt).toBe(
      "A carved jack-o'-lantern glowing on a dark green background, with the words Halloween trivia.",
    );
    expect(halloween!.cta.paragraphs[2]).toBe("A free account gets 2 packs every 30 days, no card needed.");
    expect(halloween!.cta.button).toBe("Make your own trivia night");
  });

  it("is shared with its own 1200x630 picture", () => {
    expect(halloween!.image).toMatchObject({ url: "/quizzes/halloween.png", width: 1200, height: 630 });
  });
});

describe("the Bonfire Night quiz", () => {
  const bonfire = getQuiz("bonfire-night");

  it("has two rounds of ten questions, each with an answer", () => {
    expect(bonfire).toBeDefined();
    expect(bonfire!.rounds).toHaveLength(2);
    for (const round of bonfire!.rounds) {
      expect(round.questions).toHaveLength(10);
      for (const item of round.questions) {
        expect(item.question.trim().length).toBeGreaterThan(0);
        expect(item.answer.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("carries the exact title the page is published under", () => {
    expect(bonfire!.title).toBe("Bonfire Night quiz questions and answers: 20 free questions for your quiz night");
  });

  it("is shared with its own 1200x630 picture", () => {
    expect(bonfire!.image).toMatchObject({ url: "/quizzes/bonfire-night.png", width: 1200, height: 630 });
  });
});

describe("the Thanksgiving quiz", () => {
  const thanksgiving = getQuiz("thanksgiving");

  it("carries the approved title, description, heading and intro", () => {
    expect(thanksgiving).toBeDefined();
    expect(thanksgiving!.title).toBe(
      "Thanksgiving trivia questions and answers: 20 free questions for your trivia night",
    );
    expect(thanksgiving!.description).toBe(
      "Two Thanksgiving trivia rounds with answers: history and traditions, then food, football and the parade. Free to use. Or make your own trivia night in minutes.",
    );
    expect(thanksgiving!.heading).toBe("Thanksgiving trivia questions and answers");
    expect(thanksgiving!.rounds.map((round) => round.title)).toEqual([
      "History and traditions",
      "Food, football and the parade",
    ]);
  });

  it("is shared with its own 1200x630 picture", () => {
    expect(thanksgiving!.image).toMatchObject({ url: "/quizzes/thanksgiving.png", width: 1200, height: 630 });
  });

  it("states the free allowance /pricing uses, and the trivia night button", () => {
    expect(thanksgiving!.cta.paragraphs[2]).toBe(
      `A free account gets ${countOf(FREE_PACK_ALLOWANCE, "pack")} every 30 days, no card needed.`,
    );
    expect(thanksgiving!.cta.button).toBe("Make your own trivia night");
  });
});

describe("what a quiz page says", () => {
  it("has no em or en dash in any quiz string or in the page's own copy", () => {
    const copy = [
      PRINT_BUTTON_LABEL,
      ANSWERS_HEADING,
      roundHeading(1, "x"),
      questionsLabel(1),
      answersLabel(1),
      ...allStrings(PRINTED_SHEETS_IMAGE),
      ...allStrings(QUIZZES_HUB),
    ];
    const strings = [...allStrings(QUIZZES), ...copy];
    expect(strings.length).toBeGreaterThan(40);
    for (const text of strings) {
      expect(text.includes(EM_DASH), `em dash in: ${text}`).toBe(false);
      expect(text.includes(EN_DASH), `en dash in: ${text}`).toBe(false);
    }
  });

  it("keeps the printed-sheets picture small enough to load quickly", () => {
    const { size } = statSync(path.join(PUBLIC, PRINTED_SHEETS_IMAGE.src));
    expect(size).toBeLessThan(200 * 1024);
  });
});

describe("the sitemap and robots.txt for the quiz pages", () => {
  const { rules: robotsRules } = robots();
  const rules = Array.isArray(robotsRules) ? robotsRules : [robotsRules];
  const disallowed = rules.flatMap((rule) => (Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow ?? ""]));

  it("lists every quiz page, with no lastModified", () => {
    for (const quiz of QUIZZES) {
      const entry = sitemap().find((e) => e.url === `${SITE_URL}/quizzes/${quiz.slug}`);
      expect(entry, `/quizzes/${quiz.slug} missing from the sitemap`).toBeDefined();
      expect(entry?.lastModified).toBeUndefined();
    }
    expect(sitemap().some((e) => e.url === `${SITE_URL}/quizzes/halloween`)).toBe(true);
    expect(sitemap().some((e) => e.url === `${SITE_URL}/quizzes/bonfire-night`)).toBe(true);
    expect(sitemap().some((e) => e.url === `${SITE_URL}/quizzes/thanksgiving`)).toBe(true);
  });

  it("lists the quizzes page, with no lastModified", () => {
    const entry = sitemap().find((e) => e.url === `${SITE_URL}/quizzes`);
    expect(entry, "/quizzes missing from the sitemap").toBeDefined();
    expect(entry?.lastModified).toBeUndefined();
  });

  it("leaves /quizzes crawlable", () => {
    for (const quiz of QUIZZES) {
      const pathname = `/quizzes/${quiz.slug}`;
      const blockedBy = disallowed.filter((prefix) => prefix !== "" && pathname.startsWith(prefix));
      expect(blockedBy, `${pathname} is blocked by ${blockedBy.join(", ")}`).toEqual([]);
    }
    expect(disallowed.some((prefix) => prefix !== "" && "/quizzes".startsWith(prefix))).toBe(false);
  });
});
