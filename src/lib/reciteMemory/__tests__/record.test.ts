import { quranWords } from '../../recite/__fixtures__/quranWords';
import type { FinalResult, Mark } from '../../reciteLive/contract';
import { dismissMark, LIVE_IDLE, LiveState } from '../../reciteLive/state';
import { recordFromTake, sameTake, TakeContext } from '../fromTake';
import { fromStored, memoryId, newer, toStored, type ClearRecord, type TakeRecord } from '../record';

const words = quranWords();

const lookalike: Mark = {
  id: '31453:word:lookalike',
  w: 31453,
  ayah: [12, 88],
  kind: 'word',
  detail: 'lookalike',
  heard: 'ٱلْمُحْسِنِينَ',
  heardExact: true,
  t: [41.2, 42],
  sure: 'clear',
};
const slip: Mark = {
  id: '31443:harakat:',
  w: 31443,
  ayah: [12, 88],
  kind: 'harakat',
  heard: 'بِبِضَـٰعَةٌ',
  heardExact: true,
  slip: { expected: 'ٍ', heard: 'ٌ' },
  at: [8, 9],
  sure: 'clear',
};
const madd: Mark = { id: '31449:tajweed:madd_munfasil', w: 31449, ayah: [12, 88], kind: 'tajweed', rule: 'madd_munfasil', got: 2, expected: 4, sure: 'clear' };

function doneState(marks: Mark[], over: Partial<LiveState> = {}): LiveState {
  const final: FinalResult = { v: 2, take: 'take-1', from: 31413, to: 31600, secs: 102, marks, score: null, start: 31413 };
  return {
    ...LIVE_IDLE,
    status: 'done',
    take: 'take-1',
    start: 31413,
    cursor: 31458,
    saidUpTo: 31458,
    marks: Object.fromEntries(marks.map((m) => [m.id, m])),
    score: { reached: 46, mistakes: 2, tajweed: 1, unclear: 0, accuracy: 0.95 },
    final,
    ...over,
  };
}

const ctx = (over: Partial<TakeContext> = {}): TakeContext => ({
  id: 'rec1',
  createdAt: 1_763_200_000_000,
  rev: 1_763_200_100_000,
  day: '2026-11-15',
  level: 'strict',
  hidden: true,
  secs: 102.4,
  recordingId: 'recording-1',
  timeOf: (w) => (w === 31440 ? 20.25 : null),
  openWords: () => [31440, 31490],
  ...over,
});

describe('a take’s record', () => {
  it('keeps the marks, where it ran, the score by the page and when it passed words already marked', () => {
    const r = recordFromTake(doneState([lookalike, slip, madd]), words, ctx()) as TakeRecord;
    expect(r).toMatchObject({
      id: 'rec1',
      kind: 'take',
      take: 'take-1',
      day: '2026-11-15',
      level: 'strict',
      hidden: true,
      from: 31413,
      to: 31458,
      secs: 102,
      mistakes: 2,
      tajweed: 1,
      unclear: 0,
      recordingId: 'recording-1',
      passed: [{ w: 31440, t: 20.25 }],
    });
    expect(r.marks.map((m) => m.id)).toEqual([slip.id, madd.id, lookalike.id]);
    // Two mistakes on page 246's 124 words.
    expect(r.accuracy).toBeCloseTo(1 - 2 / 124, 5);
  });

  it('leaves out a mark called Not a mistake, and [RMEM-8] lists it apart so its summary can put it back later', () => {
    const state = dismissMark(doneState([lookalike, slip]), lookalike.id);
    const r = recordFromTake(state, words, ctx()) as TakeRecord;
    expect(r.marks.map((m) => m.id)).toEqual([slip.id]);
    expect(r.mistakes).toBe(1);
    expect(r.removed).toEqual([lookalike]);
  });

  it('[RMEM-8] keeps the words peeked, in order; none, and nothing removed, leave the fields out', () => {
    const r = recordFromTake(doneState([lookalike]), words, ctx({ peeked: new Set([31421, 31420]) })) as TakeRecord;
    expect(r.peeked).toEqual([31420, 31421]);
    const plain = recordFromTake(doneState([lookalike]), words, ctx({ peeked: new Set() })) as TakeRecord;
    expect('peeked' in plain).toBe(false);
    expect('removed' in plain).toBe(false);
  });

  it('is nothing before the final answer, or when the checker never found where the reciter started', () => {
    expect(recordFromTake({ ...doneState([lookalike]), status: 'checking' }, words, ctx())).toBeNull();
    const lost = doneState([], { start: null, anywhere: true, final: { v: 2, take: 't', from: 1, to: 2, secs: 3, marks: [], score: null, start: null } });
    expect(recordFromTake(lost, words, ctx())).toBeNull();
  });

  it('reaches as far as its furthest mark when the cursor stopped short', () => {
    const r = recordFromTake(doneState([lookalike], { cursor: 31440, saidUpTo: 31440 }), words, ctx()) as TakeRecord;
    expect(r.to).toBe(31453);
  });

  it('two versions that differ only by when they were made are the same take', () => {
    const a = recordFromTake(doneState([lookalike]), words, ctx()) as TakeRecord;
    const b = recordFromTake(doneState([lookalike]), words, ctx({ rev: a.rev + 5000 })) as TakeRecord;
    expect(sameTake(a, b)).toBe(true);
    expect(sameTake(a, { ...b, recordingId: null })).toBe(false);
  });
});

