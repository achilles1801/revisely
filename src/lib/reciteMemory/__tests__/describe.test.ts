import type { Mark } from '../../reciteLive/contract';
import { attemptWhat, clearLine, takeWhen, wrongCount } from '../describe';
import { wordMemories } from '../memory';
import type { TakeRecord } from '../record';

const W = 31453;
const at = (y: number, m: number, d: number, h = 19, min = 51) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 11, 15, 21, 0);

const mark = (extra: Partial<Mark> = {}): Mark => ({ id: `${W}:word:`, w: W, ayah: [12, 88], kind: 'word', heard: 'ٱلْمُحْسِنِينَ', sure: 'clear', ...extra });
const take = (id: string, when: number, day: string, marks: Mark[]): TakeRecord => ({
  id,
  kind: 'take',
  take: null,
  createdAt: when,
  rev: when,
  day,
  level: 'strict',
  hidden: false,
  from: 31413,
  to: 31500,
  secs: 60,
  mistakes: marks.length,
  tajweed: 0,
  unclear: 0,
  accuracy: 1,
  marks,
  passed: [],
  recordingId: null,
});

describe('the history card’s words', () => {
  it('when a take was', () => {
    expect(takeWhen(at(2026, 11, 15), NOW)).toBe('Today, 7:51 PM');
    expect(takeWhen(at(2026, 11, 14, 9, 5), NOW)).toBe('Yesterday, 9:05 AM');
    expect(takeWhen(at(2026, 11, 13), NOW)).toBe('Fri 13 Nov');
    expect(takeWhen(at(2026, 11, 13, 20, 12), NOW, true)).toBe('Fri 13 Nov, 8:12 PM');
    expect(takeWhen(at(2025, 12, 31), NOW)).toBe('31 Dec 2025');
    expect(takeWhen(at(2026, 11, 15, 0, 5), NOW)).toBe('Today, 12:05 AM');
  });

  it('what each try was, in words', () => {
    const tries = wordMemories([
      take('a', at(2026, 11, 10), '2026-11-10', [mark()]),
      take('b', at(2026, 11, 11), '2026-11-11', [mark({ kind: 'skipped', heard: undefined, id: `${W}:skipped:` })]),
      take('c', at(2026, 11, 12), '2026-11-12', []),
    ]).get(`${W}|word`)!.attempts;
    expect(tries.map(attemptWhat)).toEqual([
      { right: false, text: 'Wrong · said', heard: 'ٱلْمُحْسِنِينَ' },
      { right: false, text: 'Wrong · skipped', heard: null },
      { right: true, text: 'Right', heard: null },
    ]);
    const madd = mark({ kind: 'tajweed', rule: 'madd_munfasil', got: 2, expected: 4, heard: undefined, id: `${W}:tajweed:madd_munfasil` });
    const t = wordMemories([take('d', at(2026, 11, 10), '2026-11-10', [madd])]).get(`${W}|tajweed`)!.attempts[0];
    expect(attemptWhat(t).text).toBe('Wrong · held about 2 counts');
  });

  it('how often it went wrong, and where the clear rule stands', () => {
    const once = wordMemories([take('a', at(2026, 11, 13), '2026-11-13', [mark()])]).get(`${W}|word`)!;
    expect(wrongCount(once)).toBe('wrong in your 1 take');
    expect(clearLine(once, '2026-11-15')).toBe('Say it right on 2 different days to clear it.');
    const rightToday = wordMemories([take('a', at(2026, 11, 13), '2026-11-13', [mark()]), take('b', at(2026, 11, 15), '2026-11-15', [])]).get(`${W}|word`)!;
    expect(wrongCount(rightToday)).toBe('wrong in 1 of 2 takes');
    expect(clearLine(rightToday, '2026-11-15')).toBe('Right today. Right again on another day clears it.');
    expect(clearLine(rightToday, '2026-11-16')).toBe('Right once. Right again on another day clears it.');
    const cleared = wordMemories([
      take('a', at(2026, 11, 13), '2026-11-13', [mark()]),
      take('b', at(2026, 11, 14), '2026-11-14', []),
      take('c', at(2026, 11, 15), '2026-11-15', []),
    ]).get(`${W}|word`)!;
    expect(clearLine(cleared, '2026-11-15')).toBe('Cleared: said right on 2 different days.');
  });
});
