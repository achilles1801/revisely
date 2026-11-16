import { clearedLine, dayWords, kindsLine, passageName, scoreLine, similarNote, similarTitle, slipNote, weeksSpoken } from '../describe';
import { NO_KINDS, type SimilarSlip, type SlippingPassage } from '../insights';
import { plainText } from '../../passages';

const TODAY = '2026-11-16'; // a Monday

const passage = (over: Partial<SlippingPassage> = {}): SlippingPassage => ({
  sura: 18,
  from: 22,
  to: 23,
  words: [
    { w: 1, group: 'word', kind: 'word', ayah: [18, 22] },
    { w: 2, group: 'slip', kind: 'harakat', ayah: [18, 23] },
  ],
  wordMistakes: 1,
  wrong: 3,
  tries: 4,
  lastDay: '2026-11-14',
  ...over,
});

const similar = (over: Partial<SimilarSlip> = {}): SimilarSlip => ({ from: [2, 48], into: [2, 123], ending: false, times: 2, lastDay: '2026-11-14', also: 0, ...over });

describe('Recite insights in words', () => {
  it('says days as people do', () => {
    expect(dayWords(TODAY, TODAY)).toBe('today');
    expect(dayWords('2026-11-15', TODAY)).toBe('yesterday');
    expect(dayWords('2026-11-14', TODAY)).toBe('Saturday');
    expect(dayWords('2026-11-04', TODAY)).toBe('12 days ago');
  });

  it('names passages by surah and ayahs, never pages', () => {
    expect(plainText(passageName(18, 22, 23))).toBe('Al-Kahf, ayahs 22–23');
    expect(plainText(passageName(2, 48, 48))).toBe('Al-Baqarah, ayah 48');
  });

  it('the figure’s line says how the score moved, or that there were no takes', () => {
    expect(scoreLine({ takes: 14, score: 0.986, earlierScore: 0.972 }, 'in 30 days')).toBe('14 takes · up from 97.2%');
    expect(scoreLine({ takes: 1, score: 0.95, earlierScore: 0.972 }, 'in 30 days')).toBe('1 take · down from 97.2%');
    expect(scoreLine({ takes: 3, score: 0.98, earlierScore: null }, 'in 30 days')).toBe('3 takes');
    expect(scoreLine({ takes: 2, score: 0.9801, earlierScore: 0.9809 }, 'in 30 days')).toBe('2 takes · the same as before');
    expect(scoreLine({ takes: 0, score: null, earlierScore: 0.97 }, 'in 7 days')).toBe('No takes in 7 days');
  });

  it('a passage says how often it went wrong with Smart Tracking on, and when it was last recited with it off', () => {
    expect(slipNote(passage(), true, TODAY)).toBe('2 words still marked · wrong in 3 of 4 takes');
    expect(slipNote(passage(), false, TODAY)).toBe('2 words still marked · last recited Saturday');
    expect(slipNote(passage({ words: [passage().words[0]], wrong: 1, tries: 1 }), true, TODAY)).toBe('1 word still marked · wrong in 1 of 1 take');
  });

  it('a similar ayah names where it went, surah first', () => {
    expect(plainText(similarTitle(similar()))).toBe('Al-Baqarah 48 → 123');
    expect(plainText(similarTitle(similar({ into: [3, 7] })))).toBe("Al-Baqarah 48 → Ali 'Imran 7");
    expect(similarNote(similar(), TODAY)).toBe('You went on with the similar ayah · twice, last on Saturday');
    expect(similarNote(similar({ times: 1, lastDay: TODAY }), TODAY)).toBe('You went on with the similar ayah · today');
    const ending = similar({ from: [113, 3], into: [113, 5], ending: true, times: 1, lastDay: '2026-11-15' });
    expect(plainText(similarTitle(ending))).toBe('Al-Falaq 3');
    expect(plainText(similarNote(ending, TODAY))).toBe('You ended it as ayah 5 ends · yesterday');
  });

  it('the kinds come words first, and Not clear and tajweed are never counted as mistakes', () => {
    const base = { mistakes: 12, unclear: 4, tajweed: 0, strictTakes: 0 };
    expect(kindsLine({ ...base, kinds: { ...NO_KINDS, wrong: 7, skipped: 3, harakat: 2 } })).toBe(
      'Mostly words: 7 wrong · 3 skipped · 2 harakat. 4 weren’t clear enough to check (not counted).',
    );
    expect(kindsLine({ ...base, mistakes: 3, unclear: 0, kinds: { ...NO_KINDS, wrong: 1, harakat: 2 } })).toBe('Mostly harakat and letters: 1 wrong · 2 harakat.');
    expect(kindsLine({ ...base, mistakes: 2, unclear: 1, kinds: { ...NO_KINDS, letter: 2 } })).toBe(
      'Harakat and letters: 2 letters. 1 wasn’t clear enough to check (not counted).',
    );
    expect(kindsLine({ mistakes: 0, unclear: 0, tajweed: 2, strictTakes: 1, kinds: NO_KINDS })).toBe('No mistakes. 2 tajweed notes.');
    // Tajweed notes only from Strict takes.
    expect(kindsLine({ mistakes: 0, unclear: 0, tajweed: 2, strictTakes: 0, kinds: NO_KINDS })).toBe('No mistakes.');
  });

  it('cleared words and the weeks for a screen reader', () => {
    expect(clearedLine(6)).toBe('6 words cleared · said right on 2 different days');
    expect(clearedLine(0)).toBeNull();
    expect(weeksSpoken([{ score: 0.969 }, { score: null }, { score: 0.989 }])).toBe('Score by week: 96.9%, no takes, this week 98.9%');
  });
});
