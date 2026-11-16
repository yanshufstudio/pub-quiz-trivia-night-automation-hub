import { getT, type MessageKey, type Params } from "@/i18n";

/**
 * An API error by code (L1).
 *
 * Every refusal an API route sends is `{ error, code, params? }`: `code`
 * names its message in the message files (errors.<code>), so a screen shows it
 * in its own language (see `errorText`), and `error` keeps the English words
 * for anything that reads them as before (tests, logs, older screens).
 */

type CodeOf<K> = K extends `errors.${infer C}` ? C : never;
export type ErrorCode = CodeOf<MessageKey>;

const en = getT("en");

/** The English words for an error code. */
export function errorMessage(code: ErrorCode, params?: Params): string {
  return en(`errors.${code}` as MessageKey, params);
}

export function apiError(code: ErrorCode, params?: Params): { error: string; code: ErrorCode; params?: Params } {
  return params ? { error: errorMessage(code, params), code, params } : { error: errorMessage(code), code };
}
