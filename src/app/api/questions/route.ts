import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseOptions } from "@/lib/question-types";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";
import { requirePackOwner } from "@/lib/pack-access";

const createSchema = z.object({
  roundId: z.string().min(1),
});

/** A fresh question always starts as plain TEXT with obviously-placeholder
 * content — the host edits it immediately via the existing PATCH route, the
 * same way a freshly-added multiple-choice option starts blank. */
export async function POST(req: NextRequest) {
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const round = await db.round.findUnique({
    where: { id: parsed.data.roundId },
    include: { questions: true },
  });
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const forbidden = await requirePackOwner(host.creator.id, { roundId: round.id });
  if (forbidden) return forbidden;

  const question = await db.question.create({
    data: {
      roundId: round.id,
      index: round.questions.length,
      text: "New question",
      answer: "Answer",
      points: 1,
    },
  });

  return NextResponse.json(
    {
      question: {
        ...question,
        options: parseOptions(question.options),
        acceptableAnswers: parseOptions(question.acceptableAnswers),
      },
    },
    { status: 201 }
  );
}
