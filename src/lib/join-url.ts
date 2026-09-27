/**
 * The team-facing join link the host desk shows as a QR code. `/play` reads
 * the `code` parameter back with `readJoinCode` to prefill the session-code
 * field, so a scan lands a team one tap from joining.
 */
export function buildJoinUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/play?code=${encodeURIComponent(code)}`;
}

/**
 * Reads `?code=` out of a query string and applies the same sanitising as
 * the join form's input (uppercase, join-code alphabet only, five chars),
 * so a prefilled value is always one the form would accept.
 */
export function readJoinCode(search: string): string {
  const raw = new URLSearchParams(search).get("code") ?? "";
  const cleaned = raw.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5);
  return cleaned.length === 5 ? cleaned : "";
}

/**
 * The host-facing desk link, the counterpart of the join link above.
 *
 * It deliberately carries no host key. The key is this browser's proof of
 * authority over the session (src/lib/host-auth.ts), and a URL is the worst
 * place to keep one — it lands in history, in referrers and in any log that
 * records a path. The creator who started the game does not need it in the
 * link: the desk asks the server for their own key back
 * (GET /api/sessions/[code]/host-key), which only answers for the account that
 * started that session.
 */
export function buildHostUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/host/${encodeURIComponent(code.toUpperCase())}`;
}
