import type { Quiz } from "./types";

export const halloween: Quiz = {
  slug: "halloween",
  title: "Halloween quiz questions and answers: 20 free questions for your quiz night",
  description:
    "20 free Halloween quiz questions with answers, in two rounds of ten: traditions and history, and horror films and books. Print them or use them as they are.",
  heading: "Halloween quiz questions and answers",
  intro:
    "Two rounds of ten for a Halloween quiz night: one on where the traditions came from, one on horror films and books. Answers are under each round. Use them as they are, print them, or swap in your own.",
  image: {
    url: "/quizzes/halloween.png",
    width: 1200,
    height: 630,
    alt: "A carved jack-o'-lantern glowing on a dark green background, with the words Halloween quiz.",
  },
  rounds: [
    {
      title: "Halloween traditions and history",
      questions: [
        {
          question: "Halloween grew out of which Celtic festival marking the end of the harvest?",
          answer: "Samhain",
        },
        {
          question:
            "Before pumpkins took over, which vegetable did people in Ireland and Scotland carve into lanterns?",
          answer: "Turnips (swedes in Scotland also accepted)",
        },
        {
          question: "\"Halloween\" is a shortened form of which phrase?",
          answer: "All Hallows' Eve (or All Hallows' Evening)",
        },
        {
          question: "Which day in the Christian calendar falls on 1 November, the day after Halloween?",
          answer: "All Saints' Day (All Hallows' Day)",
        },
        {
          question:
            "What is the Halloween game where you try to catch apples floating in water using only your teeth?",
          answer: "Apple bobbing (bobbing for apples; \"dooking\" in Scotland)",
        },
        {
          question:
            "In Scotland, what is the traditional name for children going door to door in costume at Halloween?",
          answer: "Guising",
        },
        {
          question:
            "The jack-o'-lantern is named after Stingy Jack, a character in an Irish folk tale. Who did Jack trick?",
          answer: "The Devil",
        },
        {
          question: "Which US state grows the most pumpkins?",
          answer: "Illinois",
        },
        {
          question:
            "Which Mexican holiday, held on 1 and 2 November, honours family members who have died?",
          answer: "Día de los Muertos (the Day of the Dead)",
        },
        {
          question:
            "Which Irish fruit bread is traditionally baked at Halloween with a ring hidden inside?",
          answer: "Barmbrack (barm brack)",
        },
      ],
    },
    {
      title: "Horror on screen and on the page",
      questions: [
        {
          question: "Who wrote the novel \"Frankenstein\", first published in 1818?",
          answer: "Mary Shelley",
        },
        {
          question: "In which decade was Bram Stoker's \"Dracula\" first published?",
          answer: "The 1890s (1897)",
        },
        {
          question:
            "What is the name of the masked killer in John Carpenter's 1978 film \"Halloween\"?",
          answer: "Michael Myers",
        },
        {
          question: "Which Stephen King novel features Pennywise the clown?",
          answer: "\"It\"",
        },
        {
          question: "What is the name of the hotel in Stephen King's \"The Shining\"?",
          answer: "The Overlook Hotel",
        },
        {
          question: "Which actor played the title role in the 1931 Universal film \"Dracula\"?",
          answer: "Bela Lugosi",
        },
        {
          question:
            "In \"Ghostbusters\" (1984), what giant figure marches through New York in the final act?",
          answer: "The Stay Puft Marshmallow Man",
        },
        {
          question:
            "In which Edgar Allan Poe poem does a bird keep repeating the word \"Nevermore\"?",
          answer: "\"The Raven\"",
        },
        {
          question:
            "Which 1993 stop-motion film, produced by Tim Burton, follows Jack Skellington, the Pumpkin King of Halloween Town?",
          answer: "\"The Nightmare Before Christmas\"",
        },
        {
          question:
            "Which horror film actor performs the spoken-word section of Michael Jackson's \"Thriller\"?",
          answer: "Vincent Price",
        },
      ],
    },
  ],
  cta: {
    heading: "Want a Halloween round built for your crowd?",
    paragraphs: [
      "Tell TriviaFoundry who's playing and what they like, and it writes the rounds in minutes: a scary-films round for film buffs, Halloween for kids, or a costume round for your regulars. You get the full pack, a presenter script and answer sheets to print. On the night, teams answer on their phones (no app to download), tables that prefer paper play in the same game, and you run it round by round with the scores up on the TV.",
      "AI can slip on a fact. Every question is yours to edit, so give the pack a read before the night.",
      "A free account gets 2 quiz packs every 30 days, no card needed.",
    ],
    button: "Make your own quiz",
  },
};
