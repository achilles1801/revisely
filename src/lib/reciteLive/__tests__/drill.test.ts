import { quranWords } from '../../recite/__fixtures__/quranWords';
import type { Mark } from '../contract';
import type { TakeRecord } from '../../reciteMemory/record';
import { drillRange, lastWordOf, openDrill } from '../drill';

const words = quranWords();
const at = (s: number, a: number, over: Partial<Mark> = {}): Mark => ({
  id: `${s}:${a}:${over.kind ?? 'word'}`,
  w: words.verseFirstWord(s, a),
  ayah: [s, a],
  kind: 'word',
  sure: 'clear',
  ...over,
});

describe('Recite the mistakes again: the stretch (Majd, Nov 15 2026)', () => {
  it('from the ayah before the first mistake’s to the last mistake’s ayah, in whatever order they came', () => {
    expect(drillRange([at(27, 30), at(27, 24), at(27, 27, { kind: 'skipped' })])).toEqual({ from: [27, 23], to: [27, 30] });
  });

  it('one mistake: that ayah and the one before', () => {
    expect(drillRange([at(27, 25, { kind: 'harakat' })])).toEqual({ from: [27, 24], to: [27, 25] });
  });

  it('a mistake in a surah’s first ayah starts there (never in the surah before)', () => {
    expect(drillRange([at(28, 1), at(28, 3)])).toEqual({ from: [28, 1], to: [28, 3] });
  });

  it('a take that ran into the next surah: from the first surah to the next', () => {
    expect(drillRange([at(27, 92), at(28, 2)])).toEqual({ from: [27, 91], to: [28, 2] });
  });

  it('“not clear” marks are worth saying again; tajweed notes alone aren’t a reason', () => {
    expect(drillRange([at(27, 25, { kind: 'letter', sure: 'likely' })])).toEqual({ from: [27, 24], to: [27, 25] });
    expect(drillRange([at(27, 25, { kind: 'tajweed', rule: 'qalqalah' })])).toBeNull();
    expect(drillRange([])).toBeNull();
  });

  it('it stops by itself at the last ayah’s last word', () => {
    const range = { from: [27, 22] as [number, number], to: [27, 23] as [number, number] };
    expect(lastWordOf(words, range)).toBe(words.verseFirstWord(27, 24) - 1);
  });
});

describe('Recite your mistakes here: the page’s remembered mistakes as one stretch (openDrill)', () => {
  const DAY = 86_400_000;
  const T0 = Date.UTC(2026, 10, 2, 21);
  let n = 0;
  const take = (dayIndex: number, marks: Mark[], from: number, to: number): TakeRecord => {
    const createdAt = T0 + dayIndex * DAY + (n++ % 50) * 60_000;
    return {
      id: `t${n}`,
      kind: 'take',
      take: null,
      createdAt,
      rev: createdAt,
      day: new Date(T0 + dayIndex * DAY).toISOString().slice(0, 10),
      level: 'strict',
      hidden: false,
      from,
      to,
      secs: 100,
      mistakes: marks.length,
      tajweed: 0,
      unclear: 0,
      accuracy: 1,
      marks,
      passed: [],
      recordingId: null,
    };
  };
  // An-Naml 27:24 and the page it is on, the stretch every take below covered.
  const page = words.pageOf(words.verseFirstWord(27, 24));
  const [pageFrom, pageTo] = words.pageRange(page);
  const covered = (dayIndex: number, marks: Mark[] = []) => take(dayIndex, marks, pageFrom, pageTo - 1);
  const onPage = (s: number, a: number) => words.pageOf(words.verseFirstWord(s, a)) === page;

  it('counts each word still to fix on the page, and runs from the ayah before the first to the last', () => {
    expect(onPage(27, 24) && onPage(27, 27)).toBe(true);
    const records = [covered(0, [at(27, 27, { kind: 'skipped' })]), covered(1, [at(27, 24, { kind: 'harakat' })])];
    const drill = openDrill(records, words, page);
    expect(drill).not.toBeNull();
    expect(drill!.count).toBe(2);
    expect(drill!.range).toEqual({ from: [27, 23], to: [27, 27] });
    expect(drill!.marks.map((m) => m.ayah)).toEqual([
      [27, 24],
      [27, 27],
    ]);
  });

  it('a word said right since, on two different days, is cleared and not counted', () => {
    const records = [covered(0, [at(27, 24), at(27, 27)]), covered(1, [at(27, 27)]), covered(2, [at(27, 27)])];
    // 27:24 was right on days 1 and 2; 27:27 is still wrong.
    expect(openDrill(records, words, page)).toMatchObject({ count: 1, range: { from: [27, 26], to: [27, 27] } });
  });

  it('leaves out tajweed notes, as Recite the mistakes again does; only notes left: nothing to drill', () => {
    expect(openDrill([covered(0, [at(27, 24, { kind: 'tajweed' })])], words, page)).toBeNull();
    expect(openDrill([covered(0, [at(27, 24, { kind: 'tajweed' }), at(27, 26)])], words, page)).toMatchObject({ count: 1 });
  });

  it('only this page’s words; a page with nothing remembered, or no takes at all: nothing to drill', () => {
    const records = [covered(0, [at(27, 24)])];
    expect(openDrill(records, words, page + 1)).toBeNull();
    expect(openDrill([], words, page)).toBeNull();
    expect(openDrill([covered(0)], words, page)).toBeNull();
  });
});
