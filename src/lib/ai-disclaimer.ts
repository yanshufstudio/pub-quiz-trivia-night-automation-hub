import { getT } from "@/i18n";

/**
 * ACC3: one line, the same everywhere it appears — under Generate on /create,
 * at the top of every pack in the editor, and on /faq. Not on printed sheets:
 * those go to the room, and the line is for the host.
 *
 * The accuracy review (ACC2) is internal, so nothing public says a pack was
 * "fact-checked"; this says what is true whether or not the review ran.
 *
 * The words live in the message files (common.aiDisclaimer); app screens read
 * them in their own language, and this English copy is for /faq, which is not
 * translated yet (L1).
 */
export const AI_DISCLAIMER = getT("en")("common.aiDisclaimer");
