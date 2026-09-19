import { NextResponse } from "next/server";
import { capturedSignInLinks, clearCapturedSignInLinks, linkCaptureEnabled } from "@/lib/sign-in-email";

/**
 * Reads back the sign-in links this process "sent" — the e2e suite's inbox.
 *
 * A browser cannot read a magic link out of an email, so the suite reads it
 * from here instead. That makes this route the single most dangerous thing in
 * the tree if it ever answered in production: it would hand anyone who asked
 * a live sign-in link for whatever address was most recently requested.
 *
 * It cannot. The gate is `linkCaptureEnabled()`, which requires ALL of:
 * NODE_ENV !== "production", SIGN_IN_LINK_CAPTURE === "1", and no
 * RESEND_API_KEY. The first of those is unsatisfiable on a Vercel production
 * deploy whatever else is configured. `src/lib/sign-in-email.test.ts` pins
 * that predicate and `src/test/sign-in-link-readback.integration.test.ts`
 * pins this route's behaviour under a production-shaped environment.
 *
 * It answers 404, not 403: a route that says "forbidden" has told you it
 * exists.
 */

export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET() {
  if (!linkCaptureEnabled()) return notFound();
  return NextResponse.json({ links: capturedSignInLinks() });
}

/** Lets one spec clear the inbox before it asks for a link, so it cannot read
 * back a link another spec asked for. */
export async function DELETE() {
  if (!linkCaptureEnabled()) return notFound();
  clearCapturedSignInLinks();
  return NextResponse.json({ ok: true });
}
