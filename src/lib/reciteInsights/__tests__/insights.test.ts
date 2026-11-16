import type { Mark } from '../../reciteLive/contract';
import type { ClearRecord, MemoryRecord, TakeRecord } from '../../reciteMemory/record';
import {
  countMarks,
  meanScore,
  mistakeKindOf,
  passageRecitation,
  recitationInsights,
  similarSlips,
  slippingPassages,
  WINDOW_DAYS,
  weekScores,
} from '../insights';
import { wordMemories } from '../../reciteMemory/memory';

// Words of Al-Kahf 22–23 and Al-Baqarah 48 (the app's word numbers are only identities here).
const KAHF22 = 21000;
const KAHF23 = 21040;
const BAQ48 = 500;
const TODAY = '2026-11-16';

const day = (offset: number) => {
  const d = new Date(Date.UTC(2026, 10, 16 + offset));
  return d.toISOString().slice(0, 10);
};

const mark = (w: number, ayah: [number, number], kind: Mark['kind'], extra: Partial<Mark> = {}): Mark => ({
  id: `${w}:${kind}:${extra.detail ?? extra.rule ?? ''}`,
  w,
  ayah,
  kind,
  sure: 'clear',
  ...extra,
});

let n = 0;
function take(offset: number, marks: Mark[] = [], over: Partial<TakeRecord> = {}): TakeRecord {
  n += 1;
  const createdAt = Date.UTC(2026, 10, 16 + offset, 19) + n * 60_000;
  return {
    id: `t${n}`,
    kind: 'take',
    take: null,
    createdAt,
    rev: createdAt,
    day: day(offset),
    level: 'words',
    hidden: false,
    from: 20990,
    to: 21099,
    secs: 120,
    mistakes: marks.length,
    tajweed: 0,
    unclear: 0,
    accuracy: 0.98,
    marks,
    passed: [],
    recordingId: null,
    ...over,
  };
}

const clear = (offset: number, w: number, group: ClearRecord['group']): ClearRecord => {
  n += 1;
  const createdAt = Date.UTC(2026, 10, 16 + offset, 21) + n * 60_000;
  return { id: `c${n}`, kind: 'clear', createdAt, rev: createdAt, day: day(offset), w, group };
};

describe('Recite insights: what counts as a mistake', () => {
  it('counts words, skips, extras and sure slips; never Not clear or tajweed', () => {
    expect(mistakeKindOf(mark(1, [1, 1], 'word'))).toBe('wrong');
    expect(mistakeKindOf(mark(1, [1, 1], 'skipped'))).toBe('skipped');
    expect(mistakeKindOf(mark(1, [1, 1], 'added'))).toBe('added');
    expect(mistakeKindOf(mark(1, [1, 1], 'harakat'))).toBe('harakat');
    expect(mistakeKindOf(mark(1, [1, 1], 'letter'))).toBe('letter');
    // Not clear: a haraka or letter heard only past the normal bar.
    expect(mistakeKindOf(mark(1, [1, 1], 'harakat', { sure: 'likely' }))).toBeNull();
    expect(mistakeKindOf(mark(1, [1, 1], 'letter', { sure: 'likely' }))).toBeNull();
    expect(mistakeKindOf(mark(1, [1, 1], 'tajweed', { rule: 'ghunnah' }))).toBeNull();
    // A wrong word heard only "likely" is still a wrong word (the contract counts word marks at both bars).
    expect(mistakeKindOf(mark(1, [1, 1], 'word', { sure: 'likely' }))).toBe('wrong');
  });

  it('counts Not clear and tajweed apart, and tajweed only from Strict takes', () => {
    const words = take(0, [mark(KAHF22, [18, 22], 'word'), mark(KAHF22 + 1, [18, 22], 'harakat', { sure: 'likely' }), mark(KAHF22 + 2, [18, 22], 'tajweed')]);
    const strict = take(0, [mark(KAHF23, [18, 23], 'tajweed', { rule: 'madd_munfasil' })], { level: 'strict' });
    expect(countMarks([words, strict])).toEqual({
      kinds: { wrong: 1, skipped: 0, added: 0, harakat: 0, letter: 0 },
      mistakes: 1,
      unclear: 1,
      tajweed: 1,
    });
  });
});

describe('Recite insights: the score', () => {
  it('weights each take’s score by the words it recited, so it lies between the rows’ scores', () => {
    const short = take(0, [], { from: 1, to: 10, accuracy: 0.9 });
    const long = take(0, [], { from: 1, to: 90, accuracy: 1 });
    expect(meanScore([short, long])).toBeCloseTo(0.99, 5);
    expect(meanScore([])).toBeNull();
  });

  it('draws the last week ending today, oldest first', () => {
    const weeks = weekScores([take(0, [], { accuracy: 0.99 }), take(-7, [], { accuracy: 0.97 }), take(-60)], TODAY, 3);
    expect(weeks.map((w) => w.to)).toEqual([day(-14), day(-7), TODAY]);
    expect(weeks.map((w) => w.takes)).toEqual([0, 1, 1]);
    expect(weeks[0].score).toBeNull();
    expect(weeks[2].score).toBeCloseTo(0.99, 5);
  });
});

