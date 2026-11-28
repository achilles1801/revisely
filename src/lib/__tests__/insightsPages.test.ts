import { getPagesForJuz } from '../quranData';
import { juzTiles } from '../insightsView';
import { coverageBefore, slippingJuz, slippingWords } from '../insightsPages';

const TODAY = '2026-11-28';
const ago = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const juz = (n: number) => getPagesForJuz(n);

describe('Coverage before the range (ACT-38)', () => {
  const memorized = new Set([...juz(29), ...juz(30)]);

  it('counts the pages memorized then that were revised in the same length of days before the range', () => {
    const revised = [
      { day: ago(40), countsFor: ago(40), pages: juz(30) },
      // In the range itself: not the days before.
      { day: ago(5), countsFor: ago(5), pages: juz(29) },
      // Before both spans.
      { day: ago(70), countsFor: ago(70), pages: juz(29) },
    ];
    expect(coverageBefore({ memorized, revised, memorizations: [], today: TODAY, window: 30, firstDay: ago(200) })).toEqual({
      revised: juz(30).length,
      of: memorized.size,
    });
  });

  it('leaves out the pages memorized during the range', () => {
    const memorizations = [{ day: ago(3), pages: juz(29) }];
    expect(coverageBefore({ memorized, revised: [], memorizations, today: TODAY, window: 30, firstDay: ago(200) })).toEqual({ revised: 0, of: juz(30).length });
  });

  it('says nothing when the account is younger than both spans together, or nothing was memorized then', () => {
    expect(coverageBefore({ memorized, revised: [], memorizations: [], today: TODAY, window: 30, firstDay: ago(45) })).toBeNull();
    expect(coverageBefore({ memorized, revised: [], memorizations: [], today: TODAY, window: 30, firstDay: null })).toBeNull();
    const all = [{ day: ago(1), pages: [...memorized] }];
    expect(coverageBefore({ memorized, revised: [], memorizations: all, today: TODAY, window: 30, firstDay: ago(200) })).toBeNull();
  });
});

describe('The juz slipping out of rotation (ACT-38)', () => {
  // Juz 1–6 and 21–30 memorized; Juz 4 last revised 41 days ago, Juz 5 33, Juz 6 31, the rest this week.
  const memorized = new Set([1, 2, 3, 4, 5, 6, ...[21, 22, 23, 24, 25, 26, 27, 28, 29, 30]].flatMap(juz));
  const last = new Map<number, string>();
  for (const p of memorized) last.set(p, ago(2));
  for (const p of juz(4)) last.set(p, ago(41));
  for (const p of juz(5)) last.set(p, ago(33));
  for (const p of juz(6)) last.set(p, ago(31));
  const tiles = juzTiles(memorized, new Set(), last, TODAY);

  it('names the two left longest, longest first', () => {
    expect(slippingJuz(tiles).map((t) => t.juz)).toEqual([4, 5]);
  });

  it('only those left longer than the plan takes to go round', () => {
    expect(slippingJuz(tiles, 32).map((t) => t.juz)).toEqual([4, 5]);
    expect(slippingJuz(tiles, 35).map((t) => t.juz)).toEqual([4]);
    expect(slippingJuz(tiles, 45)).toEqual([]);
  });

  it('a juz never revised in the 30+ days on record comes first', () => {
    const never = new Map(last);
    for (const p of juz(21)) never.delete(p);
    expect(slippingJuz(juzTiles(memorized, new Set(), never, TODAY)).map((t) => t.juz)).toEqual([21, 4]);
  });

  it('says how long ago, and how often the plan goes round', () => {
    expect(slippingWords(slippingJuz(tiles), 15)).toEqual({
      title: 'Juz 4 and Juz 5 are slipping out of rotation',
      detail: 'Last revised 41 and 33 days ago; your plan goes round every 15 days.',
    });
    expect(slippingWords(slippingJuz(tiles, 35), null)).toEqual({ title: 'Juz 4 is slipping out of rotation', detail: 'Last revised 41 days ago.' });
    const never = new Map(last);
    for (const p of juz(21)) never.delete(p);
    expect(slippingWords(slippingJuz(juzTiles(memorized, new Set(), never, TODAY)), 15).detail).toBe(
      'Juz 21 never revised · Juz 4 41 days ago; your plan goes round every 15 days.',
    );
  });
});
