import { countOf } from "@/lib/plural";
import { FREE_PACK_ALLOWANCE } from "@/lib/pricing";
import type { Quiz } from "./types";

export const holidayTrivia: Quiz = {
  slug: "holiday-trivia",
  title: "Holiday trivia questions and answers for a mixed holiday party",
  description:
    "Holiday trivia questions and answers for a mixed crowd: festivals of light, then food and customs from Hanukkah to Lunar New Year. Free to use.",
  heading: "Holiday trivia questions and answers",
  intro:
    "Two rounds of ten for a holiday party where people celebrate different festivals: one on festivals of light around the world, one on holiday food and customs. Answers are under each round. They're free to use as they are, to print, or to mix with your own.",
  image: {
    url: "/quizzes/holiday-trivia.png",
    width: 1200,
    height: 630,
    alt:
      "A lit Hanukkah menorah, a glowing diya lamp and a red paper lantern under a string of lights, with the words Holiday trivia.",
  },
  rounds: [
    {
      title: "Festivals of light around the world",
      questions: [
        {
          question: "How many nights does Hanukkah last?",
          answer: "Eight",
        },
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
        {
          question: "Which Hindu goddess of wealth and good fortune is especially worshipped at Diwali?",
          answer: "Lakshmi",
        },
        {
          question: "In Sweden, which saint's day on 13 December is celebrated with a girl wearing a crown of candles?",
          answer: "Saint Lucy's Day (Lucia also accepted)",
        },
        {
          question: "How many candles does the kinara hold during Kwanzaa?",
          answer: "Seven",
        },
        {
          question: "Which prehistoric monument in England lines up with the sunset on the winter solstice?",
          answer: "Stonehenge",
        },
        {
          question: "Lunar New Year celebrations end on the fifteenth day with which festival?",
          answer: "The Lantern Festival",
        },
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
        {
          question: "What are the jam-filled doughnuts eaten in Israel at Hanukkah called?",
          answer: "Sufganiyot",
        },
        {
          question: "What is the four-sided spinning top played with at Hanukkah?",
          answer: "A dreidel (sevivon also accepted)",
        },
        {
          question:
            "What is the general name for the Indian sweets, such as laddoos and barfi, shared with family and friends at Diwali?",
          answer: "Mithai",
        },
        {
          question: "At Lunar New Year, money is given to children in envelopes of which color?",
          answer: "Red",
        },
        {
          question: "The name Kwanzaa comes from a phrase meaning \"first fruits\" in which language?",
          answer: "Swahili",
        },
        {
          question: "In which decade was Kwanzaa first celebrated?",
          answer: "The 1960s (1966)",
        },
        {
          question:
            "In Scotland, what is the custom of being the first visitor through a home's door after midnight at New Year called?",
          answer: "First-footing (the first-foot also accepted)",
        },
        {
          question: "In Spain, how many grapes do people eat as the clock strikes midnight on New Year's Eve?",
          answer: "Twelve",
        },
        {
          question: "Many Italian-American families eat a Christmas Eve feast of seven what?",
          answer: "Fishes",
        },
        {
          question:
            "Which old midwinter festival gave its name to the log now often served as a chocolate cake at Christmas?",
          answer: "Yule",
        },
      ],
    },
  ],
  cta: {
    heading: "Want a holiday round built for your crowd?",
    paragraphs: [
      "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: one on every festival your team celebrates, an easy round for the kids, or a harder one for the regulars. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
      "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
      // Follows /pricing.
      `A free account gets ${countOf(FREE_PACK_ALLOWANCE, "pack")} every 30 days, no card needed.`,
    ],
    button: "Make your own trivia night",
  },
};
