import { quranWords } from '../../recite/__fixtures__/quranWords';
import { applyEvent, dismissMark, liveConnecting, LiveState, mistakeCount } from '../state';
import type { Mark } from '../contract';
import { barWords, hiddenFollow, nextHiddenWord, NOTHING_SHOWN, revealAyah, revealNextWord, scorePill, wordShown } from '../view';
import { spokenBarWord } from '../../../components/reciteLive/ReciteBar';

const words = quranWords();
const A23 = words.verseFirstWord(27, 23);
const UTIYAT = A23 + 4;

const mark = (over: Partial<Mark>): Mark => ({ id: 'm', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'likely', ...over });
const at = (s: LiveState, w: number) => applyEvent(s, { type: 'at', w });

describe('the words heard in the bar', () => {
  it('the last two said, the newest last and marked current; never the word under the cursor [RECITE-28]', () => {
    const s = at(liveConnecting(), A23 + 3);
    expect(barWords(s, words, { check: false, startWord: A23 })).toEqual([
      { w: A23 + 1, text: words.uthmani(A23 + 1), tone: 'said' },
      { w: A23 + 2, text: words.uthmani(A23 + 2), tone: 'current' },
    ]);
  });

  it('[RECITE-28] the word under the cursor joins once `said` reaches it at a pause', () => {
    const s = applyEvent(at(liveConnecting(), A23 + 3), { type: 'said', upTo: A23 + 3 });
    expect(barWords(s, words, { check: false, startWord: A23 }).map((b) => [b.w - A23, b.tone])).toEqual([
      [2, 'said'],
      [3, 'current'],
    ]);
  });

  it('[RECITE-28] at a pause with no `said`, it joins once it has been under the cursor long enough: the line never sticks', () => {
    const s = applyEvent(at(liveConnecting(), A23 + 3), { type: 'said', upTo: A23 + 1 });
    expect(barWords(s, words, { check: false, startWord: A23 }).map((b) => b.w - A23)).toEqual([1, 2]);
    expect(barWords(s, words, { check: false, startWord: A23, held: A23 + 3 }).map((b) => [b.w - A23, b.tone])).toEqual([
      [2, 'said'],
      [3, 'current'],
    ]);
    // The timer's word is another's: it says nothing of this one.
    expect(barWords(s, words, { check: false, startWord: A23, held: A23 + 2 }).map((b) => b.w - A23)).toEqual([1, 2]);
  });

  it('[RECITE-28] gone back: a word said earlier waits to be said again', () => {
    let s = applyEvent(at(liveConnecting(), A23 + 8), { type: 'said', upTo: A23 + 8 });
    s = at(s, A23 + 4);
    expect(barWords(s, words, { check: false, startWord: A23 }).map((b) => b.w - A23)).toEqual([2, 3]);
  });

  it('[RECITE-28] once the take has stopped, the bar ends on the word it stopped on', () => {
    const s: LiveState = { ...at(liveConnecting(), A23 + 3), status: 'checking' };
    expect(barWords(s, words, { check: false, startWord: A23 }).map((b) => b.w - A23)).toEqual([2, 3]);
  });

  it('nothing before the cursor is found, and never before the take began', () => {
    expect(barWords(liveConnecting(), words, { check: false, startWord: A23 })).toEqual([]);
    // The first word, only just begun: nothing yet.
    expect(barWords(at(liveConnecting(), A23), words, { check: false, startWord: A23 })).toEqual([]);
    expect(barWords(at(liveConnecting(), A23 + 1), words, { check: false, startWord: A23 }).map((b) => b.w)).toEqual([A23]);
  });

  it('Check: a wrong word shows as heard; a skipped one is left out. Recite shows the text as written', () => {
    let s = at(liveConnecting(), A23 + 7);
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'a', heard: 'وَأُوهِيَتْ', heardExact: false }) });
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'b', w: A23 + 5, kind: 'skipped' }) });
    expect(barWords(s, words, { check: true, startWord: A23 }).map((b) => [b.w - A23, b.tone, b.tone === 'wrong' ? b.text : ''])).toEqual([
      [4, 'wrong', 'وَأُوهِيَتْ'],
      [6, 'current', ''],
    ]);
    expect(barWords(s, words, { check: false, startWord: A23 }).map((b) => b.w - A23)).toEqual([5, 6]);
  });

  it('Check: a word said wrong and corrected straight away is on its own colour, never shown as wrong [RECITE-33]', () => {
    let s = at(liveConnecting(), A23 + 5);
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'a', heard: 'وَأُوهِيَتْ', heardExact: false, sure: 'clear' }) });
    expect(barWords(s, words, { check: true, startWord: A23 }).map((b) => [b.w - A23, b.tone, b.text])).toEqual([
      [3, 'said', words.uthmani(A23 + 3)],
      [4, 'wrong', 'وَأُوهِيَتْ'],
    ]);
    expect(mistakeCount(s)).toBe(1);
    // The same mark again, corrected: the word as the page has it, on its own colour, and no mistake.
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'a', heard: 'وَأُوهِيَتْ', heardExact: false, sure: 'clear', corrected: true }) });
    expect(barWords(s, words, { check: true, startWord: A23 }).map((b) => [b.w - A23, b.tone, b.text])).toEqual([
      [3, 'said', words.uthmani(A23 + 3)],
      [4, 'corrected', words.uthmani(A23 + 4)],
    ]);
    expect(mistakeCount(s)).toBe(0);
    expect(spokenBarWord({ text: 'وَأُوتِيَتْ', tone: 'corrected' })).toBe('وَأُوتِيَتْ, corrected,');
  });

  it('Check: a word with a slip (a haraka, a letter) is amber, a tajweed note violet, the current one too; Recite marks none', () => {
    let s = at(liveConnecting(), A23 + 9);
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'h', w: A23 + 7, kind: 'harakat', sure: 'clear', slip: { expected: 'ٍ', heard: 'ٌّ' } }) });
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 't', w: A23 + 8, kind: 'tajweed', rule: 'qalqalah' }) });
    expect(barWords(s, words, { check: true, startWord: A23 }).map((b) => [b.w - A23, b.tone])).toEqual([
      [7, 'slip'],
      [8, 'tajweed'],
    ]);
    expect(barWords(s, words, { check: false, startWord: A23 }).map((b) => b.tone)).toEqual(['said', 'current']);
  });

  it('a wrong haraka or letter says which, for a screen reader (a mistake like a wrong word, RECITE-2)', () => {
    let s = at(liveConnecting(), A23 + 9);
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'h', w: A23 + 7, kind: 'harakat', sure: 'clear' }) });
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'l', w: A23 + 8, kind: 'letter', sure: 'clear' }) });
    expect(barWords(s, words, { check: true, startWord: A23 }).map((b) => [b.w - A23, b.tone, b.part])).toEqual([
      [7, 'slip', 'harakat'],
      [8, 'slip', 'letter'],
    ]);
    // A word with both a wrong haraka and a wrong letter is said as a wrong letter.
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'l2', w: A23 + 7, kind: 'letter', sure: 'clear' }) });
    expect(barWords(s, words, { check: true, startWord: A23 })[0].part).toBe('letter');
  });

  it('a “not clear” haraka (past the normal bar only) isn’t shown as a slip: it wasn’t heard as wrong', () => {
    let s = at(liveConnecting(), A23 + 9);
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'h', w: A23 + 7, kind: 'harakat', sure: 'likely' }) });
    expect(barWords(s, words, { check: true, startWord: A23 }).map((b) => [b.w - A23, b.tone])).toEqual([
      [7, 'said'],
      [8, 'current'],
    ]);
  });
});

