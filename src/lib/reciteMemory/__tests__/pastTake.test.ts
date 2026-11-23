import { quranWords } from '../../recite/__fixtures__/quranWords';
import type { Mark } from '../../reciteLive/contract';
import { pastMemory, pastScore, pastWhen, wasChecked, withMarkBack, withoutMark } from '../pastTake';
import type { TakeRecord } from '../record';

// A finished take's summary opened again from its record (RMEM-8, Revisely Dev).

const words = quranWords();

const lookalike: Mark = { id: '31453:word:lookalike', w: 31453, ayah: [12, 88], kind: 'word', heard: 'ٱلْمُحْسِنِينَ', heardExact: true, t: [41.2, 42], sure: 'clear' };
const unclear: Mark = { id: '31443:harakat:', w: 31443, ayah: [12, 88], kind: 'harakat', sure: 'likely' };
const madd: Mark = { id: '31449:tajweed:madd_munfasil', w: 31449, ayah: [12, 88], kind: 'tajweed', rule: 'madd_munfasil', got: 2, expected: 4, sure: 'clear' };

// Sun 15 Nov 2026, 7:51 PM (local) and the Friday before.
const SUNDAY = new Date(2026, 10, 15, 19, 51).getTime();
const FRIDAY = new Date(2026, 10, 13, 20, 12).getTime();

function take(over: Partial<TakeRecord> = {}): TakeRecord {
  return {
    id: 'take2',
    kind: 'take',
    take: 'checker-2',
    createdAt: SUNDAY,
    rev: SUNDAY,
    day: '2026-11-15',
    level: 'strict',
    hidden: false,
    from: 31413,
    to: 31458,
    secs: 102,
    mistakes: 1,
    tajweed: 1,
    unclear: 1,
    accuracy: 1 - 1 / 124,
    marks: [unclear, madd, lookalike],
    passed: [],
    recordingId: null,
    ...over,
  };
}

describe('[RMEM-8] a past take’s summary, from its record', () => {
  it('its score by the page, and none for a take never checked (RECITE-12)', () => {
    expect(pastScore(take())).toEqual({ text: '99.1%', level: 'good' });
    const never = take({ unfinished: true, take: null, marks: [] });
    expect(wasChecked(never)).toBe(false);
    expect(pastScore(never)).toBeNull();
    // Unfinished but checked: it has its score.
    expect(pastScore(take({ unfinished: true }))).not.toBeNull();
  });

  it('says when it was, and page hidden when it was', () => {
    const later = new Date(2026, 10, 16, 9, 0).getTime();
    expect(pastWhen(take(), later)).toBe('Yesterday, 7:51 PM');
    expect(pastWhen(take({ hidden: true }), SUNDAY)).toBe('Today, 7:51 PM · page hidden');
  });

  it('its trend as it stood then: a later take of the passage isn’t its progress', () => {
    const friday = take({ id: 'take1', createdAt: FRIDAY, rev: FRIDAY, day: '2026-11-13', marks: [lookalike, { ...lookalike, id: 'x', w: 31450 }], mistakes: 2, accuracy: 1 - 2 / 124 });
    const monday = take({ id: 'take3', createdAt: SUNDAY + 86_400_000, rev: SUNDAY + 86_400_000, day: '2026-11-16', marks: [], mistakes: 0, accuracy: 1 });
    const m = pastMemory([friday, take(), monday], take(), words, SUNDAY + 2 * 86_400_000, true);
    expect(m.trend).toEqual([friday.accuracy, take().accuracy]);
    expect(m.line).toBe('Up from 98.3% on Fri 13 Nov · 2 takes');
    // The first take of a passage has no line.
    expect(pastMemory([friday, take()], friday, words, SUNDAY, true).line).toBeNull();
  });

  it('Not a mistake moves the mark apart, with its counts and score; Put back undoes exactly that', () => {
    const t = take();
    const gone = withoutMark(t, lookalike.id, words, SUNDAY + 1) as TakeRecord;
    expect(gone.marks.map((m) => m.id)).toEqual([unclear.id, madd.id]);
    expect(gone.removed).toEqual([lookalike]);
    expect(gone).toMatchObject({ mistakes: 0, tajweed: 1, unclear: 1, accuracy: 1, rev: SUNDAY + 1 });
    const back = withMarkBack(gone, lookalike.id, words, SUNDAY + 2) as TakeRecord;
    expect(back.marks).toEqual(t.marks);
    expect('removed' in back).toBe(false);
    expect(back).toMatchObject({ mistakes: 1, tajweed: 1, unclear: 1, rev: SUNDAY + 2 });
    expect(back.accuracy).toBeCloseTo(t.accuracy, 10);
  });

  it('a Not clear mark and a tajweed note never count as mistakes, either way', () => {
    const noUnclear = withoutMark(take(), unclear.id, words, 1) as TakeRecord;
    expect(noUnclear).toMatchObject({ mistakes: 1, unclear: 0, tajweed: 1 });
    const noMadd = withoutMark(noUnclear, madd.id, words, 2) as TakeRecord;
    expect(noMadd).toMatchObject({ mistakes: 1, unclear: 0, tajweed: 0 });
    expect(noMadd.removed?.map((m) => m.id)).toEqual([unclear.id, madd.id]);
    expect(withMarkBack(noMadd, unclear.id, words, 3)).toMatchObject({ mistakes: 1, unclear: 1, tajweed: 0, removed: [madd] });
  });

  it('a mark the take doesn’t have, or one not listed apart, changes nothing', () => {
    expect(withoutMark(take(), 'nope', words, 1)).toBeNull();
    expect(withMarkBack(take(), lookalike.id, words, 1)).toBeNull();
  });
});
