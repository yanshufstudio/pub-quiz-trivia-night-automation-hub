/**
 * Where a question's image is fetched from, and what has to be on the URL.
 *
 * The bytes used to be served to anyone holding a question id. They are not
 * any more (see `src/lib/question-media-access.ts`), which means the callers
 * that cannot present a session cookie — a team's phone, and the host desk
 * driven by its per-session key — have to say who they are some other way.
 *
 * An `<img src>` is the only thing that fetches this, and an `<img>` cannot
 * set a header, so the credential goes on the query string. That is not a new
 * exposure: a team's token is already a query parameter on every poll of
 * `GET /api/sessions/[code]`, and the host key likewise. The parameter names
 * are deliberately the same ones those routes use, so there is one vocabulary
 * rather than two.
 *
 * This module is imported by client components, so it holds no server code
 * and no imports — the gate that reads these parameters imports the names
 * from here, which is what keeps the two halves from drifting apart.
 */

export const MEDIA_SESSION_CODE_PARAM = "code";
export const MEDIA_TEAM_TOKEN_PARAM = "token";
export const MEDIA_HOST_TOKEN_PARAM = "hostToken";

/** A team on its own phone, or the desk holding this session's host key. */
export type QuestionMediaViewer =
  | { code: string; token: string; hostToken?: undefined }
  | { code: string; hostToken: string; token?: undefined };

/**
 * `viewer` is null on the surfaces that carry a session cookie instead — the
 * pack editor and the print sheet — and those need nothing on the URL.
 */
export function questionMediaUrl(questionId: string, viewer?: QuestionMediaViewer | null): string {
  const path = `/api/questions/${encodeURIComponent(questionId)}/media`;
  if (!viewer) return path;

  const params = new URLSearchParams({ [MEDIA_SESSION_CODE_PARAM]: viewer.code });
  if (viewer.token) params.set(MEDIA_TEAM_TOKEN_PARAM, viewer.token);
  if (viewer.hostToken) params.set(MEDIA_HOST_TOKEN_PARAM, viewer.hostToken);
  return `${path}?${params.toString()}`;
}
