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
 * A file of its own, with no imports, because the import button is a client
 * component and src/lib/pack-file.ts pulls in the server's image code.
 */
export const MAX_PACK_FILE_BYTES = 4 * 1024 * 1024;

export const PACK_TOO_BIG_TO_EXPORT_MESSAGE =
  "This pack is too big to export in one file. Pictures take up most of the space, so a pack with fewer pictures will export.";

export const PACK_TOO_BIG_TO_IMPORT_MESSAGE =
  "This pack file is too big to import in one file. Pictures take up most of the space, so export it again with fewer pictures.";

/** The longest question and answer, here so the editor's inputs (client), its
 * PATCH route and the pack-file schema (PACK_LIMITS) all stop at the same place. */
export const QUESTION_TEXT_MAX = 2000;
export const ANSWER_MAX = 500;
