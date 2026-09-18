import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createPackFromGenerated } from "@/lib/create-pack";
import { generateQuizPack, ModelDeclinedError, UnusableModelOutputError } from "@/lib/generate-pack";
import { wizardRequestSchema } from "@/lib/quiz-schema";
import { rateLimit } from "@/lib/rate-limit";
import { MissingApiKeyError } from "@/lib/anthropic";
import {
  getCreatorReadOnly,
  getOrCreateCreator,
  releaseFreeGeneration,
  reserveFreeGeneration,
  FREE_LIMIT,
} from "@/lib/creator";
import { reserveDailyGeneration } from "@/lib/daily-ceiling";

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
 * - 422: the brief itself is the problem — also the model declining to write
 *   it, which no amount of retrying will change.
 * - 502: everything else — an unusable response we can't attribute. Still
 *   worth retrying, so the message keeps saying so.
 */
function failureStatus(err: unknown): number {
  if (err instanceof ModelDeclinedError) return 422;
  if (err instanceof UnusableModelOutputError && err.truncated) return 422;
  if (err instanceof Anthropic.APIError && (err.status === 429 || (err.status ?? 0) >= 500)) return 503;
  return 502;
}

function failureBody(err: unknown): { error: string; declined?: true } {
  // The model's own explanation, verbatim — it is the only thing that tells
  // the user what to change. `declined` is what stops /create offering a
  // retry that cannot succeed.
  if (err instanceof ModelDeclinedError) {
    return {
      error: err.reason || "The question generator declined this brief. Try describing a different quiz.",
      declined: true,
    };
  }
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

  // Validated before an identity exists. A malformed body used to mint a
  // Creator row and hand out a cookie on its way to a 400 — free storage for
  // anyone pointing a script at the endpoint.
  const body = await req.json().catch(() => null);
  const parsed = wizardRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  // Read-only, so a caller with no cookie is simply FREE — the lowest trust
  // there is — and still has no row in the database. Minting one is what the
  // old order did first, which is exactly what made a cookie-less curl loop
  // an unlimited generator: every request arrived as a brand-new creator with
  // a full allowance.
  const existing = await getCreatorReadOnly(req);
  const plan = existing?.plan === "PRO" ? "PRO" : "FREE";

  // The ceiling that actually bounds the bill, taken before anything is spent
  // and before any row is written. There is no identity in its key, so
  // rotating or dropping cookies does not move it.
  const daily = await reserveDailyGeneration(plan);
  if (!daily.allowed) {
    return NextResponse.json(
      {
        error:
          plan === "PRO"
            ? "TriviaFoundry has hit today's generation ceiling across all accounts. " +
              "This is a safety limit, not your subscription — please try again tomorrow, " +
              "and email us if you need it raised."
            : "TriviaFoundry has hit today's free generation ceiling across all visitors. " +
              "Pro subscribers generate from a separate allowance — see /pricing — " +
              "or try again tomorrow.",
        dailyCeilingReached: true,
        limit: daily.limit,
      },
      { status: 503, headers: { "Retry-After": String(daily.retryAfterSeconds) } }
    );
  }

  const { creator, setCookieOn } = await getOrCreateCreator(req);

  // Claimed before the model call, not counted after it: the check and the
  // increment are one atomic statement, so two concurrent requests on one
  // cookie can no longer both pass on the same stale read (M12).
  const reservation = await reserveFreeGeneration(creator);
  if (!reservation.reserved) {
    await daily.release();
    const res = NextResponse.json(
      {
        error: "You've used your free packs for this period. Upgrade to Pro for unlimited generation.",
        packsGeneratedInPeriod: reservation.used,
        limit: FREE_LIMIT,
      },
      { status: 403 }
    );
    setCookieOn(res);
    return res;
  }

  /** Give back everything this request reserved but did not spend. */
  const releaseReservations = async () => {
    await releaseFreeGeneration(creator);
    await daily.release();
  };

  let generated;
  try {
    generated = await generateQuizPack(parsed.data.prompt);
  } catch (err) {
    await releaseReservations();
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
    // internals (model names, request ids, etc.) to the client. A decline is
    // not a failure — the model worked, it just said no — so it is not logged
    // as one, or every refused brief would read like an outage.
    if (err instanceof ModelDeclinedError) {
      console.warn("Quiz pack brief declined by the model:", err.reason || "(no reason given)");
    } else {
      console.error("Quiz pack generation failed:", err);
    }
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
  const res = NextResponse.json({ pack }, { status: 201 });
  setCookieOn(res);
  return res;
}
