import { NextRequest, NextResponse } from "next/server";
import type { Session } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { isValidHostToken } from "@/lib/host-auth";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";

/**
 * The checks every host-only session route makes, in the same order as
 * /advance: a signed-in host, a body that parses, a session that exists, and
 * this session's host key. Both of the first and last must pass — the account
 * says a host is signed in, the key says this browser is the host of *this*
 * game (see the comment at the top of the advance route).
 */
export async function hostSessionRequest<T extends { hostToken: string }>(
  req: NextRequest,
  code: string,
  schema: z.ZodType<T>
): Promise<{ ok: true; session: Session; body: T } | { ok: false; response: NextResponse }> {
  const host = await hostSessionForRequest(req);
  if (!host) return { ok: false, response: unauthorized() };

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: "Invalid request" }, { status: 400 }) };
  }

  const session = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Session not found" }, { status: 404 }) };
  }
  if (!isValidHostToken(session.hostToken, parsed.data.hostToken)) {
    return { ok: false, response: NextResponse.json({ error: "Invalid host key" }, { status: 401 }) };
  }
  return { ok: true, session, body: parsed.data };
}
