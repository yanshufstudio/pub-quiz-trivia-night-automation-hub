/**
 * Is this an app's embedded browser rather than a real one?
 *
 * Google refuses OAuth inside embedded webviews (its `disallowed_useragent`
 * policy), and the person sees Google's refusal rather than ours — so by the time
 * it fails there is nothing on our page explaining it. /sign-in already carries an
 * unconditional line about it; this is the narrower notice that can say "you are in
 * one" rather than "if you are" (N3).
 *
 * The tokens, and why each is here:
 *
 * - `LinkedInApp` — LinkedIn's **iOS** webview. Worth stating plainly: LinkedIn on
 *   **Android** opens a Chrome Custom Tab, which is a real Chrome and sends a normal
 *   Chrome user agent with no LinkedIn token in it, and Google sign-in works there
 *   (tested 27 Sep). So this token does not fire for the case that works, which is
 *   the behaviour wanted rather than a lucky accident.
 * - `FBAN` / `FBAV` — Facebook's app (iOS and Android respectively).
 * - `Instagram` — Instagram's in-app browser.
 * - `Line/` — LINE's. The slash is part of the token and keeps it from matching a
 *   word like "outline" or a `Linux` build string.
 * - `; wv)` — the marker Android puts in a WebView's user agent. It catches every
 *   Android in-app browser at once, including apps nobody has thought to list.
 *
 * Deliberately a list of positives rather than an attempt to recognise real
 * browsers: a false negative costs nothing (the unconditional line on /sign-in
 * still applies, and the email code still works), while a false positive tells
 * somebody in a perfectly good browser that their sign-in may be blocked.
 */
const IN_APP_TOKENS = ["LinkedInApp", "FBAN", "FBAV", "Instagram", "Line/", "; wv)"] as const;

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return IN_APP_TOKENS.some((token) => userAgent.includes(token));
}

export const IN_APP_BROWSER_NOTICE =
  "You're in an in-app browser. Google may block sign-in here — use the email code below, " +
  "or open this page in your browser.";
