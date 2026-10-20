import { checkStats, groupMistakes, rangeLabel } from '../checkSummary';
import type { CheckRecord } from '../checkHistory';
import { quranWords } from '../__fixtures__/quranWords';

const words = quranWords();
const first = (s: number, a: number) => words.verseFirstWord(s, a);

function record(partial: Partial<CheckRecord>): CheckRecord {
  return {
    id: 'c',
    kind: 'revision',
    day: '2026-10-20',
    startedAt: 0,
    durationMs: 60_000,
    from: first(2, 1),
    to: first(2, 6) - 1,
    recited: 100,
    mistakes: [],
    ...partial,
  };
}

describe('checkStats', () => {
  it('counts mistakes and corrections', () => {
    const s = checkStats(record({ mistakes: [{ w: 1, k: 'wrong' }, { w: 2, k: 'missed' }, { w: 3, k: 'wrong', c: true }] }));
    expect(s).toEqual({ mistakes: 2, corrected: 1, accuracy: 98 });
  });

  it('counts words missed in a row (a skipped verse) as one mistake, accuracy per word', () => {
    const missed = [10, 11, 12, 13].map((w) => ({ w, k: 'missed' as const }));
    const s = checkStats(record({ recited: 100, mistakes: [...missed, { w: 20, k: 'wrong' }, { w: 21, k: 'missed' }] }));
    expect(s.mistakes).toBe(3);
    expect(s.accuracy).toBe(94);
  });

  it('is 100% with no mistakes', () => {
    expect(checkStats(record({})).accuracy).toBe(100);
  });
});

describe('groupMistakes', () => {
  it('groups by verse in mushaf order and spots a skipped verse', () => {
    const [from, to] = words.verseRange(2, 3);
    const skipped = Array.from({ length: to - from }, (_, i) => ({ w: from + i, k: 'missed' as const }));
    const groups = groupMistakes(record({ mistakes: [...skipped, { w: first(2, 2) + 4, k: 'wrong', h: 'فيها' }] }), words);
    expect(groups.map((g) => `${g.sura}:${g.ayah}`)).toEqual(['2:2', '2:3']);
    expect(groups[0].skipped).toBe(false);
    expect(groups[0].words).toHaveLength(7);
    expect(groups[1].skipped).toBe(true);
  });
});

describe('rangeLabel', () => {
  it('names the verses recited', () => {
    expect(rangeLabel(record({}), words)).toBe('Al-Baqarah 1–5');
    expect(rangeLabel(record({ from: first(1, 5), to: first(2, 7) }), words)).toBe('Al-Fātiḥah 5 – Al-Baqarah 7');
    expect(rangeLabel(record({ from: first(2, 5), to: first(2, 5) + 2 }), words)).toBe('Al-Baqarah 5');
  });
});
