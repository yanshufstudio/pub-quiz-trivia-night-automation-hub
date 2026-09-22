import type { Creator } from "@prisma/client";
import { headers as requestHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { assertAuthConfigured, auth } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/creator";
import { creatorForUser } from "@/lib/creator-claim";

/**
 * The one place a host-side surface asks "who is this?".
 *
 * Every check here goes through `auth.api.getSession`, which validates the
 * session against the database. That is deliberate and it is the real check:
 * `src/proxy.ts` also redirects on a missing cookie, but a proxy check only
 * sees whether a cookie is *present*, which is not the same question and is
 * not a defence (Next's own authentication guide says so in as many words).
 * Nothing on this path trusts the proxy having run.
 *
 * Which surfaces are gated, and which deliberately are not:
 *
 *   GATED (host)    /create, /packs, /packs/[id], /packs/[id]/print,
 *                   /host/[code]; POST /api/packs/generate, GET /api/packs,
 *                   GET /api/packs/[id], POST /api/packs/import, POST
 *                   /api/packs/seed, DELETE /api/packs/[id], the PDF and
 *                   export routes, GET /api/creator/status, every
 *                   /api/questions and /api/rounds write, POST
 *                   /api/sessions, the host's advance and score-override
 *                   routes.
 *
 *                   Six of those are also OWNER-only, not merely
 *                   account-only: /packs/[id], /packs/[id]/print, GET
 *                   /api/packs/[id], the PDF and export routes, and POST
 *                   /api/sessions. A signed-in host holding somebody else's
 *                   pack id gets the same 404 a made-up id gets. See
 *                   src/lib/pack-access.ts.
 *
 *   TEAMS           /play and everything it calls: POST
 *   (no account)    /api/sessions/[code]/join, /answers, /leave, GET
 *                   /api/sessions/[code], and GET
 *                   /api/questions/[id]/media. Teams do not have accounts
 *                   and are not getting them — a pub full of strangers
 *                   cannot be asked to sign in to answer question three.
 *
 *                   No account is not the same as no credential. Joining is
 *                   the only one of these that takes nothing, because
 *                   joining is how a team gets its token; every other one
 *                   takes that token, the media route included
 *                   (src/lib/question-media-access.ts).
 *
 *   NOTHING READS   Every read by id now takes something. `GET
 *   BY ID ALONE     /api/packs/[id]` was open on the "unlisted cuid" theory
 *                   and was not entitled to it; `GET
 *                   /api/questions/[id]/media` was the last one left after
 *                   that, and a question id is not a credential either. It
 *                   now serves a team holding a token for the session whose
 *                   current question it is, or a host who may read the pack.
 *
 *   OPEN (public)   /, /pricing, /terms, /privacy, /refunds, /sign-in, and
 *                   /api/auth/* — which is how a session is obtained.
 */

export type HostSession = {
  user: { id: string; email: string; name: string; image?: string | null };
  creator: Creator;
};

export const UNAUTHORIZED_MESSAGE = "Sign in to do that";

/** The 401 every gated API answers with. One shape, one message. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: UNAUTHORIZED_MESSAGE, signInRequired: true }, { status: 401 });
}

/**
 * Pull the legacy identity cookie out of a raw Cookie header.
 *
 * Parsed by hand rather than via `cookies()` or `req.cookies` so that one
 * function serves both server components and route handlers: both can hand
 * over a `Headers`, and neither has to care which it is.
 */
function legacyDeviceKey(headers: Headers): string | undefined {
  const raw = headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== COOKIE_NAME) continue;
    const value = part.slice(eq + 1).trim();
    if (!value) return undefined;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/**
 * The signed-in host, or null. Resolves (and if necessary claims or creates)
 * the Creator that carries their packs, plan and free allowance, so callers
 * never touch the cookie themselves.
 */
export async function hostSession(headers: Headers): Promise<HostSession | null> {
  // Throws in production with no BETTER_AUTH_SECRET — see src/lib/auth.ts.
  // A 500 on a host page is the right answer there; quietly trusting a
  // cookie signed with a published default key is not.
  assertAuthConfigured();
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;

  const creator = await creatorForUser(session.user.id, legacyDeviceKey(headers));
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
    creator,
  };
}

/** For route handlers. `null` means answer with `unauthorized()`. */
export function hostSessionForRequest(req: NextRequest): Promise<HostSession | null> {
  return hostSession(req.headers);
}

/** For server components. `null` means the page should redirect. */
export async function hostSessionForPage(): Promise<HostSession | null> {
  return hostSession(await requestHeaders());
}

/**
 * Where an unauthenticated visitor is sent, carrying where they were going so
 * signing in finishes the journey rather than dumping them on a landing page.
 *
 * `next` is only ever honoured as a same-site path (see `safeNextPath`), so
 * this cannot be bent into an open redirect off the site.
 */
export function signInPathFor(next: string): string {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

/**
 * A `?next=` value that is safe to redirect to: an absolute path on this
 * site, nothing else.
 *
 * Rejects anything with a scheme or an authority — including `//evil.test`
 * (protocol-relative) and `/\evil.test`, which some browsers normalise into
 * one. Anything rejected falls back to `/packs`.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/packs"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/**
 * For server components: return the host, or redirect to /sign-in.
 *
 * `redirect()` throws, so control never returns to the caller when there is
 * no session — which is what lets a page treat the result as non-null.
 */
export async function requireHostPage(next: string): Promise<HostSession> {
  const host = await hostSessionForPage();
  if (!host) redirect(signInPathFor(next));
  return host;
}