describe('the score pill', () => {
  it('by the page: none, one mistake green, two amber', () => {
    let s = applyEvent(at(liveConnecting(), A23 + 8), { type: 'said', upTo: A23 + 7 });
    expect(scorePill(s, words, A23)).toEqual({ text: '100%', level: 'good' });
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'a' }) });
    expect(scorePill(s, words, A23)).toEqual({ text: '99.2%', level: 'good' });
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'b', w: A23 + 7, kind: 'harakat', sure: 'clear' }) });
    expect(scorePill(s, words, A23)).toEqual({ text: '98.5%', level: 'warn' });
    // Tajweed notes don't count.
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'c', w: A23 + 8, kind: 'tajweed', rule: 'qalqalah' }) });
    expect(scorePill(s, words, A23)?.text).toBe('98.5%');
    expect(scorePill(s, words, null)).toBeNull();
  });

  it('“not clear” marks never count (Majd, Nov 15 2026): a haraka or letter past the normal bar only', () => {
    let s = applyEvent(at(liveConnecting(), A23 + 8), { type: 'said', upTo: A23 + 7 });
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'a' }) });
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'h', w: A23 + 6, kind: 'harakat', sure: 'likely' }) });
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'l', w: A23 + 7, kind: 'letter', sure: 'likely' }) });
    expect(scorePill(s, words, A23)).toEqual({ text: '99.2%', level: 'good' });
    // A checker that still counts them in `mistakes`: the ones shown are taken out.
    s = applyEvent(s, { type: 'score', score: { reached: 8, mistakes: 3, tajweed: 0, accuracy: 0.625 } });
    expect(mistakeCount(s)).toBe(1);
    // Dismissing one: the checker's count and the marks shown both lose it, so the count stays.
    s = dismissMark(s, 'h');
    expect(mistakeCount(s)).toBe(1);
    // A checker that counts them apart (`unclear`): its `mistakes` already leaves them out.
    s = applyEvent(s, { type: 'score', score: { reached: 8, mistakes: 1, tajweed: 0, unclear: 1, accuracy: 0.875 } });
    expect(mistakeCount(s)).toBe(1);
    s = dismissMark(s, 'l');
    expect(mistakeCount(s)).toBe(1);
    expect(s.score?.unclear).toBe(0);
    // A likely wrong word still counts: only harakat and letters are "not clear".
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'w2', w: A23 + 5, kind: 'word', sure: 'likely' }) });
    s = applyEvent(s, { type: 'score', score: { reached: 8, mistakes: 2, tajweed: 0, unclear: 0, accuracy: 0.75 } });
    expect(mistakeCount(s)).toBe(2);
  });
});

