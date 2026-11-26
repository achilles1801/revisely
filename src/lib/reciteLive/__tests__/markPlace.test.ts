// An extra word is shown on the word the reciter was reaching for (BEHAVIOUR.md RECITE-2; Majd, Nov 25 2026).
import { setQuranWordsForTests } from '../../recite/quranWords';
import { quranWords, wordsData } from '../../recite/__fixtures__/quranWords';
import { checkerWord, onNextWord, placeMark } from '../markPlace';
import { applyEvent, LIVE_IDLE, marksOnPage } from '../state';
import { expectedPhrase, markTitle, recitedPhrase, slipLine } from '../describe';
import { fromStored } from '../../reciteMemory/record';
import { findingsLine } from '../../../components/reciteLive/TakeSummarySheet';
import type { Mark } from '../contract';

const words = quranWords();
const A23 = words.verseFirstWord(27, 23);
const added = (w: number, extra: Partial<Mark> = {}): Mark => {
  const r = words.ref(w);
  return { id: `${w}:added:`, w, ayah: [r.sura, r.ayah], kind: 'added', sure: 'clear', heard: 'إن', ...extra };
};

beforeAll(() => setQuranWordsForTests(wordsData()));
afterAll(() => setQuranWordsForTests(null));

describe('[RECITE-2] an extra word is shown on the next word, the one the reciter was reaching for', () => {
  it('moves to the next word, its ayah that word’s (the next ayah’s first word too), and keeps the checker’s id', () => {
    const m = placeMark(added(A23 + 1));
    expect(m.w).toBe(A23 + 2);
    expect(m.id).toBe(`${A23 + 1}:added:`);
    expect(checkerWord(m)).toBe(A23 + 1);
    expect(onNextWord(m)).toBe(true);
    // The last word of 27:23: shown on 27:24's first word, named by it.
    const last23 = words.verseRange(27, 23)[1] - 1;
    const atEnd = placeMark(added(last23));
    expect(atEnd.w).toBe(words.verseFirstWord(27, 24));
    expect(atEnd.ayah).toEqual([27, 24]);
  });

  it('placing twice is placing once (an old record saved again, or a take’s record loaded)', () => {
    const once = placeMark(added(A23 + 1));
    expect(placeMark(once)).toEqual(once);
  });

  it('stays on the word it came after past the end (`trail`) and at a surah’s end', () => {
    expect(placeMark(added(A23 + 1, { detail: 'trail' })).w).toBe(A23 + 1);
    const lastOfNaml = words.verseRange(27, 93)[1] - 1;
    const m = placeMark(added(lastOfNaml));
    expect(m.w).toBe(lastOfNaml);
    expect(onNextWord(m)).toBe(false);
    expect(markTitle(m)).toBe('Extra word');
  });

  it('a take’s mark: on the next word on the page, with the checker’s id; the red cover on that word goes', () => {
    const page = words.pageOf(A23);
    const s = applyEvent({ ...LIVE_IDLE, status: 'listening' }, { type: 'mark', mark: added(A23 + 1) });
    const shown = marksOnPage(s, words, page);
    expect(shown.map((m) => [m.id, m.w])).toEqual([[`${A23 + 1}:added:`, A23 + 2]]);
    // Something else said in the next word's slot turned its cover red: the hesitation marked there ends it.
    const red = { ...LIVE_IDLE, status: 'listening' as const, off: { w: A23 + 2, from: A23 + 1 } };
    expect(applyEvent(red as never, { type: 'mark', mark: added(A23 + 1) }).off).toBeNull();
  });

  it('the final answer’s marks are placed the same way', () => {
    const live = applyEvent({ ...LIVE_IDLE, status: 'listening' }, { type: 'mark', mark: added(A23 + 1) });
    const done = applyEvent(live, {
      type: 'done',
      result: { v: 2, from: A23, to: A23 + 10, secs: 10, words: [], marks: [added(A23 + 1)], score: null },
    } as never);
    expect(Object.values(done.marks).map((m) => m.w)).toEqual([A23 + 2]);
  });

  it('a past take in Recite’s memory, kept with the old place, is shown by the same rule', () => {
    const raw = { kind: 'take', createdAt: 1, rev: 1, day: '2026-11-20', from: A23, to: A23 + 10, marks: [{ id: `${A23 + 1}:added:`, w: A23 + 1, sura: 27, ayah: 23, kind: 'added', sure: 'clear' }] };
    const r = fromStored('t1', raw) as { marks: Mark[] };
    expect(r.marks[0].w).toBe(A23 + 2);
  });

  it('worded as a hesitation on its card and in the summary; the phrase rows stay around the gap it was said in', () => {
    const m = placeMark(added(A23 + 1));
    expect(markTitle(m)).toBe('Hesitated here');
    expect(slipLine(m)).toBe('Something else was said before this word.');
    expect(findingsLine([m])).toBe('1 hesitation');
    // Expected: the words either side of where it was said (the word it came after and the next), as before.
    const before = expectedPhrase(words, added(A23 + 1)).map((p) => p.text);
    expect(expectedPhrase(words, m).map((p) => p.text)).toEqual(before);
    expect(recitedPhrase(words, m)?.map((p) => p.text)).toEqual(recitedPhrase(words, added(A23 + 1))?.map((p) => p.text));
  });
});
