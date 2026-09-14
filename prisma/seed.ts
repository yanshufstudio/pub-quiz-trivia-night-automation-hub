import "dotenv/config";
import { db } from "../src/lib/db";
import { DEMO_PACK, DEMO_PACK_PROMPT } from "../src/lib/demo-pack";

// Uses the app's own client (src/lib/db.ts) rather than a bare
// `new PrismaClient()`. Since the move to the libSQL driver adapter, a
// client constructed without one throws at startup ("Missing configured
// driver adapter. Engine type `client` requires an active driver adapter"),
// which is what `npm run db:seed` did on every run. Sharing the app's client
// also means the seed reaches exactly the database the app reads —
// DATABASE_URL, local file or hosted Turso alike.

async function main() {
  const existing = await db.quizPack.findFirst({ where: { title: DEMO_PACK.title } });
  if (existing) {
    console.log(`Demo pack already exists: ${existing.id}`);
    return;
  }

  const pack = await db.quizPack.create({
    data: {
      title: DEMO_PACK.title,
      prompt: DEMO_PACK_PROMPT,
      rounds: {
        create: DEMO_PACK.rounds.map((round, roundIndex) => ({
          index: roundIndex,
          title: round.title,
          category: round.category,
          questions: {
            create: round.questions.map((question, questionIndex) => ({
              index: questionIndex,
              text: question.text,
              answer: question.answer,
              points: question.points,
            })),
          },
        })),
      },
    },
  });

  console.log(`Seeded demo pack: ${pack.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
