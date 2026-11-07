// The verses a set of mushaf pages holds, as a reader names them: "Al-Mulk 1–12" (mock d1's Memorized
// sub-line), "Al-Mulk 27 to Al-Qalam 15" across surahs. From the pages' verse positions (lib/ayahBounds),
// in the mushaf the user reads.

import { versesOnPage } from './ayahBounds';
import { getSurah } from './quranData';
import { pageRuns } from './pageRanges';

const nameOf = (sura: number) => getSurah(sura)?.name ?? `Surah ${sura}`;

/** "Al-Mulk 1–12" for page 562; runs of pages joined with ", "; null when a page's verses aren't known. */
export function ayahSpan(pages: Iterable<number>): string | null {
  const parts: string[] = [];
  for (const run of pageRuns(pages)) {
    const first = versesOnPage(run.first)[0];
    const lastPage = versesOnPage(run.last);
    const last = lastPage[lastPage.length - 1];
    if (!first || !last) return null;
    if (first.sura === last.sura) {
      parts.push(first.ayah === last.ayah ? `${nameOf(first.sura)} ${first.ayah}` : `${nameOf(first.sura)} ${first.ayah}–${last.ayah}`);
    } else {
      parts.push(`${nameOf(first.sura)} ${first.ayah} to ${nameOf(last.sura)} ${last.ayah}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : null;
}
