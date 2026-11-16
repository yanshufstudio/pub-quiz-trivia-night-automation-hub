import { Fragment, createElement, type ReactNode } from "react";
import { MESSAGES } from "./messages";

/**
 * The app's words, by language (L1).
 *
 * Every screen reads its text from a message file in ./messages, through a
 * translator made here, so a new language is a new message file and nothing
 * else (see docs/adding-a-language.md). English is the reference file: its
 * keys are the typed list of keys, and a key another language lacks falls
 * back to English rather than showing nothing.
 *
 * A message is a string with `{name}` placeholders, or, for a count, an
 * object of Intl.PluralRules categories ("one", "two", "few", "many",
 * "other") chosen by the `count` placeholder.
 */

type Messages = typeof MESSAGES.en;
export type Language = keyof typeof MESSAGES;
export const LANGUAGES = Object.keys(MESSAGES) as Language[];
export const DEFAULT_LANGUAGE: Language = "en";

type PluralForms = { other: string };
type Keys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | PluralForms ? `${P}${K}` : Keys<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Exclude<Keys<Messages>, `meta.${string}`>;

export type Params = Record<string, string | number>;

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && Object.hasOwn(MESSAGES, value);
}

/** A stored or requested language, or the default when it is not one we have. */
export function toLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function languageMeta(lang: Language): { name: string; dir: "ltr" | "rtl"; intl: string } {
  return MESSAGES[lang].meta as { name: string; dir: "ltr" | "rtl"; intl: string };
}

function lookup(lang: Language, key: string): string | Record<string, string> | undefined {
  let node: unknown = MESSAGES[lang];
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" || (node != null && typeof node === "object" && "other" in node)
    ? (node as string | Record<string, string>)
    : undefined;
}

export type Translator = {
  (key: MessageKey, params?: Params): string;
  lang: Language;
  dir: "ltr" | "rtl";
  /** For a code that arrived from somewhere else, such as an API error. */
  has: (key: string) => boolean;
  /** Like calling it, but a placeholder may be a React node (a link, a span with dir="auto"). */
  rich: (key: MessageKey, params: Record<string, ReactNode>) => ReactNode;
  /** "1st", "2nd", "23rd". */
  ordinal: (n: number) => string;
  number: (n: number) => string;
  date: (date: Date | string, options: Intl.DateTimeFormatOptions) => string;
  /** "A, B and C". */
  list: (items: string[]) => string;
};

const cache = new Map<Language, Translator>();

export function getT(lang: Language = DEFAULT_LANGUAGE): Translator {
  const hit = cache.get(lang);
  if (hit) return hit;
  const { intl, dir } = languageMeta(lang);
  const cardinal = new Intl.PluralRules(intl);
  const ordinalRules = new Intl.PluralRules(intl, { type: "ordinal" });
  const numbers = new Intl.NumberFormat(intl);
  const lists = new Intl.ListFormat(intl, { type: "conjunction" });

  const pick = (key: string, params: Record<string, unknown> | undefined, rules = cardinal): string => {
    const message = lookup(lang, key) ?? lookup(DEFAULT_LANGUAGE, key);
    if (message === undefined) throw new Error(`No message for "${key}"`);
    if (typeof message === "string") return message;
    const count = Number(params?.count ?? params?.n ?? 0);
    return message[rules.select(count)] ?? message.other;
  };
  const fill = (template: string, params: Record<string, unknown> | undefined) =>
    template.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const value = params?.[name];
      if (value === undefined) return whole;
      return typeof value === "number" ? numbers.format(value) : String(value);
    });

  const t = ((key: MessageKey, params?: Params) => fill(pick(key, params), params)) as Translator;
  t.lang = lang;
  t.dir = dir;
  t.has = (key) => lookup(lang, key) !== undefined || lookup(DEFAULT_LANGUAGE, key) !== undefined;
  t.rich = (key, params) => {
    const parts = pick(key, params as Record<string, unknown>).split(/(\{\w+\})/);
    return parts.map((part, i) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      const value = name === undefined ? part : name in params ? params[name] : part;
      return createElement(Fragment, { key: i }, typeof value === "number" ? numbers.format(value) : value);
    });
  };
  t.ordinal = (n) => fill(pick("common.ordinal", { n }, ordinalRules), { n });
  t.number = (n) => numbers.format(n);
  t.date = (date, options) => new Intl.DateTimeFormat(intl, options).format(new Date(date));
  t.list = (items) => lists.format(items);
  cache.set(lang, t);
  return t;
}

/**
 * What to show for a failed API call: the message for the error's code in this
 * language, else the server's own English text (an older server, a code this
 * build has no message for), else `fallback`.
 */
export function errorText(t: Translator, data: unknown, fallback: MessageKey): string {
  const body = (data ?? {}) as { code?: unknown; error?: unknown; params?: Params };
  if (typeof body.code === "string" && t.has(`errors.${body.code}`)) {
    return t(`errors.${body.code}` as MessageKey, body.params);
  }
  return typeof body.error === "string" ? body.error : t(fallback);
}
