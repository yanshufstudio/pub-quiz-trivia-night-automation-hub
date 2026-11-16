import { DEFAULT_LANGUAGE, type Language } from "./index";

/**
 * The language of every page that is not part of a game: the packs list, the
 * editor, the wizard, sign-in and the account pages (L1). One function, so
 * that when accounts get an interface language this is the only place that
 * reads it. Game screens use the game's language instead.
 */
export async function pageLanguage(): Promise<Language> {
  return DEFAULT_LANGUAGE;
}
