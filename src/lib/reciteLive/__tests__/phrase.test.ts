import { quranWords } from '../../recite/__fixtures__/quranWords';
import type { Mark } from '../contract';
import { AT_LAG, clipRange, endsPhrase, LEAD, MAX_SECONDS, pauseAfter, phraseOf, TAIL } from '../phrase';

const words = quranWords();
/** Word `p` (1-based) of an ayah. */
const word = (s: number, a: number, p: number) => words.verseFirstWord(s, a) + p - 1;
const mark = (w: number, over: Partial<Mark> = {}): Mark => {
  const r = words.ref(w);
  return { id: `m${w}`, w, ayah: [r.sura, r.ayah], kind: 'word', sure: 'clear', ...over };
};
/** A take where the cursor reached each of `ws` `step` seconds after the one before, from `from` seconds. */
const timed = (ws: number[], from: number, step: number) => {
  const m = new Map(ws.map((w, i) => [w, from + i * step]));
  return (w: number) => m.get(w) ?? null;
};
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
/** Where a clip starts for a phrase whose first word the cursor reached at `t`, and ends for the word after it. */
const startAt = (t: number) => t - AT_LAG - LEAD;
const endAt = (t: number) => t - AT_LAG + TAIL;

describe('the pause marks (src/data/quranWaqf.json)', () => {
  it('lie on the words they follow: Al-Baqarah 2:2’s ۛ on رَيْبَ and فِيهِ', () => {
    expect(pauseAfter(word(2, 2, 4))).toBe('ۛ');
    expect(pauseAfter(word(2, 2, 5))).toBe('ۛ');
    expect(pauseAfter(word(2, 2, 3))).toBeNull();
    expect(pauseAfter(word(2, 255, 7))).toBe('ۚ');
  });

  it('every one ends a phrase but ۙ (don’t stop): Al-Baqarah 2:25’s 18th word', () => {
    expect(pauseAfter(word(2, 25, 18))).toBe('ۙ');
    expect(endsPhrase(word(2, 25, 18))).toBe(false);
    expect(endsPhrase(word(2, 25, 12))).toBe(true);
  });
});

describe('the phrase a mistake is in', () => {
  it('from the word after the last mark before it to the next mark, its own included (Ayat al-Kursi)', () => {
    // 2:255: ۚ after its 7th and 12th words.
    expect(phraseOf(words, word(2, 255, 9))).toEqual([word(2, 255, 8), word(2, 255, 12)]);
    expect(phraseOf(words, word(2, 255, 12))).toEqual([word(2, 255, 8), word(2, 255, 12)]);
    expect(phraseOf(words, word(2, 255, 13))).toEqual([word(2, 255, 13), word(2, 255, 19)]);
  });

  it('from the ayah’s start, to its end, and never past it', () => {
    expect(phraseOf(words, word(2, 255, 2))).toEqual([word(2, 255, 1), word(2, 255, 7)]);
    expect(phraseOf(words, word(2, 255, 50))).toEqual([word(2, 255, 48), word(2, 255, 50)]);
    const [a0, a1] = words.verseRange(2, 6);
    expect(phraseOf(words, word(2, 6, 5))).toEqual([a0, a1 - 1]);
  });

  it('runs on over ۙ', () => {
    expect(phraseOf(words, word(2, 25, 16))).toEqual([word(2, 25, 13), word(2, 25, 24)]);
  });
});

