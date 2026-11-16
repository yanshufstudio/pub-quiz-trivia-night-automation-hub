# Adding a language

Every word on the app's screens lives in a message file under
`src/i18n/messages/`. English (`en.json`) is the reference. A new language is a
new file plus one line, and nothing else.

## Steps

1. Copy `src/i18n/messages/en.json` to `src/i18n/messages/<code>.json`, for
   example `he.json`. Use a short code. It is what the database stores.
2. Set its `meta` block:
   - `name`: the language's name in that language, as the desk switch shows it ("עברית").
   - `dir`: `"ltr"` or `"rtl"`.
   - `intl`: the Intl locale for numbers, dates, plurals and lists (`"he-IL"`).
3. Translate every message. Keep each `{placeholder}` exactly as it is. A
   placeholder is a team name, a score or a link, and the sentence must keep it.
4. Give each count the plural forms the language needs. A count message is an
   object keyed by `Intl.PluralRules` categories (`zero`, `one`, `two`, `few`,
   `many`, `other`). `other` is required. Check which categories the language
   uses with `new Intl.PluralRules("<intl>").resolvedOptions().pluralCategories`.
   `common.ordinal` uses the ordinal categories, so "1st" and "2nd" come out right.
5. Add the file to `src/i18n/messages/index.ts`:

   ```ts
   import he from "./he.json";
   export const MESSAGES = { en, he };
   ```

6. Run `npm test`. `src/i18n/messages.test.ts` checks every file against
   English: the same keys and no extras, the same placeholders, a plural object
   wherever English has one, and a valid `meta` block.

That is all. Once there are two languages, the host desk's menu shows its
"Desk language" switch by itself.

## How a language is chosen

- **A game** speaks its pack's language. `QuizPack.language` defaults to `"en"`.
  A session copies it when the game starts and keeps it, so the host desk, the
  team phones, the TV and the print sheets all use one language. Nothing sets a
  pack's language yet. Pack export and import do not carry it either.
- **The host desk** can switch to another language on that device only, per
  game. The pick is kept in local storage (`readDeskLanguage` and
  `writeDeskLanguage` in `src/lib/host-session.ts`).
- **Every other page** uses `pageLanguage()` in `src/i18n/page-language.ts`. It
  returns English today. It is the one place that will later read an account's
  interface language.
- **The sign-in email** is in the page language, because nobody is signed in yet.

## In code

- Client component: `const t = useT()` from `@/i18n/react`.
- Server component: `const t = getT(await pageLanguage())`.
- `t("key", { name })` returns a string. `t.rich("key", { link: <Link/> })` puts
  React nodes into a sentence. `t.number`, `t.date`, `t.list` and `t.ordinal`
  format through Intl.
- API errors are `{ error, code, params? }` (`apiError` in
  `src/lib/api-error.ts`). A screen shows `errorText(t, data, fallbackKey)`,
  which is the message for `errors.<code>` in its language.
- Use logical classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`,
  `text-start`, `text-end`), never `left` or `right`. `<html lang dir>` follows
  the active language.
- `npx eslint .` refuses English typed straight into the app's JSX. See the note
  at the top of `eslint.config.mjs`.

## Not translated yet

The marketing pages (`/`, `/quizzes/*`, `/faq`, `/how-it-works`, `/pricing`)
and the legal pages are still English only, and lint does not check them.
