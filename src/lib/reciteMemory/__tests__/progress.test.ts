import { passageTakes, progressLine } from '../progress';
import type { TakeRecord } from '../record';

const at = (d: number, h = 20) => new Date(2026, 10, d, h, 0).getTime();
const NOW = at(15, 21);
const take = (id: string, d: number, from: number, to: number, accuracy: number, over: Partial<TakeRecord> = {}): TakeRecord => ({
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
  accuracy,
  marks: [],
  passed: [],
  recordingId: null,
  ...over,
});

describe("a passage's progress", () => {
  it('counts the takes covering at least half of the passage, oldest first, forgotten ones left out', () => {
    const records = [
      take('whole-page', 9, 1000, 1124, 0.97),
      take('same', 2, 1000, 1040, 0.95),
      take('first-third', 5, 1000, 1013, 0.99),
      take('half', 11, 1020, 1060, 0.98),
      take('elsewhere', 12, 2000, 2040, 0.9),
      take('gone', 13, 1000, 1040, 0.5, { deleted: true }),
    ];
    expect(passageTakes(records, 1000, 1040).map((t) => t.id)).toEqual(['same', 'whole-page', 'half']);
  });

  it('[RECITE-11] a take kept without its final answer is no point on the progress: its end wasn’t checked', () => {
    const records = [take('a', 2, 1000, 1040, 0.95), take('cut', 3, 1000, 1040, 0.6, { unfinished: true }), take('b', 4, 1000, 1040, 0.97)];
    expect(passageTakes(records, 1000, 1040).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('says how it went: up, down or the same, since the first take', () => {
    expect(progressLine([take('a', 2, 1, 9, 0.951)], NOW)).toBeNull();
    expect(progressLine([take('a', 2, 1, 9, 0.951), take('b', 15, 1, 9, 0.991)], NOW)).toBe('Up from 95.1% on Mon 2 Nov · 2 takes');
    expect(progressLine([take('a', 14, 1, 9, 0.983), take('b', 15, 1, 9, 0.975)], NOW)).toBe('Down from 98.3% yesterday · 2 takes');
    expect(progressLine([take('a', 15, 1, 9, 1, { createdAt: at(15, 8) }), take('b', 15, 1, 9, 1)], NOW)).toBe('The same as earlier today · 2 takes');
  });
});