describe('Recite insights: passages that keep slipping', () => {
  it('gathers words still marked into runs of neighbouring ayat, the most slipped first', () => {
    const records: MemoryRecord[] = [
      take(-6, [mark(KAHF22, [18, 22], 'word'), mark(KAHF23, [18, 23], 'harakat')]),
      take(-4, [mark(KAHF22, [18, 22], 'word')]),
      // Al-Kahf 23's slip again (right on -4 alone isn't enough to clear it).
      take(-2, [mark(KAHF22 + 5, [18, 22], 'skipped'), mark(KAHF23, [18, 23], 'harakat')]),
      take(-1, [mark(BAQ48, [2, 48], 'word')], { from: 400, to: 600 }),
    ];
    const slipping = slippingPassages(wordMemories(records));
    expect(slipping).toHaveLength(2);
    expect(slipping[0]).toMatchObject({ sura: 18, from: 22, to: 23, wordMistakes: 2, wrong: 3, tries: 3 });
    expect(slipping[0].words.map((w) => w.w)).toEqual([KAHF22, KAHF22 + 5, KAHF23]);
    expect(slipping[0].words.map((w) => w.group)).toEqual(['word', 'word', 'slip']);
    expect(slipping[1]).toMatchObject({ sura: 2, from: 48, to: 48, wrong: 1, tries: 1, lastDay: day(-1) });
  });

  it('leaves out words cleared, Not clear and tajweed notes', () => {
    const records: MemoryRecord[] = [
      take(-5, [mark(KAHF22, [18, 22], 'word'), mark(KAHF23, [18, 23], 'harakat', { sure: 'likely' }), mark(KAHF23 + 1, [18, 23], 'tajweed')], { level: 'strict' }),
      // Right on two different days: cleared.
      take(-3, [], { level: 'strict' }),
      take(-2, [mark(KAHF23 + 1, [18, 23], 'tajweed')], { level: 'strict' }),
    ];
    expect(slippingPassages(wordMemories(records))).toEqual([]);
    const ins = recitationInsights(records, TODAY);
    expect(ins.stillMarked).toBe(0);
    expect(ins.stillMarkedTajweed).toBe(1);
  });

  it('keeps passages in different surahs apart, even when their ayah numbers touch', () => {
    const records: MemoryRecord[] = [take(-1, [mark(100, [1, 7], 'word'), mark(101, [2, 1], 'word')], { from: 90, to: 110 })];
    expect(slippingPassages(wordMemories(records)).map((p) => [p.sura, p.from])).toEqual([
      [1, 7],
      [2, 1],
    ]);
  });
});

describe('Recite insights: similar ayahs', () => {
  it('groups slips into a similar ayah by where they went, and endings apart', () => {
    const into = (ayah: [number, number], extra = {}) => ({ w: 1900, ayah, ...extra });
    const takes = [
      take(-6, [mark(BAQ48, [2, 48], 'word', { into: into([2, 123]) })]),
      take(-2, [mark(BAQ48, [2, 48], 'word', { into: into([2, 123], { also: [[3, 1]] as [number, number][] }) })]),
      take(-1, [mark(9000, [113, 3], 'word', { into: into([113, 5], { ending: true as const }) })]),
    ];
    expect(similarSlips(takes)).toEqual([
      { from: [2, 48], into: [2, 123], ending: false, times: 2, lastDay: day(-2), also: 1 },
      { from: [113, 3], into: [113, 5], ending: true, times: 1, lastDay: day(-1), also: 0 },
    ]);
  });
});

describe('Recite insights: the window', () => {
  it('counts the last 4 weeks, compares with the 4 before, and names words that cleared in it', () => {
    const records: MemoryRecord[] = [
      take(-40, [mark(KAHF22, [18, 22], 'word')], { accuracy: 0.95 }),
      take(-10, [], { accuracy: 0.99, secs: 60 }),
      take(-3, [], { accuracy: 0.99, secs: 90 }),
      take(-3, [mark(BAQ48, [2, 48], 'word')], { from: 400, to: 600, accuracy: 0.97 }),
      clear(-1, BAQ48, 'word'),
    ];
    const ins = recitationInsights(records, TODAY);
    expect(ins.from).toBe(day(-(WINDOW_DAYS - 1)));
    expect(ins).toMatchObject({ takes: 3, days: 2, secs: 270, mistakes: 1, earlierScore: 0.95 });
    // Al-Kahf 22's word cleared by the two right days (-10 and -3); Al-Baqarah 48's by Clear now.
    expect(ins.cleared).toEqual([
      { w: BAQ48, group: 'word', day: day(-1), byHand: true },
      { w: KAHF22, group: 'word', day: day(-3), byHand: false },
    ]);
    expect(ins.slipping).toEqual([]);
    expect(ins.last?.day).toBe(day(-3));
  });

  it('ignores forgotten takes', () => {
    const records: MemoryRecord[] = [take(-1, [mark(KAHF22, [18, 22], 'word')], { deleted: true })];
    const ins = recitationInsights(records, TODAY);
    expect(ins.takes).toBe(0);
    expect(ins.slipping).toEqual([]);
    expect(ins.last).toBeNull();
  });
});

describe('Recite insights: a passage', () => {
  it('says what Recite found in some words: takes there, the latest, words still marked, similar-ayah slips', () => {
    const records: MemoryRecord[] = [
      take(-5, [mark(BAQ48, [2, 48], 'word', { into: { w: 1900, ayah: [2, 123] } })], { from: 400, to: 600 }),
      take(-1, [mark(KAHF22, [18, 22], 'word')]),
    ];
    const baqarah = passageRecitation(records, 1, 6000, TODAY);
    expect(baqarah.takes).toBe(1);
    expect(baqarah.last?.from).toBe(400);
    expect(baqarah.stillMarked.map((w) => w.w)).toEqual([BAQ48]);
    expect(baqarah.similar).toHaveLength(1);
    const elsewhere = passageRecitation(records, 30000, 31000, TODAY);
    expect(elsewhere).toEqual({ takes: 0, last: null, stillMarked: [], similar: [] });
  });
});
