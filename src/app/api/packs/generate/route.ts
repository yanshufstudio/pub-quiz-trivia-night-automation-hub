import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createPackFromGenerated } from "@/lib/create-pack";
import { generateQuizPack, UnusableModelOutputError } from "@/lib/generate-pack";
import { wizardRequestSchema } from "@/lib/quiz-schema";
import { rateLimit } from "@/lib/rate-limit";
import { MissingApiKeyError } from "@/lib/anthropic";
import { canGenerate, getOrCreateCreator, withRolledPeriod, FREE_LIMIT } from "@/lib/creator";
import { db } from "@/lib/db";

// Default wizard brief (four rounds) exceeds the platform's default function
// timeout. Raise the ceiling; see docs/portfolio-readiness.md "Reopened
// 2026-09-08" for the measured cause.
export const maxDuration = 60;

/**
 * Every generation failure used to come back as one 502 saying "Please try
 * again", including the failures where trying again provably cannot help.
 * These two split it by what the caller can actually do about it:
 *
 * - 422: the brief itself is the problem (it asked for more than one
 *   generation holds). The user has to change it.
 * - 503: the upstream model API is rate-limiting or down. Retrying works,
 *   and the SDK has already retried twice by the time we get here.
 * - 502: everything else — an unusable response we can't attribute. Still
 *   worth retrying, so the message keeps saying so.
 */
function failureStatus(err: unknown): number {
  if (err instanceof UnusableModelOutputError && err.truncated) return 422;
  if (err instanceof Anthropic.APIError && (err.status === 429 || (err.status ?? 0) >= 500)) return 503;
  return 502;
}

function failureBody(err: unknown): { error: string } {
  if (err instanceof UnusableModelOutputError && err.truncated) {
    return {
      error:
        "That brief asked for a bigger pack than can be generated in one go. " +
        "Try fewer rounds, or fewer questions per round, and generate again.",
    };
  }
  if (err instanceof Anthropic.APIError && (err.status === 429 || (err.status ?? 0) >= 500)) {
    return { error: "The question generator is busy right now. Please try again in a moment." };
  }
  return { error: "Couldn't generate a quiz pack right now. Please try again." };
}

export async function POST(req: NextRequest) {
  // Each call spends real Anthropic API credit, so this is throttled
  // per-IP to bound the cost of a scripted abuse loop hitting a public URL.
  const limited = await rateLimit(req, "packs:generate", { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many quiz packs generated recently. Please wait a bit and try again." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const { creator, setCookieOn } = await getOrCreateCreator(req);
  const rolled = withRolledPeriod(creator);

  if (!canGenerate(rolled)) {
    const res = NextResponse.json(
      {
        error: "You've used your free packs for this month. Upgrade to Pro for unlimited generation.",
        packsGeneratedInPeriod: rolled.packsGeneratedInPeriod,
        limit: FREE_LIMIT,
      },
      { status: 403 }
    );
    setCookieOn(res);
    return res;
  }

  const body = await req.json().catch(() => null);
  const parsed = wizardRequestSchema.safeParse(body);
  if (!parsed.success) {
    const res = NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
    setCookieOn(res);
    return res;
  }

  let generated;
  try {
    generated = await generateQuizPack(parsed.data.prompt);
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      // Not an upstream failure — nothing to hide, and "please try again"
      // would be actively misleading here since retrying can't help.
      const res = NextResponse.json(
        {
          error:
            "AI generation isn't configured on this server yet — set ANTHROPIC_API_KEY " +
            "in .env and restart, or use the demo pack (POST /api/packs/seed) instead.",
        },
        { status: 503 }
      );
      setCookieOn(res);
      return res;
    }
    // Log the real cause server-side; don't forward raw SDK/API error
    // internals (model names, request ids, etc.) to the client.
    console.error("Quiz pack generation failed:", err);
    const res = NextResponse.json(failureBody(err), { status: failureStatus(err) });
    setCookieOn(res);
    return res;
  }

  if (generated.droppedQuestions > 0 || generated.droppedRounds > 0) {
    console.warn(
      `Quiz pack salvaged: dropped ${generated.droppedQuestions} question(s) and ` +
        `${generated.droppedRounds} round(s)${generated.truncated ? " after a max_tokens truncation" : ""}.`
    );
  }

  const pack = await createPackFromGenerated(generated.pack, parsed.data.prompt, creator.id);
  // withRolledPeriod returns the *same* object reference when the period
  // hasn't expired, and a *new* one when it has — so reference inequality
  // here reliably detects a roll (see src/lib/creator.test.ts). When the
  // period rolled, the count must reset to 1 outright: an increment against
  // a value that's about to be zeroed makes no sense. When it didn't roll,
  // use Prisma's atomic `increment` instead of a value computed from a read
  // that happened before the (multi-second) Anthropic call above — otherwise
  // two concurrent requests on the same cookie can race and lose an update.
  const periodRolled = rolled.periodStartedAt !== creator.periodStartedAt;
  await db.creator.update({
    where: { id: creator.id },
    data: periodRolled
      ? { packsGeneratedInPeriod: 1, periodStartedAt: rolled.periodStartedAt }
      : { packsGeneratedInPeriod: { increment: 1 } },
  });

  const res = NextResponse.json({ pack }, { status: 201 });
  setCookieOn(res);
  return res;
}
