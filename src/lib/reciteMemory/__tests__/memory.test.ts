import type { Mark } from '../../reciteLive/contract';
import { CLEAR_AFTER, clearedBy, memoryOfWord, openInRange, openWordsBetween, wordMemories } from '../memory';
import type { ClearRecord, TakeRecord } from '../record';

const W = 31453; // ٱلْمُتَصَدِّقِينَ, Yusuf 88
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 2, 21);

const wrongWord = (w = W, extra: Partial<Mark> = {}): Mark => ({
  id: `${w}:word:lookalike`,
  w,
  ayah: [12, 88],
  kind: 'word',
  detail: 'lookalike',
  heard: 'ٱلْمُحْسِنِينَ',
  sure: 'clear',
  t: [40, 41],
  ...extra,
});

let n = 0;
function take(dayIndex: number, marks: Mark[] = [], over: Partial<TakeRecord> = {}): TakeRecord {
  const createdAt = T0 + dayIndex * DAY + (n++ % 50) * 60_000;
  return {
    id: `t${n}`,
    kind: 'take',
    take: null,
    createdAt,
    rev: createdAt,
    day: new Date(T0 + dayIndex * DAY).toISOString().slice(0, 10),
    level: 'words',
    hidden: false,
    from: 31413,
    to: 31500,
    secs: 100,
    mistakes: marks.length,
    tajweed: 0,
    unclear: 0,
    accuracy: 1,
    marks,
    passed: [],
    recordingId: null,
    ...over,
  };
}

const memoryOf = (records: Array<TakeRecord | ClearRecord>, w = W) => memoryOfWord(wordMemories(records), w);

describe('Recite memory: the clear rule', () => {
  it('a word missed once stays marked until said right on two different days', () => {
    expect(CLEAR_AFTER).toBe(2);
    const missed = take(0, [wrongWord()]);
    expect(memoryOf([missed])).toMatchObject({ open: true, needed: 2, rightDays: 0 });
    const rightSameDay = take(0);
    const rightAgainSameDay = take(0);
    expect(memoryOf([missed, rightSameDay, rightAgainSameDay])).toMatchObject({ open: true, needed: 1, rightDays: 1 });
    const nextDay = take(1);
    expect(memoryOf([missed, rightSameDay, rightAgainSameDay, nextDay])).toMatchObject({ open: false, needed: 0 });
  });

  it('wrong again starts the count over', () => {
    const records = [take(0, [wrongWord()]), take(1), take(2, [wrongWord()]), take(3)];
    expect(memoryOf(records)).toMatchObject({ open: true, needed: 1 });
    expect(memoryOf([...records, take(4)])).toMatchObject({ open: false });
  });

  it('only takes that reached the word count as tries', () => {
    const missed = take(0, [wrongWord()]);
    const elsewhere = [take(1, [], { from: 31413, to: 31440 }), take(2, [], { from: 31460, to: 31500 })];
    expect(memoryOf([missed, ...elsewhere])).toMatchObject({ open: true, needed: 2 });
    expect(memoryOf([missed, ...elsewhere])?.attempts).toHaveLength(1);
  });

  it('“Not clear” is never remembered, and isn’t a try at the word’s harakat', () => {
    const unclear: Mark = { id: `${W}:harakat:`, w: W, ayah: [12, 88], kind: 'harakat', sure: 'likely', slip: { expected: 'ِ', heard: 'ُ' } };
    expect(memoryOf([take(0, [unclear])])).toBeNull();
    const slip: Mark = { ...unclear, sure: 'clear' };
    const records = [take(0, [slip]), take(1, [unclear]), take(2)];
    const m = memoryOf(records);
    expect(m).toMatchObject({ group: 'slip', open: true, needed: 1 });
    expect(m?.attempts.map((a) => a.right)).toEqual([false, true]);
  });

  it('a tajweed note is cleared only by takes at Strict', () => {
    const madd: Mark = { id: `${W}:tajweed:madd_munfasil`, w: W, ayah: [12, 88], kind: 'tajweed', rule: 'madd_munfasil', got: 2, expected: 4, sure: 'clear' };
    const strict = { level: 'strict' as const };
    const records = [take(0, [madd], strict), take(1), take(2)];
    expect(memoryOf(records)).toMatchObject({ group: 'tajweed', open: true, needed: 2 });
    expect(memoryOf([...records, take(3, [], strict), take(4, [], strict)])).toMatchObject({ open: false });
  });

  it('Clear now clears it at once, and a later mistake marks it again', () => {
    const missed = take(0, [wrongWord()]);
    const cleared: ClearRecord = { id: 'c1', kind: 'clear', createdAt: missed.createdAt + 1000, rev: 1, day: missed.day, w: W, group: 'word' };
    expect(memoryOf([missed, cleared])).toMatchObject({ open: false, clearedByHand: true });
    expect(memoryOf([missed, cleared, take(1, [wrongWord()])])).toMatchObject({ open: true, clearedByHand: false });
  });

  it('a forgotten take is as if it never happened', () => {
    const missed = take(0, [wrongWord()], { deleted: true });
    expect(memoryOf([missed])).toBeNull();
  });

  it('an added word is remembered on the word before it; a skipped word on itself', () => {
    const added: Mark = { id: '31439:added:', w: 31439, ayah: [12, 88], kind: 'added', heard: 'وَ', sure: 'clear' };
    const skipped: Mark = { id: '31440:skipped:', w: 31440, ayah: [12, 88], kind: 'skipped', sure: 'clear' };
    const memories = wordMemories([take(0, [added, skipped])]);
    expect(openInRange(memories, 31413, 31500).map((m) => [m.w, m.group])).toEqual([
      [31439, 'word'],
      [31440, 'word'],
    ]);
  });

  it('the page shows one mark a word, its most severe group', () => {
    const slip: Mark = { id: `${W}:harakat:`, w: W, ayah: [12, 88], kind: 'harakat', sure: 'clear' };
    const memories = wordMemories([take(0, [slip, wrongWord()])]);
    expect(openInRange(memories, W, W + 1).map((m) => m.group)).toEqual(['word']);
  });

  it('a take’s summary names the words it cleared', () => {
    const missed = take(0, [wrongWord()]);
    const first = take(1);
    const second = take(2);
    const records = [missed, first, second];
    expect(clearedBy(records, first)).toEqual([]);
    expect(clearedBy(records, second).map((m) => m.w)).toEqual([W]);
  });

  it('a right try plays from when the take reached the word (`passed`)', () => {
    const records = [take(0, [wrongWord()]), take(1, [], { passed: [{ w: W, t: 12.5 }] })];
    expect(memoryOf(records)?.attempts.map((a) => a.t)).toEqual([40, 12.5]);
    expect(openWordsBetween(records, 31413, 31500)).toEqual([W]);
  });
});
