/**
 * "1 round", not "1 rounds".
 *
 * A pack with one round said "1 rounds" on the packs list, in the editor's
 * header, on the print sheet and on the host desk — four places, each with its
 * own hard-coded `s`, which is why it was wrong in all of them at once.
 *
 * English-only and deliberately so: this is not an i18n layer, it is the `s`.
 * The plural is passed explicitly when it is not just a suffix.
 */
export function countOf(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
