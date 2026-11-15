import { quranWords } from '../../recite/__fixtures__/quranWords';
import { ayahBand, currentLineBand, wordBox } from '../geometry';

const words = quranWords();

describe('the band behind a live take: the line being recited only (Majd, Nov 15 2026)', () => {
  it('is the ayah’s part of the word’s line, never the lines to come', () => {
    // An-Naml 23 runs over more than one line of page 379; its first word is on the first.
    const w = words.verseFirstWord(27, 23);
    const page = words.pageOf(w);
    const all = ayahBand(page, 27, 23);
    expect(all.length).toBeGreaterThan(1);
    const line = currentLineBand(words, page, w)!;
    expect(all).toContainEqual(line);
    const box = wordBox(words, w);
    expect(line.y0).toBeLessThanOrEqual(box.y0);
    expect(line.y1).toBeGreaterThanOrEqual(box.y1);
    // A word on the ayah's next line: that line's band, a different one.
    let next = w;
    while (words.lineOf(next) === words.lineOf(w)) next++;
    expect(currentLineBand(words, page, next)).not.toEqual(line);
  });

  it('nothing for a word on another page', () => {
    const w = words.verseFirstWord(27, 23);
    expect(currentLineBand(words, words.pageOf(w) + 1, w)).toBeNull();
  });
});
