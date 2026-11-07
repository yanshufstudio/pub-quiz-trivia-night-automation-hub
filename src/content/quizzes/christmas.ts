import { countOf } from "@/lib/plural";
import { FREE_PACK_ALLOWANCE } from "@/lib/pricing";
import type { Quiz } from "./types";

export const christmas: Quiz = {
  slug: "christmas",
  title: "Christmas trivia questions and answers: 20 free for your party",
  description:
    "Two Christmas trivia rounds with answers: traditions around the world, then films, songs and food. Free to use, or make your own trivia night.",
  heading: "Christmas trivia questions and answers",
  intro:
    "Two rounds of ten for a Christmas trivia night: one on traditions around the world, one on Christmas films, songs and food. Answers are under each round. They're free to use as they are, to print, or to mix with your own.",
  image: {
    url: "/quizzes/christmas.png",
    width: 1200,
    height: 630,
    alt: "A lit Christmas tree, wrapped presents and a string of colored lights, with the words Christmas trivia.",
  },
  rounds: [
    {
      title: "Traditions around the world",
      questions: [
        {
          question: "In the Netherlands, Sinterklaas arrives each November on what kind of boat?",
          answer: "A steamboat",
        },
        {
          question:
            "Which fast-food chain's fried chicken became a Japanese Christmas dinner tradition after an ad campaign in 1974?",
          answer: "KFC (Kentucky Fried Chicken)",
        },
        {
          question: "In Icelandic folklore, how many Yule Lads visit children in the nights before Christmas?",
          answer: "13",
        },
        {
          question:
            "What is the name of the horned creature who punishes naughty children in Alpine Christmas folklore?",
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
        {
          question: "In the Gospel of Matthew, what three gifts do the Magi bring?",
          answer: "Gold, frankincense and myrrh",
        },
      ],
    },
    {
      title: "Films, songs and food",
      questions: [
        {
          question: "In \"Home Alone\" (1990), the McCallister family's house is near which US city?",
          answer: "Chicago (Winnetka also accepted)",
        },
        {
          question: "In \"It's a Wonderful Life\", what happens every time a bell rings?",
          answer: "An angel gets his wings",
        },
        {
          question: "The song \"White Christmas\" was first heard in which 1942 film?",
          answer: "Holiday Inn",
        },
        {
          question: "Who released \"All I Want for Christmas Is You\" in 1994?",
          answer: "Mariah Carey",
        },
        {
          question: "Which band had a UK number one in 1973 with \"Merry Xmas Everybody\"?",
          answer: "Slade",
        },
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
  ],
  cta: {
    heading: "Want a Christmas round built for your crowd?",
    paragraphs: [
      "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: Christmas films for the family, an easy round for the kids, or a harder one for the office party. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
      "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
      // Follows /pricing.
      `A free account gets ${countOf(FREE_PACK_ALLOWANCE, "pack")} every 30 days, no card needed.`,
    ],
    button: "Make your own trivia night",
  },
};
