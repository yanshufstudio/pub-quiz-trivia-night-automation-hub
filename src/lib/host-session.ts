const STORAGE_KEY = "quiz-hub:host-tokens";

// Keyed by session code so a browser that has hosted more than one session
// tonight (or reloads mid-quiz) still has the right key for each.
type ByCode = Record<string, string>;

function readAll(key: string = STORAGE_KEY): ByCode {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ByCode) : {};
  } catch {
    return {};
  }
}

export function readHostToken(code: string): string | null {
  return readAll()[code.toUpperCase()] ?? null;
}

export function writeHostToken(code: string, hostToken: string) {
  const all = readAll();
  all[code.toUpperCase()] = hostToken;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

const DESK_LANGUAGE_KEY = "quiz-hub:desk-language";

/**
 * The host desk's own language for one game on this device, when the host has
 * picked one (L1). Unset means the game's language, which is the default.
 */
export function readDeskLanguage(code: string): string | null {
  return readAll(DESK_LANGUAGE_KEY)[code.toUpperCase()] ?? null;
}

/** Best effort: storage that refuses (a private window, a full quota) only
 * means the pick is not remembered, never that it is not made. */
export function writeDeskLanguage(code: string, lang: string) {
  const all = readAll(DESK_LANGUAGE_KEY);
  all[code.toUpperCase()] = lang;
  try {
    window.localStorage.setItem(DESK_LANGUAGE_KEY, JSON.stringify(all));
  } catch {
    // Not remembered on this device; the desk still switches.
  }
}
