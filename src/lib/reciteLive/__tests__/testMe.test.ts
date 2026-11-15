import { quranWords } from '../../recite/__fixtures__/quranWords';
import { ayahKey, ayahsBetween, ayahCount } from '../../ayahKeys';
import { plainText } from '../../passages';
import type { Mark } from '../contract';
import { applyEvent, liveConnecting, LiveState } from '../state';
import { CUE_WORDS, TEST_PLACES, testHeadline, testJuz, testPlaceName, testPlaces, testResult, testStarts } from '../testMe';

const words = quranWords();
/** A random source that gives the same numbers each run. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
const surah = (n: number) => ayahsBetween(ayahKey(n, 1), ayahKey(n, ayahCount(n)));
/** Juz 30 (An-Naba' to An-Nas) and Al-Mulk. */
const JUZ30 = Array.from({ length: 114 - 78 + 1 }, (_, i) => 78 + i).flatMap(surah);
const MEMORIZED = [...surah(67), ...JUZ30];

describe('Test me: where it starts (Majd, Nov 15 2026)', () => {
  it('in a memorized ayah long enough to carry on after the two words shown', () => {
    const starts = testStarts(MEMORIZED, words);
    expect(starts.length).toBeGreaterThan(0);
    for (const k of starts) {
      const [from, to] = words.verseRange(Math.floor(k / 1000), k % 1000);
      expect(to - from).toBeGreaterThanOrEqual(CUE_WORDS + 2);
      expect(MEMORIZED).toContain(k);
    }
    // Al-Kawthar 1 has three words: never a start.
    expect(starts).not.toContain(ayahKey(108, 1));
  });

  it('a juz picked: only there', () => {
    const starts = testStarts(MEMORIZED, words, 29);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts.every((k) => Math.floor(k / 1000) === 67)).toBe(true);
    expect(testJuz(MEMORIZED, words).map((j) => j.juz)).toEqual([29, 30]);
  });

  it('five places, each its ayah and the two after it, none sharing an ayah', () => {
    const places = testPlaces(MEMORIZED, words, { random: seeded(7) });
    expect(places).toHaveLength(TEST_PLACES);
    const seen = new Set<number>();
    for (const p of places) {
      const from = ayahKey(...p.span.from);
      const to = ayahKey(...p.span.to!);
      expect(p.span.startBy).toEqual(p.span.from);
      expect(Math.floor(to / 1000)).toBe(Math.floor(from / 1000));
      expect(to - from).toBeLessThanOrEqual(2);
      for (const k of ayahsBetween(from, to)) {
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
      expect(p.cue).toEqual([words.verseFirstWord(...p.span.from), words.verseFirstWord(...p.span.from) + 1]);
      expect(p.last).toBe(words.verseRange(...p.span.to!)[1] - 1);
    }
  });

  it('never past what is memorized, nor into the next surah', () => {
    // Al-Mulk 1–4 memorized: a place at 3 covers 3 and 4 only.
    const mem = ayahsBetween(ayahKey(67, 1), ayahKey(67, 4));
    const random = () => 0.99;
    const [p] = testPlaces(mem, words, { places: 1, random });
    expect(p.span.from).toEqual([67, 4]);
    expect(p.span.to).toEqual([67, 4]);
    // A surah's last ayah: alone.
    const [q] = testPlaces([ayahKey(67, 30), ayahKey(68, 1)], words, { places: 1, random: () => 0 });
    expect(q.span).toEqual({ from: [67, 30], startBy: [67, 30], to: [67, 30] });
  });

  it('fewer places when less is memorized; none with nothing', () => {
    expect(testPlaces(ayahsBetween(ayahKey(67, 1), ayahKey(67, 6)), words, { random: seeded(3) }).length).toBeLessThanOrEqual(2);
    expect(testPlaces([], words)).toEqual([]);
  });

  it('names the place by its surah and ayahs', () => {
    const [p] = testPlaces(surah(67), words, { places: 1, random: () => 0 });
    expect(plainText(testPlaceName(p))).toBe('Al-Mulk, ayahs 1–3');
  });
});

describe('Test me: how a place went', () => {
  const [place] = testPlaces(surah(67), words, { places: 1, random: () => 0 });
  const first = place.cue[0];
  const take = (...events: Parameters<typeof applyEvent>[1][]): LiveState =>
    events.reduce((s, e) => applyEvent(s, e), liveConnecting({ anywhereFrom: first }));
  const ready = { type: 'ready', take: 't', protocol: 6 } as const;
  const locked = { type: 'locked', w: first + 2, s: 67, a: 1 } as const;
  const wrong: Mark = { id: 'x', w: first + 4, ayah: [67, 1], kind: 'word', sure: 'clear', heard: 'x', heardExact: false };

  it('clean: on to its last word with no mistake', () => {
    expect(testResult(place, take(ready, locked, { type: 'said', upTo: place.last })).outcome).toBe('clean');
  });

  it('a mistake on the way: its marks', () => {
    const r = testResult(place, take(ready, locked, { type: 'mark', mark: wrong }, { type: 'said', upTo: place.last }));
    expect(r.outcome).toBe('mistakes');
    expect(r.marks).toEqual([wrong]);
  });

  it('stopped before the end, or never begun', () => {
    expect(testResult(place, take(ready, locked, { type: 'said', upTo: first + 6 })).outcome).toBe('unfinished');
    expect(testResult(place, take(ready)).outcome).toBe('missed');
  });

  it('the headline counts the clean ones', () => {
    const r = (outcome: 'clean' | 'mistakes') => ({ place, outcome, marks: [] });
    expect(testHeadline([r('clean'), r('mistakes'), r('clean')])).toBe('2 of 3 continued cleanly');
    expect(testHeadline([r('clean'), r('clean')])).toBe('All 2 continued cleanly');
  });
});
