import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * L1: no hard-coded words on the app's screens. Everything a person reads
 * there comes from the message files in src/i18n/messages, so a new language
 * is a new file (docs/adding-a-language.md). These rules catch English typed
 * straight into JSX: as text, in a spoken or shown attribute, or as one side
 * of a `cond ? "…" : "…"`. Punctuation and symbols are allowed. Marketing and
 * legal pages are not translated yet and are not checked.
 */
const APP_SCREENS = [
  "src/app/{play,tv,host,packs,create,sign-in}/**/*.tsx",
  "src/app/not-found.tsx",
  "src/app/layout.tsx",
  "src/components/{AccountNav,ConfirmPanel,CopyButton,Countdown,JoinQr,NavLinks,QuestionText,RoundCountdown,Scoreboard,SiteHeader,StatusBadge}.tsx",
];
// Looks like words, not like a class list or a message key: a capitalised
// word anywhere, or two plain lowercase words (or a word and a number) in a
// row. Class lists are hyphenated ("text-muted"); keys are dotted
// ("desk.markedRight").
const WORDS = "/^(?!\\w+(\\.\\w+)+$).*([A-Z][a-z]|(^|\\s)[a-z]{2,}\\s+([a-z]{2,}|\\d)|\\d\\s+[a-z]{2,}(\\s|$))/";
const SAID = `:matches(Literal[value=${WORDS}], TemplateLiteral:has(TemplateElement[value.raw=${WORDS}]))`;
const SHOWN = "JSXAttribute[name.name=/^(aria-label|placeholder|title|alt)$/]";
const message = "Words a person reads go in the message files (src/i18n/messages), read with t().";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: APP_SCREENS,
    ignores: ["**/*.test.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        { noStrings: true, ignoreProps: true, allowedStrings: ["·", "×", "↑", "↓", "/", ")", ".", "#", "/play"] },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: `${SHOWN} > ${SAID}`, message },
        { selector: `${SHOWN} > JSXExpressionContainer > ${SAID}`, message },
        { selector: `${SHOWN} > JSXExpressionContainer :matches(ConditionalExpression, LogicalExpression) > ${SAID}`, message },
        { selector: `:matches(JSXElement, JSXFragment) > JSXExpressionContainer :matches(ConditionalExpression, LogicalExpression) > ${SAID}`, message },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