describe('the hidden view', () => {
  const live = (saidUpTo: number | null, cursor: number | null = null) => ({ saidUpTo, startWord: A23, cursor });

  it('a word shows once recited (from the take’s start) or shown by hand', () => {
    expect(wordShown(A23 + 2, NOTHING_SHOWN, live(A23 + 3))).toBe(true);
    expect(wordShown(A23 + 4, NOTHING_SHOWN, live(A23 + 3))).toBe(false);
    expect(wordShown(A23 - 1, NOTHING_SHOWN, live(A23 + 3))).toBe(false);
    expect(wordShown(A23 + 4, new Set([A23 + 4]), live(A23 + 3))).toBe(true);
  });

  it('a take still looking for its start shows nothing it heard (start anywhere on the page)', () => {
    expect(wordShown(A23 + 2, NOTHING_SHOWN, { saidUpTo: A23 + 3, startWord: null })).toBe(false);
  });

  it('after a start mid-page, ‹ looks from the start: the words before it aren’t what comes next', () => {
    const a25 = words.verseFirstWord(27, 25);
    const fromMid = { saidUpTo: null, startWord: a25 };
    expect(nextHiddenWord(words, 379, NOTHING_SHOWN, fromMid)).toBe(a25);
    // Before the start is found, and on a page the start isn't on: from the page's top.
    expect(nextHiddenWord(words, 379, NOTHING_SHOWN, { saidUpTo: null, startWord: null })).toBe(A23);
    expect(nextHiddenWord(words, 380, NOTHING_SHOWN, fromMid)).toBe(words.pageRange(380)[0]);
  });

  it('‹ shows the next hidden word, again and again', () => {
    let r = revealNextWord(words, 379, NOTHING_SHOWN, live(A23 + 3));
    expect([...r]).toEqual([A23 + 4]);
    r = revealNextWord(words, 379, r, live(A23 + 3));
    expect([...r]).toEqual([A23 + 4, A23 + 5]);
    // Not reciting: from the top of the page.
    expect([...revealNextWord(words, 379, NOTHING_SHOWN, live(null))]).toEqual([words.pageRange(379)[0]]);
  });

  it('‹‹ shows the whole ayah the next hidden word is in; a tap on a verse shows that verse', () => {
    const r = revealAyah(words, 379, NOTHING_SHOWN, live(A23 + 3));
    const [from, to] = words.verseRange(27, 23);
    expect([...r].sort((a, b) => a - b)).toEqual(Array.from({ length: to - from }, (_, i) => from + i));
    const v = revealAyah(words, 379, NOTHING_SHOWN, live(null), { sura: 27, ayah: 25 });
    expect([...v].every((w) => words.ref(w).ayah === 25)).toBe(true);
  });

  it('a page fully shown has no next word; the overlay follows the reciter', () => {
    const [from, to] = words.pageRange(379);
    const all = new Set(Array.from({ length: to - from }, (_, i) => from + i));
    expect(nextHiddenWord(words, 379, all, live(null))).toBeNull();
    expect(revealNextWord(words, 379, all, live(null))).toBe(all);
    const f = hiddenFollow(words, NOTHING_SHOWN, live(A23 + 3, A23 + 4));
    expect([f.shown(A23 + 3), f.shown(A23 + 4), f.next]).toEqual([true, false, A23 + 4]);
  });
});
