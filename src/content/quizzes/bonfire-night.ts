import type { Quiz } from "./types";

export const bonfireNight: Quiz = {
  slug: "bonfire-night",
  title: "Bonfire Night quiz questions and answers: 20 free questions for your quiz night",
  description:
    "Two ready-made Bonfire Night quiz rounds with answers: the Gunpowder Plot, then bonfires, fireworks and food. Free to use. Or make your own quiz in minutes.",
  heading: "Bonfire Night quiz questions and answers",
  intro:
    "Two rounds of ten for a Bonfire Night quiz: one on the Gunpowder Plot, one on bonfires, fireworks and food. Answers are under each round. Use them as they are, print them, or swap in your own.",
  image: {
    url: "/quizzes/bonfire-night.png",
    width: 1200,
    height: 630,
    alt: "A bonfire with fireworks bursting above it on a dark green background, with the words Bonfire Night quiz.",
  },
  rounds: [
    {
      title: "Remember, remember: the Gunpowder Plot",
      questions: [
        {
          question: "In which year was the Gunpowder Plot foiled?",
          answer: "1605",
        },
        {
          question: "Which king did the plotters mean to kill?",
          answer: "James I (James VI of Scotland also accepted)",
        },
        {
          question: "Guy Fawkes is the name everyone remembers, but who actually led the plot?",
          answer: "Robert Catesby",
        },
        {
          question: "In which English city was Guy Fawkes born?",
          answer: "York",
        },
        {
          question: "What false name was Guy Fawkes using when he was caught?",
          answer: "John Johnson",
        },
        {
          question: "How many barrels of gunpowder were found beneath the House of Lords?",
          answer: "36 (accept anything from 30 to 40)",
        },
        {
          question: "An anonymous letter warning of the plot was sent to which lord?",
          answer: "Lord Monteagle",
        },
        {
          question:
            "Before every State Opening of Parliament, which royal bodyguard searches the cellars of the Palace of Westminster?",
          answer:
            "The Yeomen of the Guard (not the Yeomen Warders, the Tower of London's \"Beefeaters\")",
        },
        {
          question:
            "Before the plot, Guy Fawkes had fought in the Low Countries for which country's army?",
          answer: "Spain",
        },
        {
          question:
            "A 1605 act of Parliament made 5 November a day of public thanksgiving. In which year was it repealed?",
          answer: "1859",
        },
      ],
    },
    {
      title: "Bonfires, fireworks and food",
      questions: [
        {
          question:
            "Complete the rhyme: \"Remember, remember, the fifth of November, gunpowder, treason and...\"",
          answer: "Plot",
        },
        {
          question:
            "Children once wheeled a stuffed effigy round the streets, asking passers-by for \"a penny for the...\" what?",
          answer: "Guy",
        },
        {
          question:
            "Which sticky ginger cake, made with oatmeal and black treacle, is a Bonfire Night tradition in Yorkshire?",
          answer: "Parkin",
        },
        {
          question: "Bonfire toffee, made with black treacle, goes by several other names. Name one.",
          answer: "Treacle toffee, plot toffee or Tom Trot (claggum in Scotland also accepted)",
        },
        {
          question:
            "Which Sussex town holds the UK's biggest Bonfire Night, with seven bonfire societies of its own?",
          answer: "Lewes",
        },
        {
          question:
            "In which Devon town do people carry burning tar barrels on their shoulders through the streets on 5 November?",
          answer: "Ottery St Mary",
        },
        {
          question: "The spinning Catherine wheel firework is named after Saint Catherine of which city?",
          answer: "Alexandria",
        },
        {
          question: "Which chemical element gives fireworks their red colour?",
          answer: "Strontium",
        },
        {
          question: "Which country in the South Pacific still marks Guy Fawkes Night with fireworks?",
          answer: "New Zealand",
        },
        {
          question:
            "The Guy Fawkes mask became a protest symbol after which graphic novel by Alan Moore and David Lloyd, filmed in 2006?",
          answer: "\"V for Vendetta\"",
        },
      ],
    },
  ],
  cta: {
    heading: "Want a Bonfire Night round built for your crowd?",
    paragraphs: [
      "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: harder history for your regulars, an easy round for the kids, or a round on fireworks. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
      "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
      "A free account gets 2 quiz packs every 30 days, no card needed.",
    ],
    button: "Make your own quiz",
  },
};
