// What a finished check comes to: counts, the range recited, and its mistakes
// grouped by verse.

import { getSurahDisplay } from '../quranData';
import type { CheckMistake, CheckRecord } from './checkHistory';
import type { QuranWords } from './quranWords';

export interface CheckStats {
  /** Mistakes not corrected afterwards. */
  mistakes: number;
  corrected: number;
  /** Share of recited words that were right (corrected ones count as slips). */
  accuracy: number;
}

export function checkStats(record: CheckRecord): CheckStats {
  const corrected = record.mistakes.filter((m) => m.c);
  const open = record.mistakes.filter((m) => !m.c);
  const recited = Math.max(record.recited, 1);
  // Accuracy is per word; a corrected slip counts half.
  const accuracy = Math.max(0, Math.round((100 * (recited - open.length - corrected.length * 0.5)) / recited));
  return {
    mistakes: countMistakes(open),
    corrected: countMistakes(corrected),
    accuracy: record.recited === 0 ? 0 : accuracy,
  };
}

/**
 * Mistakes as the reciter made them: each wrong word is one, and words missed in
 * a row (a skipped phrase or verse) are one.
 */
export function countMistakes(mistakes: { w: number; k: 'wrong' | 'missed' }[]): number {
  let n = 0;
  let lastMissed = -2;
  for (const m of [...mistakes].sort((a, b) => a.w - b.w)) {
    if (m.k === 'missed' && m.w === lastMissed + 1) {
      lastMissed = m.w;
      continue;
    }
    n++;
    lastMissed = m.k === 'missed' ? m.w : -2;
  }
  return n;
}

export interface VerseMistakes {
  sura: number;
  ayah: number;
  /** The verse's words (numbers). */
  words: number[];
  mistakes: CheckMistake[];
  byWord: Map<number, CheckMistake>;
  /** Every word of the verse was missed: the verse was skipped. */
  skipped: boolean;
}

export function groupMistakes(record: CheckRecord, words: QuranWords): VerseMistakes[] {
  const groups = new Map<string, VerseMistakes>();
  for (const m of [...record.mistakes].sort((a, b) => a.w - b.w)) {
    const { sura, ayah } = words.ref(m.w);
    const key = `${sura}:${ayah}`;
    let g = groups.get(key);
    if (!g) {
      const [from, to] = words.verseRange(sura, ayah);
      g = {
        sura,
        ayah,
        words: Array.from({ length: to - from }, (_, i) => from + i),
        mistakes: [],
        byWord: new Map(),
        skipped: false,
      };
      groups.set(key, g);
    }
    g.mistakes.push(m);
    g.byWord.set(m.w, m);
  }
  for (const g of groups.values()) {
    g.skipped = g.words.length > 1 && g.words.every((w) => g.byWord.get(w)?.k === 'missed' && !g.byWord.get(w)?.c);
  }
  return [...groups.values()];
}

/** "Al-Baqarah 1–25", or "Al-Fātiḥah 5 – Al-Baqarah 7" across surahs. */
export function rangeLabel(record: CheckRecord, words: QuranWords): string {
  const a = words.ref(record.from);
  const b = words.ref(record.to);
  const name = (s: number) => getSurahDisplay(s)?.nameDisplay ?? `Surah ${s}`;
  if (a.sura !== b.sura) return `${name(a.sura)} ${a.ayah} – ${name(b.sura)} ${b.ayah}`;
  return a.ayah === b.ayah ? `${name(a.sura)} ${a.ayah}` : `${name(a.sura)} ${a.ayah}–${b.ayah}`;
}
