import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createPackFromGenerated } from "@/lib/create-pack";
import { generateQuizPack, ModelDeclinedError, UnusableModelOutputError } from "@/lib/generate-pack";
import { wizardRequestSchema } from "@/lib/quiz-schema";
import { rateLimit } from "@/lib/rate-limit";
import { MissingApiKeyError } from "@/lib/anthropic";
import {
  canGenerate,
  getCreatorReadOnly,
  getOrCreateCreator,
  reserveFreeGeneration,
  withRolledPeriod,
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
 * - 422: the brief itself is the problem — it asked for more than one
 *   generation holds, or the model declined to write it. Either way the user
 *   has to change it, and retrying unchanged cannot help.
 * - 503: the upstream model API is rate-limiting or down. Retrying works,
 *   and the SDK has already retried twice by the time we get here.
 * - 502: everything else — an unusable response we can't attribute. Still
 *   worth retrying, so the message keeps saying so.
 */
function failureStatus(err: unknown): number {
  if (err instanceof ModelDeclinedError) return 422;
  if (err instanceof UnusableModelOutputError && err.truncated) return 422;
  if (err instanceof Anthropic.APIError && (err.status === 429 || (err.status ?? 0) >= 500)) return 503;
  return 502;
}

function failureBody(err: unknown): { error: string; declined?: true; notConfigured?: true } {
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

  // Settle this creator's own cap first, against the row we already have.
  // reserveFreeGeneration below is still the authority — this read cannot be
  // trusted to decide anything — but a creator who is plainly out of packs
  // should not INCR and then DECR the shared daily counter on the way to a
  // 403. At the ceiling boundary that churn can make a genuine visitor whose
  // request interleaves read one over the limit and be refused capacity that
  // is not actually in use.
  if (existing && !canGenerate(existing)) {
    return NextResponse.json(
      {
        error: "You've used your free packs for this period. Upgrade to Pro for unlimited generation.",
        packsGeneratedInPeriod: withRolledPeriod(existing).packsGeneratedInPeriod,
        limit: FREE_LIMIT,
      },
      { status: 403 }
    );
  }

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

  /**
   * Give back what this request reserved but did not spend.
   *
   * The two reservations are not refunded on the same terms, because they
   * guard different things. The creator's free pack is a fairness allowance:
   * a user should never lose one to our failure, so it always comes back. The
   * daily ceiling is a *bill* control, and the bill is charged the moment the
   * model produces a completion — a brief that runs to the full 16k
   * max_tokens and then fails validation is the most expensive call the app
   * can make. Refunding the ceiling for those would have left the loop that
   * generates them bounded by nothing but the per-IP throttle, which is the
   * exact hole this ceiling exists to close.
   *
   * So the ceiling is only handed back when we are confident nothing was
   * generated: no client at all (MissingApiKeyError, thrown before the
   * request is built), or the API rejecting the request outright
   * (Anthropic.APIError — a 429 or a 5xx produces no completion and no
   * charge). Everything else keeps its unit.
   */
  const releaseReservations = async (err: unknown) => {
    const nothingWasGenerated = err instanceof MissingApiKeyError || err instanceof Anthropic.APIError;
    try {
      await reservation.release();
      if (nothingWasGenerated) await daily.release();
    } catch (releaseErr) {
      // Never let bookkeeping replace the diagnosis. Without this, a database
      // blip or an Upstash timeout in here would throw straight out of the
      // catch block below and the caller would get an opaque 500 instead of
      // the 422 telling them exactly what to change.
      console.error("Failed to release a generation reservation:", releaseErr);
    }
  };

  let generated;
  try {
    generated = await generateQuizPack(parsed.data.prompt);
  } catch (err) {
    await releaseReservations(err);
    if (err instanceof MissingApiKeyError) {
      // Not an upstream failure — nothing to hide, and "please try again"
      // would be actively misleading here since retrying can't help.
      const res = NextResponse.json(
        {
          error:
            "AI generation isn't configured on this server yet — set ANTHROPIC_API_KEY " +
            "in .env and restart, or use the demo pack (POST /api/packs/seed) instead.",
          // Three different conditions answer 503 — this one, the daily
          // ceiling, and an upstream model outage — so the client cannot tell
          // them apart from the status. Only this one means "generation is
          // not set up here", and only this one should offer the demo pack.
          notConfigured: true,
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

  let pack;
  try {
    pack = await createPackFromGenerated(generated.pack, parsed.data.prompt, creator.id);
  } catch (err) {
    // The model ran and was billed, so the daily unit stays spent — but the
    // caller has nothing to show for it, and charging them a free pack for
    // our storage failure would, at FREE_LIMIT of 2, lock them out for 30
    // days after two of these. The cookie still goes back: without it a
    // first-time visitor's freshly minted Creator row is orphaned, along
    // with every pack they generate afterwards under a new identity.
    console.error("Generated pack could not be saved:", err);
    try {
      await reservation.release();
    } catch (releaseErr) {
      console.error("Failed to release a generation reservation:", releaseErr);
    }
    const res = NextResponse.json(
      { error: "The quiz pack was generated but could not be saved. Please try again." },
      { status: 500 }
    );
    setCookieOn(res);
    return res;
  }

  const res = NextResponse.json({ pack }, { status: 201 });
  setCookieOn(res);
  return res;
}
