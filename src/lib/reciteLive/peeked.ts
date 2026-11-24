// Peeked words (Majd, Nov 15 2026: approved; Tarteel keeps them too): words shown by hand during a take, with ‹ or ‹‹
// on the hidden page. A peek is a word not recalled, so the page keeps it in quiet grey ink (even once it has been
// recited), the summary lists them by ayah. They never count in the
// score (the checker counts them as `helped`). The words Test me shows to start a place aren't peeks.

import type { QuranWords } from '../recite/quranWords';
import { t } from '../../i18n';

export type Peeked = ReadonlySet<number>;
export const NOTHING_PEEKED: Peeked = new Set();

/** Each ayah's peeked words, in order: one summary row each. */
export function peekedByAyah(words: QuranWords, peeked: Peeked): { ayah: [number, number]; words: number[] }[] {
  const out: { ayah: [number, number]; words: number[] }[] = [];
  for (const w of [...peeked].sort((a, b) => a - b)) {
    const r = words.ref(w);
    const last = out[out.length - 1];
    if (last && last.ayah[0] === r.sura && last.ayah[1] === r.ayah) last.words.push(w);
    else out.push({ ayah: [r.sura, r.ayah], words: [w] });
  }
  return out;
}

/** "3 words peeked". */
export const peekedLine = (n: number) => t('reciteLive.peeked', { count: n });
