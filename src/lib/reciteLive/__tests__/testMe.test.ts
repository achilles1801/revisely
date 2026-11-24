import { quranWords } from '../../recite/__fixtures__/quranWords';
import { ayahKey, ayahCount, ayahsBetween } from '../../ayahKeys';
import type { Mark } from '../contract';
import { applyEvent, liveConnecting, LiveState } from '../state';
import { pickTest, spotTestLine, testFinished, testJuz, testLengthLabel, testStarts, wordPagesOn } from '../testMe';

const words = quranWords();
const surah = (n: number) => ayahsBetween(ayahKey(n, 1), ayahKey(n, ayahCount(n)));
/** Juz 30 (An-Naba' to An-Nas) and Al-Mulk. */
const JUZ30 = Array.from({ length: 114 - 78 + 1 }, (_, i) => 78 + i).flatMap(surah);
const MEMORIZED = [...surah(67), ...JUZ30];
const first = () => 0;

describe('Test me: where a spot test starts (RECITE-8)', () => {
  it('in a memorized verse with the next ayah of its surah memorized too: never a surah’s last', () => {
    const starts = testStarts(MEMORIZED, words);
    expect(starts).toContain(ayahKey(108, 1));
    expect(starts).not.toContain(ayahKey(67, 30));
    expect(starts).not.toContain(ayahKey(114, 6));
    // The next ayah isn't memorized.
    expect(testStarts([ayahKey(67, 1), ayahKey(67, 3)], words)).toEqual([]);
  });

  it('a juz picked: only there', () => {
    const starts = testStarts(MEMORIZED, words, 29);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts.every((k) => Math.floor(k / 1000) === 67)).toBe(true);
    expect(testJuz(MEMORIZED, words).map((j) => j.juz)).toEqual([29, 30]);
  });

  it('one test: the whole verse shown, the checker looking in it and the next', () => {
    const t = pickTest(surah(67), words, { random: first })!;
    const [a, b] = words.verseRange(67, 1);
    expect(t.span.from).toEqual([67, 1]);
    expect(t.span.startBy).toEqual([67, 2]);
    expect(t.cue).toEqual(Array.from({ length: b - a }, (_, i) => a + i));
    expect(t.pages).toBe(1);
  });

  it('nothing to start from: no test', () => {
    expect(pickTest([], words)).toBeNull();
    expect(pickTest([ayahKey(67, 30)], words)).toBeNull();
  });
});

describe('Test me: how far it goes', () => {
  it('a page on is the same place on the next page, less a word', () => {
    const [p0, p1] = words.pageRange(562);
    expect(wordPagesOn(words, p0, 1)).toBe(p1 - 1);
    const [q0] = words.pageRange(564);
    expect(wordPagesOn(words, p0, 2)).toBe(q0 - 1);
    expect(wordPagesOn(words, words.count - 5, 3)).toBe(words.count - 1);
  });

  it('ends at the end of the ayah about that far on, and a longer length goes further', () => {
    const lengths = ([0.5, 1, 2, 3] as const).map((pages) => pickTest(surah(67).concat(surah(68)), words, { pages, random: first })!);
    for (const t of lengths) expect(t.last).toBe(words.verseRange(...t.span.to!)[1] - 1);
    for (let i = 1; i < lengths.length; i++) expect(lengths[i].last).toBeGreaterThan(lengths[i - 1].last);
  });

  it('runs across a surah’s end when the next one is memorized', () => {
    const t = pickTest([...surah(113), ...surah(114)], words, { pages: 1, random: first })!;
    expect(t.span.from).toEqual([113, 1]);
    expect(t.span.to).toEqual([114, 6]);
  });

  it('never past what is memorized, or the juz picked', () => {
    const held = ayahsBetween(ayahKey(67, 1), ayahKey(67, 4));
    expect(pickTest(held, words, { pages: 3, random: first })!.span.to).toEqual([67, 4]);
    // Al-Mursalat (juz 29) runs on into An-Naba' (juz 30): picked in juz 29, it stops at the surah's end.
    const t = pickTest([...surah(77), ...surah(78)], words, { juz: 29, pages: 3, random: () => 0.99 })!;
    expect(t.span.to![0]).toBe(77);
  });

  it('takes a start with room for the whole length when there is one', () => {
    // Drawn last to first: the late starts can't hold a page, so it keeps drawing until one can.
    const t = pickTest(surah(67), words, { pages: 1, random: () => 0.99 })!;
    expect(t.last).toBeGreaterThanOrEqual(wordPagesOn(words, t.cue[0], 1));
  });

  it('says its length in words', () => {
    expect(testLengthLabel(0.5)).toBe('½ page');
    expect(testLengthLabel(1)).toBe('1 page');
    expect(testLengthLabel(3)).toBe('3 pages');
    expect(spotTestLine(1, false)).toBe('Test · 1 page · Stopped early');
    expect(spotTestLine(2, true)).toBe('Test · 2 pages · Finished');
  });
});

describe('Test me: finished or stopped early', () => {
  const spot = pickTest(surah(67), words, { random: first })!;
  const start = spot.cue[0];
  const take = (...events: Parameters<typeof applyEvent>[1][]): LiveState =>
    events.reduce((s, e) => applyEvent(s, e), liveConnecting({ anywhereFrom: start }));
  const ready = { type: 'ready', take: 't', protocol: 6 } as const;
  const locked = { type: 'locked', w: start, s: 67, a: 1 } as const;
  const skipped = (w: number): Mark => ({ id: `${w}:skipped`, w, ayah: [67, 12], kind: 'skipped', sure: 'clear' });

  it('reached its last word: finished', () => {
    expect(testFinished(words, spot, take(ready, locked, { type: 'said', upTo: spot.last }))).toBe(true);
  });

  it('a word short of it counts: the cursor runs a moment behind the voice', () => {
    expect(testFinished(words, spot, take(ready, locked, { type: 'said', upTo: spot.last - 1 }))).toBe(true);
  });

  it('short of that, or never begun: stopped early', () => {
    expect(testFinished(words, spot, take(ready, locked, { type: 'said', upTo: spot.last - 6 }))).toBe(false);
    expect(testFinished(words, spot, take(ready))).toBe(false);
  });

  it('a skipped word at the end says nothing was heard there', () => {
    const s = take(ready, locked, { type: 'said', upTo: start + 6 }, { type: 'mark', mark: skipped(spot.last) });
    expect(testFinished(words, spot, s)).toBe(false);
  });
});
