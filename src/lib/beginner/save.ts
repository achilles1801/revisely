// Saving a beginner's surahs (BEGIN-1, BEGIN-5) by the ayah (MEM-1): addAyahs and removeAyahs over the account's pages,
// one batch of the pages that changed, and for Today a dated memorization item holding exactly those ayahs (as Activity's
// Memorized by the ayah does), so the day's Memorized block and Insights count them.

import { addAyahs, removeAyahs } from '../memorizedAyahs';
import { pageOfAyah, type AyahKey } from '../ayahKeys';
import { queueChange } from '../offline/queue';
import type { UserPage } from '../../types';

export interface SurahSaveDeps {
  pages: UserPage[];
  updatePages: (pages: UserPage[], changed: number[]) => Promise<void>;
}

/**
 * Applies the ayahs to add and remove and saves the pages that changed. `logDay`: the revision day to log them on
 * (Today); null leaves them unlogged (Before, and setup). Resolves with the page numbers that changed.
 */
export async function saveSurahAyahs(
  deps: SurahSaveDeps,
  change: { add: readonly AyahKey[]; remove: readonly AyahKey[] },
  opts: { now: string; logDay: string | null },
): Promise<number[]> {
  const removed = change.remove.length > 0 ? removeAyahs(deps.pages, change.remove) : { pages: deps.pages, changed: [] };
  const added = change.add.length > 0 ? addAyahs(removed.pages, change.add, opts.now) : { pages: removed.pages, changed: [] };
  const changed = [...new Set([...removed.changed, ...added.changed])].sort((a, b) => a - b);
  if (changed.length > 0) await deps.updatePages(added.pages, changed);
  if (opts.logDay && change.add.length > 0) {
    const onPages = [...new Set(change.add.map((k) => pageOfAyah(k)))].sort((a, b) => a - b);
    await queueChange({ kind: 'memorization.mark', day: opts.logDay, pages: onPages, verses: [...change.add], at: Date.now() });
  }
  return changed;
}
