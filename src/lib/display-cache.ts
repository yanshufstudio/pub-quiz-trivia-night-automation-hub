import type { RoundDisplayState } from "@/lib/api-types";

/**
 * A two-second memory of each game's TV view (RM5).
 *
 * Every screen showing /tv/CODE polls every three seconds, and players can
 * open the link on their phones too, so one game can have a dozen pollers all
 * asking the same question. The answer is the same for all of them — the TV
 * view has no per-viewer part — so it is built once and reused for two
 * seconds. Per server instance, which is all that is needed: the point is
 * fewer database reads, not agreement between instances.
 *
 * A host action forgets the game's entry (forgetDisplay, called by the host
 * routes), so a screen served by the same instance sees the change on its next
 * poll rather than up to two seconds later.
 */

const TTL_MS = 2000;
const MAX_ENTRIES = 500;

const entries = new Map<string, { at: number; body: RoundDisplayState }>();

export function cachedDisplay(code: string, nowMs: number): RoundDisplayState | null {
  const entry = entries.get(code);
  if (!entry || nowMs - entry.at >= TTL_MS) return null;
  return entry.body;
}

export function rememberDisplay(code: string, body: RoundDisplayState, nowMs: number) {
  if (entries.size >= MAX_ENTRIES) entries.clear();
  entries.set(code, { at: nowMs, body });
}

export function forgetDisplay(code: string) {
  entries.delete(code.toUpperCase());
}
