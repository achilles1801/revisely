// A take's passage history (RMEM-7): the summary's "This passage: your last 3 takes".
import { historyRows, HISTORY_MAX, passageHistory, samePassage, takeDay } from '../history';
import type { MemoryRecord, TakeRecord } from '../record';

const words = require('../../recite/__fixtures__/quranWords').quranWords();
const at = (d: number, h = 20) => new Date(2026, 10, d, h, 0).getTime();
const NOW = at(22, 21);
const take = (id: string, d: number, from: number, to: number, over: Partial<TakeRecord> = {}): TakeRecord => ({
  id,
  kind: 'take',
  take: null,
  createdAt: at(d),
  rev: 1,
  day: `2026-11-${String(d).padStart(2, '0')}`,
  level: 'words',
  hidden: false,
  from,
  to,
  secs: 60,
  mistakes: 0,
  tajweed: 0,
  unclear: 0,
  accuracy: 1,
  marks: [],
  passed: [],
  recordingId: null,
  ...over,
});

describe("a take's passage history", () => {
  const now = take('now', 22, 1000, 1040);

  it('[RMEM-7] lists the takes of the same stretch before this one, newest first, at most five', () => {
    const records: MemoryRecord[] = [
      take('a', 10, 1000, 1040),
      take('b', 12, 1000, 1040),
      take('c', 14, 1005, 1045),
      take('d', 15, 1000, 1040),
      take('e', 17, 995, 1035),
      take('f', 19, 1000, 1040),
      take('g', 21, 1000, 1040),
      now,
    ];
    expect(HISTORY_MAX).toBe(5);
    expect(passageHistory(records, now).map((t) => t.id)).toEqual(['g', 'f', 'e', 'd', 'c']);
  });

  it('[RMEM-7] leaves out other stretches, a much longer or shorter take, forgotten ones, unfinished ones and later ones', () => {
    const records: MemoryRecord[] = [
      take('whole-page', 18, 1000, 1124),
      take('first-lines', 18, 1000, 1012),
      take('elsewhere', 18, 2000, 2040),
      take('gone', 18, 1000, 1040, { deleted: true }),
      take('cut', 18, 1000, 1040, { unfinished: true }),
      take('after', 23, 1000, 1040),
      { id: 'clear', kind: 'clear', createdAt: at(18), rev: 1, day: '2026-11-18', w: 1010, group: 'word' },
      take('kept', 18, 1010, 1050),
    ];
    expect(passageHistory(records, now).map((t) => t.id)).toEqual(['kept']);
    expect(passageHistory([], now)).toEqual([]);
  });

  it('a stretch is the same when the two share at least half of each', () => {
    expect(samePassage({ from: 0, to: 9 }, { from: 5, to: 14 })).toBe(true);
    expect(samePassage({ from: 0, to: 9 }, { from: 6, to: 15 })).toBe(false);
    expect(samePassage({ from: 0, to: 9 }, { from: 0, to: 19 })).toBe(true);
    expect(samePassage({ from: 0, to: 9 }, { from: 0, to: 20 })).toBe(false);
    expect(samePassage({ from: 0, to: 9 }, { from: 10, to: 19 })).toBe(false);
  });

  it('says when as a day, never a date', () => {
    expect(takeDay(at(22, 8), NOW)).toBe('Earlier today');
    expect(takeDay(at(21), NOW)).toBe('Yesterday');
    expect(takeDay(at(20), NOW)).toBe('Friday');
    expect(takeDay(at(16), NOW)).toBe('Monday');
    expect(takeDay(at(15), NOW)).toBe('7 days ago');
    expect(takeDay(at(9), NOW)).toBe('13 days ago');
    expect(takeDay(at(8), NOW)).toBe('2 weeks ago');
    expect(takeDay(new Date(2026, 9, 1, 20).getTime(), NOW)).toBe('7 weeks ago');
    expect(takeDay(new Date(2026, 8, 1, 20).getTime(), NOW)).toBe('2 months ago');
    expect(takeDay(new Date(2025, 10, 1, 20).getTime(), NOW)).toBe('12 months ago');
  });

  it('[RMEM-7] a row: its day, score and mistakes as the summary counts them; its ayat only when they aren’t this take’s', () => {
    const [a80] = words.verseRange(12, 80);
    const [a87] = words.verseRange(12, 87);
    const a90end = words.verseRange(12, 90)[1] - 1;
    const a98end = words.verseRange(12, 98)[1] - 1;
    const current = { from: a87, to: a90end };
    const rows = historyRows(
      words,
      current,
      [
        take('same', 21, a87, a90end, { accuracy: 0.981, mistakes: 2, tajweed: 3, unclear: 1 }),
        take('wider', 20, a80, a98end, { accuracy: 0.9, mistakes: 6, hidden: true }),
        take('clean', 16, a87, a90end, { accuracy: 1 }),
      ],
      NOW,
    );
    expect(rows.map((r) => [r.when, r.score, r.level, r.detail])).toEqual([
      ['Yesterday', '98.1%', 'warn', '2 mistakes'],
      ['Friday', '90.0%', 'bad', 'Ayahs 80–98 · 6 mistakes · page hidden'],
      ['Monday', '100%', 'good', 'No mistakes'],
    ]);
    expect(rows[0].label).toBe('Yesterday: 98.1%, 2 mistakes. Show it on the page');
    expect(rows[1].label).toBe('Friday: 90.0%, Ayahs 80 to 98, 6 mistakes, page hidden. Show it on the page');
  });

  it('a take that ran into another surah is named surah first', () => {
    const [b1] = words.verseRange(13, 1);
    const b2end = words.verseRange(13, 2)[1] - 1;
    const [y110] = words.verseRange(12, 110);
    const [row] = historyRows(words, { from: b1, to: b2end }, [take('x', 21, y110, b2end)], NOW);
    expect(row.detail).toMatch(/^Yusuf.*Ar.Ra.d/);
  });
});
