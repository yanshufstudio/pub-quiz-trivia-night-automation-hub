/**
 * What the account corner of the header calls you.
 *
 * The header used to print the whole email address. That is the one string
 * we are certain to have, but it is also the least like a name: on a phone
 * the slot truncates it to about nine characters, so a host signed in as
 * `catherine.okonkwo@…` saw `catherine…` at best and `c.okonkwo…` at worst,
 * and the corner read as a database field rather than as "you are signed in".
 *
 * So: a first name when the account has one, and the part before the `@`
 * when it does not.
 *
 * Which half you get is decided by how you signed in, not by chance. Google
 * hands back a full name, so those accounts have one. The email-code route
 * asks for an address and nothing else, and Better Auth stores `name: ""`
 * for them (`better-auth/dist/plugins/email-otp/routes.mjs` — `name || ""`),
 * so the local part is all there is and it is usually the person's own name
 * anyway.
 *
 * The full address never stops being available: it stays in the `title`
 * tooltip and in the text a screen reader announces. This only changes what
 * is *printed*, which is why it cannot move the header — see the note on
 * `SLOT` in `src/components/AccountNav.tsx` for why that matters so much
 * here.
 */

/**
 * Everything before the last `@`, falling back to the whole string when
 * there is nothing usable in front of it. `lastIndexOf` rather than `split`
 * because a quoted local part may legally contain an `@` of its own, and the
 * last one is always the domain separator.
 */
function localPart(email: string): string {
  const at = email.lastIndexOf("@");
  return (at > 0 ? email.slice(0, at) : email) || email;
}

export function accountDisplayName({ name, email }: { name?: string | null; email: string }): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";

  // A name that is itself an address is no better than the address, and some
  // providers do exactly that rather than leave the field empty. Treat it as
  // "no name" and take the local part, which is the shorter of the two.
  if (first && !first.includes("@")) return first;

  return localPart(email);
}
