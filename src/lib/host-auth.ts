import { timingSafeEqual } from "node:crypto";

/**
 * Session-control endpoints (advance, score overrides, the host view) must
 * only be usable by whoever created the session, not by anyone who knows
 * the join code — the join code is handed to every team in the room by
 * design, so it can't double as host authority.
 */
export function isValidHostToken(sessionHostToken: string, provided: string | null): boolean {
  return tokensMatch(sessionHostToken, provided);
}

/**
 * The comparison itself, for the other bearer secret in this app: a team's
 * token, which `src/lib/question-media-access.ts` checks before serving a
 * question's image. Same discipline, same reason — a length-or-prefix oracle
 * on a token is free to whoever asks for it.
 */
export function tokensMatch(expected: string, provided: string | null | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
