import bounds1405 from '../../data/ayahBounds.json';
import bounds1441 from '../../data/ayahBounds1441.json';
import shareTable from '../../data/pageVerseShares.json';
import {
  ayahKey,
  ayahRuns,
  ayahsBetween,
  ayahSharesOnPage,
  ayahsOfPages,
  ayahsOnPage,
  isAyahKey,
  LAST_AYAH,
  nextAyah,
  pageOfAyah,
  previousAyah,
} from '../ayahKeys';
import type { MushafEditionId } from '../mushafEdition';

const EDITIONS: [MushafEditionId, Record<string, number[]>][] = [
  ['madani1405', bounds1405 as Record<string, number[]>],
  ['madani1441', bounds1441 as Record<string, number[]>],
];

/** A page's ayahs and the area each fills, read straight from a bounds file. */
function areasFromBounds(bounds: Record<string, number[]>, page: number): Map<number, number> {
  const d = bounds[String(page)];
  const out = new Map<number, number>();
  for (let i = 0; i < d.length; i += 6) {
    const k = d[i] * 1000 + d[i + 1];
    out.set(k, (out.get(k) ?? 0) + (d[i + 4] - d[i + 2]) * (d[i + 5] - d[i + 3]));
  }
  return out;
}

describe('ayah keys', () => {
  it('step from one ayah to the next across a surah’s end', () => {
    expect(nextAyah(ayahKey(67, 29))).toBe(67030);
    expect(nextAyah(67030)).toBe(68001);
    expect(previousAyah(68001)).toBe(67030);
    expect(nextAyah(LAST_AYAH)).toBeNull();
    expect(previousAyah(1001)).toBeNull();
    expect(ayahsBetween(67027, 68003)).toEqual([67027, 67028, 67029, 67030, 68001, 68002, 68003]);
    expect(ayahsBetween(68003, 67027)).toEqual([]);
  });

  it('know which numbers are ayahs', () => {
    expect(isAyahKey(2286)).toBe(true);
    expect(isAyahKey(2287)).toBe(false);
    expect(isAyahKey(115001)).toBe(false);
    expect(isAyahKey(67000)).toBe(false);
    expect(isAyahKey(1.5)).toBe(false);
  });

  it('put each ayah on its page: Al-Mulk 1–12 on 562, 13–26 on 563', () => {
    expect(ayahsOnPage(562, 'madani1405')).toEqual(ayahsBetween(67001, 67012));
    expect(ayahsOnPage(563, 'madani1405')).toEqual(ayahsBetween(67013, 67026));
    expect(pageOfAyah(67020, 'madani1405')).toBe(563);
    expect(pageOfAyah(67001, 'madani1405')).toBe(562);
    expect(pageOfAyah(1001, 'madani1405')).toBe(1);
    expect(pageOfAyah(LAST_AYAH, 'madani1405')).toBe(604);
    expect(pageOfAyah(67000, 'madani1405')).toBe(0);
  });

  it('join ayahs that follow one another into runs, across a surah’s end too', () => {
    expect(ayahRuns([67013, 67001, 67002, 67030, 68001, 68002])).toEqual([
      { from: 67001, to: 67002 },
      { from: 67013, to: 67013 },
      { from: 67030, to: 68002 },
    ]);
  });

  it.each(EDITIONS)('cover every ayah of the Qur’an once, page after page, in %s', (edition) => {
    const all = ayahsOfPages(Array.from({ length: 604 }, (_, i) => i + 1), edition);
    expect(all).toHaveLength(6236);
    expect(all).toEqual(ayahsBetween(1001, LAST_AYAH));
  });

  it.each(EDITIONS)('agree with the bounds file on each page’s ayahs and their shares, in %s', (edition, bounds) => {
    const table = (shareTable as Record<string, number[][]>)[edition];
    for (let page = 1; page <= 604; page++) {
      const areas = areasFromBounds(bounds, page);
      expect([...areas.keys()]).toEqual(ayahsOnPage(page, edition));
      expect(table[page - 1]).toHaveLength(areas.size);
      expect(table[page - 1].reduce((n, x) => n + x, 0)).toBe(1000);
      const total = [...areas.values()].reduce((n, a) => n + a, 0);
      const shares = ayahSharesOnPage(page, edition);
      for (const [k, a] of areas) expect(Math.abs((shares.get(k) ?? 0) - a / total)).toBeLessThan(0.0011);
    }
  });

  it('measure Al-Mulk 13–20 as about six tenths of its page (ten of its fifteen lines)', () => {
    const shares = ayahSharesOnPage(563, 'madani1405');
    const part = ayahsBetween(67013, 67020).reduce((n, k) => n + (shares.get(k) ?? 0), 0);
    expect(part).toBeGreaterThan(0.58);
    expect(part).toBeLessThan(0.62);
  });
});
