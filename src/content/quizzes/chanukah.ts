import { countOf } from "@/lib/plural";
import { FREE_PACK_ALLOWANCE } from "@/lib/pricing";
import type { Quiz } from "./types";

export const chanukah: Quiz = {
  slug: "chanukah",
  title: "Chanukah trivia questions and answers: 20 free for your party",
  description:
    "Two Chanukah trivia rounds with answers: the story of the Maccabees, then latkes, dreidels and gelt. Free to use, or make your own trivia night.",
  heading: "Chanukah trivia questions and answers",
  intro:
    "Two rounds of ten for a Chanukah trivia night (you may know it as Hanukkah): one on the history behind the festival, one on its food, games and customs. Answers are under each round. They're free to use as they are, to print, or to mix with your own.",
  image: {
    url: "/quizzes/chanukah.png",
    width: 1200,
    height: 630,
    alt: "A lit nine-branched Chanukah menorah next to a dreidel, chocolate coins and a plate of doughnuts, with the words Chanukah trivia.",
  },
  rounds: [
    {
      title: "The story of Chanukah",
      questions: [
        {
          question: "Chanukah marks the rededication of the Temple in which city?",
          answer: "Jerusalem",
        },
        {
          question: "What does the Hebrew word \"Chanukah\" mean?",
          answer: "Dedication (of the Temple in Jerusalem)",
        },
        {
          question: "The Maccabees revolted against which Seleucid king, who had banned Jewish practice?",
          answer: "Antiochus IV (Antiochus Epiphanes; Antiochus also accepted)",
        },
        {
          question: "Who led the revolt after his father, the priest Mattathias, died?",
          answer: "Judah Maccabee (Judah the Maccabee, Judas Maccabeus)",
        },
        {
          question: "The family of the Maccabees went on to found which ruling dynasty?",
          answer: "The Hasmoneans",
        },
        {
          question:
            "According to the Talmud, the one jar of pure oil found in the Temple should have lasted how long?",
          answer: "One day (it lasted eight)",
        },
        {
          question: "Chanukah begins on the 25th day of which Hebrew month?",
          answer: "Kislev",
        },
        {
          question: "The story of the revolt is told in which books, which are not part of the Hebrew Bible?",
          answer: "The Books of Maccabees (1 and 2 Maccabees)",
        },
        {
          question: "What is the name of the extra candle on the menorah that is used to light the others?",
          answer: "The shamash (shammes also accepted)",
        },
        {
          question: "Counting the helper candle every night, how many candles do you need for all eight nights?",
          answer: "44 (36 Chanukah candles plus 8 for the shamash)",
        },
      ],
    },
    {
      title: "Food, games and customs",
      questions: [
        {
          question: "What are the fried potato pancakes eaten at Chanukah called?",
          answer: "Latkes (levivot also accepted)",
        },
        {
          question: "Why is it a custom to eat food fried in oil at Chanukah?",
          answer: "To remember the miracle of the oil",
        },
        {
          question:
            "The four letters on a dreidel stand for the Hebrew words \"Nes gadol haya sham\". What does that mean?",
          answer: "A great miracle happened there",
        },
        {
          question:
            "On dreidels made in Israel, one letter is different because the miracle happened \"here\". Which letter replaces shin?",
          answer: "Pe (or peh), for \"po\", meaning here",
        },
        {
          question: "In the dreidel game, what do you win if it lands on gimel?",
          answer: "The whole pot",
        },
        {
          question:
            "What is the Yiddish word for the money, often chocolate coins today, given to children at Chanukah?",
          answer: "Gelt (Chanukah gelt)",
        },
        {
          question: "Why is the menorah traditionally placed in a window or by the front door?",
          answer:
            "To make the miracle known to people passing by (any answer about showing or publicizing the miracle accepted)",
        },
        {
          question: "Each night, which candle is lit first?",
          answer: "The newest one, added that night (the one furthest left also accepted)",
        },
        {
          question: "Some families eat cheese and dairy foods at Chanukah in memory of which heroine?",
          answer: "Judith",
        },
        {
          question:
            "Which comedian first sang \"The Chanukah Song\", listing famous Jewish people, on \"Saturday Night Live\" in 1994?",
          answer: "Adam Sandler",
        },
      ],
    },
  ],
  cta: {
    heading: "Want a Chanukah round built for your crowd?",
    paragraphs: [
      "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: an easy round for the kids after candle lighting, or a harder one for the office party. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
      "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
      // Follows /pricing.
      `A free account gets ${countOf(FREE_PACK_ALLOWANCE, "pack")} every 30 days, no card needed.`,
    ],
    button: "Make your own trivia night",
  },
};