describe('Your recitation: what it plays (RECITE-10)', () => {
  it('a short ayah plays whole: 11 words, from its first word to the next ayah', () => {
    // 2:6 then 2:7, a word every 0.8 s from 10 s.
    const ws = range(words.verseFirstWord(2, 6), words.verseRange(2, 7)[1]);
    const timeOf = timed(ws, 10, 0.8);
    const next = timeOf(words.verseFirstWord(2, 7))!;
    expect(clipRange(words, mark(word(2, 6, 5)), timeOf, 100)).toEqual([startAt(10), endAt(next)]);
  });

  it('a long ayah recited in 8 s or less plays whole too (2:19, 19 words)', () => {
    const ws = range(words.verseFirstWord(2, 19), words.verseRange(2, 20)[1]);
    const timeOf = timed(ws, 4, 0.4);
    const [r0, r1] = clipRange(words, mark(word(2, 19, 3)), timeOf, 100)!;
    expect(r0).toBeCloseTo(startAt(4));
    expect(r1).toBeCloseTo(endAt(timeOf(words.verseFirstWord(2, 20))!));
  });

  it('a long ayah: the phrase the mistake is in, with a little before and after', () => {
    const ws = range(words.verseFirstWord(2, 255), words.verseRange(2, 255)[1]);
    const timeOf = timed(ws, 0, 1);
    // Words 8–12 (between the ۚ marks); the clip ends when the cursor reached word 13.
    expect(clipRange(words, mark(word(2, 255, 9)), timeOf, 200)).toEqual([startAt(7), endAt(12)]);
  });

  it('a skipped word: the phrase around where it should have been', () => {
    const ws = range(words.verseFirstWord(2, 255), words.verseRange(2, 255)[1]).filter((w) => w !== word(2, 255, 9));
    const timeOf = timed(ws, 0, 1);
    expect(clipRange(words, mark(word(2, 255, 9), { kind: 'skipped' }), timeOf, 200)).toEqual([startAt(7), endAt(11)]);
  });

  it('a skipped word that begins its phrase: from the word before it, so the jump is heard', () => {
    // 2:255's 8th word (the first after the ۚ on its 7th) skipped.
    const ws = range(words.verseFirstWord(2, 255), words.verseRange(2, 255)[1]).filter((w) => w !== word(2, 255, 8));
    const timeOf = timed(ws, 0, 1);
    expect(clipRange(words, mark(word(2, 255, 8), { kind: 'skipped' }), timeOf, 200)).toEqual([startAt(6), endAt(11)]);
  });

  it('an extra word: the phrase of the word it came after, up to the word after it (what was added is in it)', () => {
    // A mark on 2:255's 12th word (it carries ۚ): its phrase ends there; the cursor reached the 13th at 20 s.
    const ws = range(words.verseFirstWord(2, 255), word(2, 255, 13));
    const m = new Map(ws.map((w, i) => [w, i]));
    m.set(word(2, 255, 13), 20);
    const timeOf = (w: number) => m.get(w) ?? null;
    expect(clipRange(words, mark(word(2, 255, 12), { kind: 'added' }), timeOf, 200)).toEqual([startAt(7), endAt(20)]);
  });

  it(`at most ${MAX_SECONDS} s: a long phrase is the mistake, 4 words before and 3 after`, () => {
    // 2:282's words 23–34 (between ۚ marks), a word every 1.5 s: 18 s.
    const ws = range(words.verseFirstWord(2, 282), words.verseRange(2, 282)[1]);
    const timeOf = timed(ws, 0, 1.5);
    const w = word(2, 282, 28);
    const [r0, r1] = clipRange(words, mark(w), timeOf, 400)!;
    expect([r0, r1]).toEqual([startAt(timeOf(w - 4)!), endAt(timeOf(w + 4)!)]);
    expect(r1 - r0).toBeLessThanOrEqual(MAX_SECONDS);
  });

  it('still too long (a slow reciter): the 15 s around the mistake', () => {
    const ws = range(words.verseFirstWord(2, 282), words.verseRange(2, 282)[1]);
    const timeOf = timed(ws, 0, 3);
    const w = word(2, 282, 28);
    const t = timeOf(w)!;
    expect(clipRange(words, mark(w), timeOf, 400)).toEqual([t - MAX_SECONDS / 2, t + MAX_SECONDS / 2]);
  });

  it('a take that ended in the phrase: up to the take’s end', () => {
    const ws = range(words.verseFirstWord(2, 255), word(2, 255, 11));
    const timeOf = timed(ws, 0, 1);
    expect(clipRange(words, mark(word(2, 255, 10)), timeOf, 10.5)).toEqual([startAt(7), 10.5]);
  });

  it('the ayah started again (the mistake after the times the cursor first reached): the mark’s own second', () => {
    const ws = range(words.verseFirstWord(2, 255), words.verseRange(2, 255)[1]);
    const timeOf = timed(ws, 0, 1);
    expect(clipRange(words, mark(word(2, 255, 9), { t: [80, 80.6] }), timeOf, 200)).toEqual([80 - 0.6, 80.6 + 0.4]);
  });

  it('a phrase the cursor never reached: the mark’s own second, or across where it should have been', () => {
    const none = () => null;
    expect(clipRange(words, mark(word(2, 255, 9), { t: [5, 5.5] }), none, 200)).toEqual([4.4, 5.9]);
    expect(clipRange(words, mark(word(2, 255, 9)), none, 200)).toBeNull();
    // Alif Lam Mim (2:1, one word) skipped: from Al-Fatihah's last word to 2:2's first.
    const alm = words.verseFirstWord(2, 1);
    const m = new Map([[alm - 1, 30], [alm + 1, 34]]);
    expect(clipRange(words, mark(alm, { kind: 'skipped' }), (w) => m.get(w) ?? null, 200)).toEqual([startAt(30), endAt(34)]);
    // Only the word after it heard (the take started there): the 2 s before it.
    const after = new Map([[alm + 1, 34]]);
    expect(clipRange(words, mark(alm, { kind: 'skipped' }), (w) => after.get(w) ?? null, 200)).toEqual([startAt(34) - 2, endAt(34)]);
  });

  it('never before the take’s start', () => {
    const ws = range(words.verseFirstWord(2, 255), words.verseRange(2, 255)[1]);
    const timeOf = timed(ws, 0.2, 1);
    expect(clipRange(words, mark(word(2, 255, 2)), timeOf, 200)![0]).toBe(0);
  });
});
