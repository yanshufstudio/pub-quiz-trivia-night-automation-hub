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
    expect(getQuiz("christmas")?.slug).toBe("christmas");
    expect(getQuiz("holiday-trivia")?.slug).toBe("holiday-trivia");
    expect(getQuiz("not-a-quiz")).toBeUndefined();
  });

  it("lists Halloween, Bonfire Night, Thanksgiving, Christmas, then holiday trivia, which is the order the quizzes page shows", () => {
    expect(QUIZZES.map((quiz) => quiz.slug)).toEqual([
      "halloween",
      "bonfire-night",
      "thanksgiving",
      "christmas",
      "holiday-trivia",
    ]);
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

/**
 * The two December pages, every field typed out from marketing's copy files
 * (december/christmas-trivia-page-copy-2026-11-07.md and
 * holiday-trivia-page-copy-2026-11-07-v2.md), so a slip in the module fails here.
 */
describe("the Christmas quiz", () => {
  const christmas = getQuiz("christmas");

  it("carries the approved title, description, heading, intro and picture text", () => {
    expect(christmas).toBeDefined();
    expect(christmas!.title).toBe("Christmas trivia questions and answers: 20 free for your party");
    expect(christmas!.description).toBe(
      "Two Christmas trivia rounds with answers: traditions around the world, then films, songs and food. Free to use, or make your own trivia night.",
    );
    expect(christmas!.heading).toBe("Christmas trivia questions and answers");
    expect(christmas!.intro).toBe(
      "Two rounds of ten for a Christmas trivia night: one on traditions around the world, one on Christmas films, songs and food. Answers are under each round. They're free to use as they are, to print, or to mix with your own.",
    );
    expect(christmas!.image).toEqual({
      url: "/quizzes/christmas.png",
      width: 1200,
      height: 630,
      alt: "A lit Christmas tree, wrapped presents and a string of colored lights, with the words Christmas trivia.",
    });
  });

  it("has both rounds word for word", () => {
    expect(christmas!.rounds).toEqual([
      {
        title: "Traditions around the world",
        questions: [
          { question: "In the Netherlands, Sinterklaas arrives each November on what kind of boat?", answer: "A steamboat" },
          {
            question:
              "Which fast-food chain's fried chicken became a Japanese Christmas dinner tradition after an ad campaign in 1974?",
            answer: "KFC (Kentucky Fried Chicken)",
          },
          { question: "In Icelandic folklore, how many Yule Lads visit children in the nights before Christmas?", answer: "13" },
          {
            question: "What is the name of the horned creature who punishes naughty children in Alpine Christmas folklore?",
            answer: "Krampus",
          },
          {
            question:
              "In Mexico, what are the nine nights of processions before Christmas, re-enacting Mary and Joseph's search for shelter, called?",
            answer: "Las Posadas",
          },
          {
            question:
              "In Italian folklore, which kind old witch brings presents to children on the night before Epiphany, 6 January?",
            answer: "La Befana",
          },
          {
            question:
              "In Catalonia, children \"feed\" a smiling wooden log, then beat it with sticks on Christmas Eve until it gives them sweets. What is the log called?",
            answer: "Caga Tio (Tio de Nadal also accepted)",
          },
          {
            question:
              "Which city sends a Christmas tree to London's Trafalgar Square every year as a thank-you for Britain's help in the Second World War?",
            answer: "Oslo",
          },
          {
            question:
              "Many Orthodox churches, for example in Russia and Ethiopia, celebrate Christmas on which date of the Western calendar?",
            answer: "7 January",
          },
          { question: "In the Gospel of Matthew, what three gifts do the Magi bring?", answer: "Gold, frankincense and myrrh" },
        ],
      },
      {
        title: "Films, songs and food",
        questions: [
          {
            question: "In \"Home Alone\" (1990), the McCallister family's house is near which US city?",
            answer: "Chicago (Winnetka also accepted)",
          },
          { question: "In \"It's a Wonderful Life\", what happens every time a bell rings?", answer: "An angel gets his wings" },
          { question: "The song \"White Christmas\" was first heard in which 1942 film?", answer: "Holiday Inn" },
          { question: "Who released \"All I Want for Christmas Is You\" in 1994?", answer: "Mariah Carey" },
          { question: "Which band had a UK number one in 1973 with \"Merry Xmas Everybody\"?", answer: "Slade" },
          {
            question: "In \"The Twelve Days of Christmas\", what does my true love give to me on the fifth day?",
            answer: "Five gold rings",
          },
          {
            question:
              "Rudolph the Red-Nosed Reindeer first appeared in 1939 in a booklet given away by which US department store chain?",
            answer: "Montgomery Ward",
          },
          {
            question: "In the film \"Elf\" (2003), what are the four main food groups of an elf?",
            answer: "Candy, candy canes, candy corn and syrup",
          },
          {
            question: "What is the name of the tall, domed sweet bread from Milan eaten across Italy at Christmas?",
            answer: "Panettone",
          },
          {
            question:
              "In Britain, what is traditionally stirred into the Christmas pudding to bring luck to whoever finds it?",
            answer: "A silver coin (a sixpence also accepted)",
          },
        ],
      },
    ]);
  });

  it("has the approved call to action, the allowance /pricing uses, and the trivia night button", () => {
    expect(christmas!.cta).toEqual({
      heading: "Want a Christmas round built for your crowd?",
      paragraphs: [
        "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: Christmas films for the family, an easy round for the kids, or a harder one for the office party. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
        "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
        `A free account gets ${countOf(FREE_PACK_ALLOWANCE, "pack")} every 30 days, no card needed.`,
      ],
      button: "Make your own trivia night",
    });
  });
});

describe("the holiday trivia quiz", () => {
  const holiday = getQuiz("holiday-trivia");

  it("carries the approved title, description, heading, intro and picture text", () => {
    expect(holiday).toBeDefined();
    expect(holiday!.title).toBe("Holiday trivia questions and answers for a mixed holiday party");
    expect(holiday!.description).toBe(
      "Holiday trivia questions and answers for a mixed crowd: festivals of light, then food and customs from Hanukkah to Lunar New Year. Free to use.",
    );
    expect(holiday!.heading).toBe("Holiday trivia questions and answers");
    expect(holiday!.intro).toBe(
      "Two rounds of ten for a holiday party where people celebrate different festivals: one on festivals of light around the world, one on holiday food and customs. Answers are under each round. They're free to use as they are, to print, or to mix with your own.",
    );
    expect(holiday!.image).toEqual({
      url: "/quizzes/holiday-trivia.png",
      width: 1200,
      height: 630,
      alt: "A lit Hanukkah menorah, a glowing diya lamp and a red paper lantern under a string of lights, with the words Holiday trivia.",
    });
  });

  it("has both rounds word for word", () => {
    expect(holiday!.rounds).toEqual([
      {
        title: "Festivals of light around the world",
        questions: [
          { question: "How many nights does Hanukkah last?", answer: "Eight" },
          {
            question: "What is the nine-branched candlestick lit during Hanukkah called?",
            answer: "A hanukkiah (a menorah or Hanukkah menorah also accepted)",
          },
          {
            question:
              "Hanukkah is also spelled Chanukah, Hanukah and several other ways. Why does it have so many English spellings?",
            answer:
              "It's written from Hebrew, and its first letter (chet) is a throaty sound English has no letter for (any answer about spelling it from Hebrew accepted)",
          },
          {
            question: "The name Diwali comes from the Sanskrit \"Deepavali\". What does it mean?",
            answer: "A row of lamps (a row of lights also accepted)",
          },
          { question: "Which Hindu goddess of wealth and good fortune is especially worshipped at Diwali?", answer: "Lakshmi" },
          {
            question: "In Sweden, which saint's day on 13 December is celebrated with a girl wearing a crown of candles?",
            answer: "Saint Lucy's Day (Lucia also accepted)",
          },
          { question: "How many candles does the kinara hold during Kwanzaa?", answer: "Seven" },
          { question: "Which prehistoric monument in England lines up with the sunset on the winter solstice?", answer: "Stonehenge" },
          { question: "Lunar New Year celebrations end on the fifteenth day with which festival?", answer: "The Lantern Festival" },
          {
            question:
              "At Hogmanay in Stonehaven, on the northeast coast of Scotland, people parade through the streets swinging balls of what?",
            answer: "Fire (fireballs)",
          },
        ],
      },
      {
        title: "Holiday food and customs",
        questions: [
          { question: "What are the jam-filled doughnuts eaten in Israel at Hanukkah called?", answer: "Sufganiyot" },
          { question: "What is the four-sided spinning top played with at Hanukkah?", answer: "A dreidel (sevivon also accepted)" },
          {
            question:
              "What is the general name for the Indian sweets, such as laddoos and barfi, shared with family and friends at Diwali?",
            answer: "Mithai",
          },
          { question: "At Lunar New Year, money is given to children in envelopes of which color?", answer: "Red" },
          { question: "The name Kwanzaa comes from a phrase meaning \"first fruits\" in which language?", answer: "Swahili" },
          { question: "In which decade was Kwanzaa first celebrated?", answer: "The 1960s (1966)" },
          {
            question:
              "In Scotland, what is the custom of being the first visitor through a home's door after midnight at New Year called?",
            answer: "First-footing (the first-foot also accepted)",
          },
          { question: "In Spain, how many grapes do people eat as the clock strikes midnight on New Year's Eve?", answer: "Twelve" },
          { question: "Many Italian-American families eat a Christmas Eve feast of seven what?", answer: "Fishes" },
          {
            question: "Which old midwinter festival gave its name to the log now often served as a chocolate cake at Christmas?",
            answer: "Yule",
          },
        ],
      },
    ]);
  });

  it("has the approved call to action, the allowance /pricing uses, and the trivia night button", () => {
    expect(holiday!.cta).toEqual({
      heading: "Want a holiday round built for your crowd?",
      paragraphs: [
        "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: one on every festival your team celebrates, an easy round for the kids, or a harder one for the regulars. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
        "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
        `A free account gets ${countOf(FREE_PACK_ALLOWANCE, "pack")} every 30 days, no card needed.`,
      ],
      button: "Make your own trivia night",
    });
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

  it("uses straight apostrophes and quotes only, never curly ones, in any quiz string", () => {
    const curly = /[\u2018\u2019\u201C\u201D]/;
    for (const text of allStrings(QUIZZES)) expect(curly.test(text), `curly quote in: ${text}`).toBe(false);
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
    expect(sitemap().some((e) => e.url === `${SITE_URL}/quizzes/christmas`)).toBe(true);
    expect(sitemap().some((e) => e.url === `${SITE_URL}/quizzes/holiday-trivia`)).toBe(true);
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
