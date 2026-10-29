import { countOf } from "@/lib/plural";
import { FREE_PACK_ALLOWANCE } from "@/lib/pricing";
import type { Quiz } from "./types";

export const thanksgiving: Quiz = {
  slug: "thanksgiving",
  title: "Thanksgiving trivia questions and answers: 20 free questions for your trivia night",
  description:
    "Two Thanksgiving trivia rounds with answers: history and traditions, then food, football and the parade. Free to use. Or make your own trivia night in minutes.",
  heading: "Thanksgiving trivia questions and answers",
  intro:
    "Two rounds of ten for a Thanksgiving trivia night: one on the history and traditions, one on food, football and the parade. Answers are under each round. They're free to use as they are, to print, or to mix with your own.",
  image: {
    url: "/quizzes/thanksgiving.png",
    width: 1200,
    height: 630,
    alt: "A pumpkin pie and autumn leaves on a dark green background, with the words Thanksgiving trivia.",
  },
  rounds: [
    {
      title: "History and traditions",
      questions: [
        {
          question:
            "In which year did the Plymouth colonists and the Wampanoag share the harvest feast often called the \"first Thanksgiving\"?",
          answer: "1621",
        },
        {
          question: "What was the name of the ship that carried the Pilgrims to America in 1620?",
          answer: "The Mayflower",
        },
        {
          question: "Which Wampanoag leader came to the 1621 harvest feast with about ninety of his men?",
          answer: "Massasoit (Ousamequin also accepted)",
        },
        {
          question:
            "According to an account written by one of the colonists in 1621, how many deer did the Wampanoag hunt and bring to the feast?",
          answer: "Five",
        },
        {
          question: "Which editor of Godey's Lady's Book campaigned for years to make Thanksgiving a national holiday?",
          answer: "Sarah Josepha Hale",
        },
        {
          question: "Which president proclaimed a national day of Thanksgiving in 1863, during the Civil War?",
          answer: "Abraham Lincoln",
        },
        {
          question:
            "In 1939 a president moved Thanksgiving a week earlier to lengthen the holiday shopping season, a change nicknamed \"Franksgiving\". Who was he?",
          answer: "Franklin D. Roosevelt",
        },
        {
          question: "On which Thursday of November does the United States celebrate Thanksgiving?",
          answer: "The fourth Thursday",
        },
        {
          question: "Canada celebrates its Thanksgiving on which Monday of October?",
          answer: "The second Monday",
        },
        {
          question: "In which year did Macy's hold its first Thanksgiving Day parade in New York City?",
          answer: "1924 (accept anything from 1920 to 1929)",
        },
      ],
    },
    {
      title: "Food, football and the parade",
      questions: [
        {
          question: "Which tart red berry, grown in bogs, goes into the sauce on most Thanksgiving tables?",
          answer: "The cranberry",
        },
        {
          question:
            "What is the name of the forked bone that two people pull apart after the turkey dinner, the bigger piece earning a wish?",
          answer: "The wishbone",
        },
        {
          question: "Green bean casserole was created in 1955 in the test kitchen of which soup company?",
          answer: "Campbell's",
        },
        {
          question:
            "Which NFL team has played at home on Thanksgiving Day every year since 1934, apart from a break from 1939 to 1944?",
          answer: "The Detroit Lions",
        },
        {
          question:
            "Which NFL team has hosted a Thanksgiving Day game every year since 1966, with just two exceptions?",
          answer: "The Dallas Cowboys",
        },
        {
          question: "In 1927 the Macy's parade replaced its live zoo animals with what?",
          answer: "Giant balloons",
        },
        {
          question:
            "What is the name for the White House custom of sparing a turkey from the dinner table each November?",
          answer: "The turkey pardon (pardoning the turkey also accepted)",
        },
        {
          question: "Which beagle appears in the 1973 TV special \"A Charlie Brown Thanksgiving\"?",
          answer: "Snoopy",
        },
        {
          question: "What name is given to the big shopping day that follows Thanksgiving?",
          answer: "Black Friday",
        },
        {
          question:
            "Which Arlo Guthrie song, more than 18 minutes long, is played on many radio stations every Thanksgiving?",
          answer: "\"Alice's Restaurant\" (\"Alice's Restaurant Massacree\" also accepted)",
        },
      ],
    },
  ],
  cta: {
    heading: "Want a Thanksgiving round built for your crowd?",
    paragraphs: [
      "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: football for the family room, an easy round for the kids, or harder history for your regulars. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
      "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
      // Follows /pricing.
      `A free account gets ${countOf(FREE_PACK_ALLOWANCE, "pack")} every 30 days, no card needed.`,
    ],
    button: "Make your own trivia night",
  },
};
