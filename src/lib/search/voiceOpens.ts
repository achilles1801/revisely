// A voice search that found exactly one place opens the reader there (SEARCH-4; Majd, Nov 17 2026: "it takes me to the
// mushaf with the verse highlighted without it still recording then clicking back shows me that one search result"):
// the ayah highlighted, as the result's Open in the reader does, and nothing listening. Several results, or only the
// closest there is, stay a list on the search screen.

import type { VerseHit } from './quranSearch';

/** A search's rows as the screen lists them: places named (a surah, a page…) and ayat found. */
export type FoundRow = { kind: 'target' } | { kind: 'verse'; hit: VerseHit };

/** The one place found, when exactly one was and not just the closest there is (the list says "1 result"); else null. */
export function onlyVerseFound(results: { rows: readonly FoundRow[]; total: number; closest: boolean }): VerseHit | null {
  if (results.closest || results.total !== 1 || results.rows.length !== 1) return null;
  const row = results.rows[0];
  return row.kind === 'verse' ? row.hit : null;
}

/** Where the reader opens for it: the ayah (and the next one a run of words reached) highlighted, nothing else. */
export function readerFor(hit: VerseHit): { sura: number; ayah: number; last: { sura: number; ayah: number } } {
  return { sura: hit.sura, ayah: hit.ayah, last: hit.last };
}
