/**
 * The upload cap for a question image: 2 MB, chosen as the phase-1 default
 * and stated here so it is one number in one place — the upload route, the
 * pack editor, /faq, /how-it-works and the homepage all read it. Nothing re-encodes uploads yet, so this is both the upload cap
 * and the stored size — a photo straight off a phone lands well inside it,
 * and 40 of them is a pack under 80 MB rather than an unbounded one. If the
 * `sharp` re-encode question is later answered yes, the stored size drops
 * and this cap can stay where it is.
 */
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024;

export function formatBytes(byteCount: number): string {
  if (byteCount >= 1024 * 1024) return `${Math.round(byteCount / (1024 * 1024))} MB`;
  return `${Math.round(byteCount / 1024)} KB`;
}
