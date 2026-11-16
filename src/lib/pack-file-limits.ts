/**
 * How big a pack file may be, and what a host is told when theirs is bigger.
 *
 * Vercel refuses any request or response body over 4.5 MB before the app sees
 * it, with its own error page. A pack file embeds its pictures as base64, so a
 * few of them is enough to get there, and export and import then failed with no
 * message of ours. 4 MB leaves room for headers and encoding. Checked on both
 * sides: the browser before it uploads (a larger request never reaches the
 * server) and the routes themselves.
 *
 * A file of its own, importing only the message files, because the import
 * button is a client component and src/lib/pack-file.ts pulls in the server's
 * image code.
 */

import { errorMessage } from "@/lib/api-error";

export const MAX_PACK_FILE_BYTES = 4 * 1024 * 1024;

// The words are in the message files (errors.packTooBigToExport and
// errors.packTooBigToImport, L1); these are their English copies.
export const PACK_TOO_BIG_TO_EXPORT_MESSAGE = errorMessage("packTooBigToExport");

export const PACK_TOO_BIG_TO_IMPORT_MESSAGE = errorMessage("packTooBigToImport");

/** The longest question and answer, here so the editor's inputs (client), its
 * PATCH route and the pack-file schema (PACK_LIMITS) all stop at the same place. */
export const QUESTION_TEXT_MAX = 2000;
export const ANSWER_MAX = 500;
