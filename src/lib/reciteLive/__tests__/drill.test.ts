import { quranWords } from '../../recite/__fixtures__/quranWords';
import type { Mark } from '../contract';
import { drillRange, lastWordOf } from '../drill';

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
