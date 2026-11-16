const STORAGE_KEY = "quiz-hub:host-tokens";

// Keyed by session code so a browser that has hosted more than one session
// tonight (or reloads mid-quiz) still has the right key for each.
type HostTokens = Record<string, string>;

function readAll(): HostTokens {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as HostTokens) : {};
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
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(window.localStorage.getItem(DESK_LANGUAGE_KEY) ?? "{}") as Record<string, string>;
    return all[code.toUpperCase()] ?? null;
  } catch {
    return null;
  }
}

export function writeDeskLanguage(code: string, lang: string) {
  let all: Record<string, string> = {};
  try {
    all = JSON.parse(window.localStorage.getItem(DESK_LANGUAGE_KEY) ?? "{}");
  } catch {
    // A damaged entry is replaced, not kept.
  }
  all[code.toUpperCase()] = lang;
  window.localStorage.setItem(DESK_LANGUAGE_KEY, JSON.stringify(all));
}