describe('a record on the account', () => {
  it('a take reads back exactly as written (marks flattened: Firestore keeps no arrays in arrays)', () => {
    const r = recordFromTake(doneState([lookalike, slip, madd]), words, ctx()) as TakeRecord;
    const stored = toStored(r);
    expect(JSON.stringify(stored)).not.toMatch(/"t":\[/);
    expect(fromStored(r.id, JSON.parse(JSON.stringify(stored)))).toEqual({ ...r, deleted: undefined });
  });

  it('a slip into a similar ayah keeps where it went, its ending and the other ayat (Recite insights)', () => {
    const into: Mark = { ...lookalike, id: '480:word:', w: 480, ayah: [2, 48], into: { w: 1900, ayah: [2, 123], also: [[3, 1], [4, 2]] } };
    const ending: Mark = { ...lookalike, id: '9000:word:', w: 9000, ayah: [113, 3], into: { w: 9020, ayah: [113, 5], ending: true } };
    const r = { ...(recordFromTake(doneState([lookalike]), words, ctx()) as TakeRecord), marks: [into, ending] };
    const stored = toStored(r);
    // Flat fields only: Firestore keeps no arrays in arrays.
    expect(JSON.stringify(stored)).not.toMatch(/\[\[/);
    const back = fromStored(r.id, JSON.parse(JSON.stringify(stored))) as TakeRecord;
    expect(back.marks).toEqual([into, ending]);
    // A record from before keeps its marks without one.
    expect((fromStored(r.id, toStored({ ...r, marks: [lookalike] })) as TakeRecord).marks[0].into).toBeUndefined();
  });

  it('[RECITE-11] an unfinished take reads back unfinished; a finished one’s document has no such field', () => {
    const r = recordFromTake(doneState([lookalike]), words, ctx()) as TakeRecord;
    expect('unfinished' in toStored(r)).toBe(false);
    const u = { ...r, unfinished: true };
    expect(toStored(u).unfinished).toBe(true);
    expect((fromStored(u.id, JSON.parse(JSON.stringify(toStored(u)))) as TakeRecord).unfinished).toBe(true);
  });

  it('[RMEM-8] the words peeked and the marks called Not a mistake read back; a take without them is written as before', () => {
    const r = recordFromTake(dismissMark(doneState([lookalike, slip]), lookalike.id), words, ctx({ peeked: new Set([31420]) })) as TakeRecord;
    const stored = toStored(r);
    expect(stored.peeked).toEqual([31420]);
    expect(JSON.stringify(stored.removed)).not.toMatch(/"t":\[/);
    const back = fromStored(r.id, JSON.parse(JSON.stringify(stored))) as TakeRecord;
    expect(back.peeked).toEqual([31420]);
    expect(back.removed).toEqual([lookalike]);
    expect(back.marks).toEqual([slip]);
    const plain = toStored({ ...r, peeked: undefined, removed: undefined });
    expect('peeked' in plain || 'removed' in plain).toBe(false);
    // Damaged lists drop what isn't a word or a mark, never the take.
    const damaged = fromStored(r.id, { ...JSON.parse(JSON.stringify(stored)), peeked: ['x', 31420.5, 31422], removed: [{ id: 'm' }] }) as TakeRecord;
    expect(damaged.peeked).toEqual([31422]);
    expect('removed' in damaged).toBe(false);
  });

  it('a word cleared by hand, and a forgotten take, read back', () => {
    const c: ClearRecord = { id: 'c1', kind: 'clear', createdAt: 5, rev: 6, day: '2026-11-15', w: 31453, group: 'word' };
    expect(fromStored('c1', toStored(c))).toEqual(c);
    const t = recordFromTake(doneState([]), words, ctx()) as TakeRecord;
    expect(fromStored(t.id, toStored({ ...t, deleted: true }))).toMatchObject({ deleted: true });
  });

  it('a document this app can’t read is left out', () => {
    expect(fromStored('x', null)).toBeNull();
    expect(fromStored('x', { kind: 'take', createdAt: 1, rev: 1, day: '2026-11-15' })).toBeNull();
    expect(fromStored('x', { kind: 'note', createdAt: 1, rev: 1, day: '2026-11-15' })).toBeNull();
  });

  it('the newer copy wins; a tie keeps the one held', () => {
    const c: ClearRecord = { id: 'c1', kind: 'clear', createdAt: 5, rev: 6, day: '2026-11-15', w: 1, group: 'word' };
    expect(newer(c, { ...c, rev: 7, deleted: true })).toMatchObject({ deleted: true });
    expect(newer(c, { ...c, rev: 5, deleted: true })).toBe(c);
    expect(newer(c, { ...c, deleted: true })).toBe(c);
    expect(newer(undefined, c)).toBe(c);
  });

  it('ids are 20 letters and digits', () => {
    expect(memoryId()).toMatch(/^[A-Za-z0-9]{20}$/);
  });
});
