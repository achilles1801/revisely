/**
 * Answers written ahead (scripts/tafsir/answers-batch.js): the mushaf's first starter for every page, in Storage at
 * `tafsir/answers/v1/p<page>.json`. Served only for that question about a whole Madani 1405 page, as the batch asked it.
 */
import type { QuranScope } from '../types';
import { AYAH_COUNTS, PAGE_STARTS, pageOfKey } from './ayat';

/** The mushaf's first starter (src/i18n/en/revo.ts revo.tafsir.startPage1), word for word. */
export const AHEAD_QUESTION = 'What’s happening here?';

/** The page when the scope is exactly one Madani 1405 page, else null (a 1441 page that differs, an ayah). */
export function aheadPageOf(s: QuranScope): number | null {
  const start = s.from[0] * 1000 + s.from[1];
  const last = s.to[0] * 1000 + s.to[1];
  const page = pageOfKey(start);
  if (PAGE_STARTS[page - 1] !== start) return null;
  return last === lastAyahOfPage(page) ? page : null;
}

/** The page's last ayah: the one before the next page's first (the end of the surah before, when that starts one). */
export function lastAyahOfPage(page: number): number {
  if (page >= 604) return 114006;
  const next = PAGE_STARTS[page];
  if (next % 1000 !== 1) return next - 1;
  const surah = Math.floor(next / 1000) - 1;
  return surah * 1000 + AYAH_COUNTS[surah - 1];
}
