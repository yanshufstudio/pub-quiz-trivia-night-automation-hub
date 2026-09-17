/**
 * Team names are typed on phones in a noisy room and shown on the host's
 * TV, so the rules are about what reads well there, not about identity.
 *
 * `normalizeTeamName` turns raw input into what gets stored and displayed:
 * control and format characters go (a newline pasted from somewhere else
 * used to split a name over two lines on the host desk; a NUL byte
 * truncated it at the database; zero-width joiners let two identical-looking
 * names coexist), runs of whitespace collapse to one space, and the result
 * is trimmed. Emoji, Hebrew, punctuation and HTML-looking text all stay:
 * React escapes on render, so "<b>Bold</b>" is simply a team called that.
 *
 * `teamNameKey` is what uniqueness is judged on: case-folded and
 * width-folded, so "quiz pigs" cannot join alongside "Quiz Pigs" (the
 * 2026-09-17 multi-device test had both on the board at once, and the host
 * could not tell which was which). The database's unique index stays exact;
 * this check runs first.
 */
// A newline or tab is a separator someone pasted, so it becomes a space;
// every other control or format character (NUL, zero-width joiners, bidi
// overrides) is simply dropped.
const LINE_CONTROLS = /[\t\n\r\f\v]/g;
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/gu;

export function normalizeTeamName(raw: string): string {
  return raw.replace(LINE_CONTROLS, " ").replace(CONTROL_OR_FORMAT, "").replace(/\s+/g, " ").trim();
}

export function teamNameKey(name: string): string {
  return normalizeTeamName(name).normalize("NFKC").toLocaleLowerCase("en");
}

export const TEAM_NAME_MAX = 40;
