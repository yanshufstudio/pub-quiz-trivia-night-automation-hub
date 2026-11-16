"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_LANGUAGE, getT, type Language, type Translator } from "./index";

const LanguageContext = createContext<Language>(DEFAULT_LANGUAGE);

/**
 * The language of everything under it. The root layout sets the page's
 * language (pageLanguage()); a game screen sets the game's, which also sets
 * `<html lang dir>` while it is on screen, so a right-to-left game lays out
 * right to left from the root.
 */
export function LanguageProvider({
  lang,
  document: ownsDocument = false,
  children,
}: {
  lang: Language;
  /** Set `<html lang dir>` to this language while mounted. */
  document?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!ownsDocument) return;
    const html = window.document.documentElement;
    const before = { lang: html.lang, dir: html.dir };
    html.lang = lang;
    html.dir = getT(lang).dir;
    return () => {
      html.lang = before.lang;
      html.dir = before.dir;
    };
  }, [lang, ownsDocument]);
  return <LanguageContext.Provider value={lang}>{children}</LanguageContext.Provider>;
}

export function useT(): Translator {
  return getT(useContext(LanguageContext));
}
