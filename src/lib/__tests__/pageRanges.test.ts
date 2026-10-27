import { describePageRuns, describeSurahRuns, describeSurahs, pageRuns } from '../pageRanges';
import { getPagesForJuz } from '../quranData';

describe('pageRanges: pages in a reader’s words', () => {
  it('joins consecutive pages and drops repeats and impossible ones', () => {
    expect(pageRuns([3, 1, 2, 2, 7, 0, 605])).toEqual([
      { first: 1, last: 3 },
      { first: 7, last: 7 },
    ]);
  });

  it('says pages as ranges, never "Juz 27 + 1 more"', () => {
    expect(describePageRuns(pageRuns([5]))).toBe('Page 5');
    expect(describePageRuns(pageRuns([537, 538, 539]))).toBe('Pages 537–539');
    expect(describePageRuns(pageRuns([1, 2, 3, 7, 20, 21, 22]))).toBe('Pages 1–3, 7 and 20–22');
    expect(describePageRuns(pageRuns([1, 3, 5, 7, 9]))).toBe('Pages 1, 3 and 3 more ranges');
  });

  it('names the surahs a range covers', () => {
    expect(describeSurahs({ first: 1, last: 1 })).toBe('Al-Fatihah');
    // Juz 30 starts in An-Naba and ends with An-Nas.
    const juz30 = getPagesForJuz(30);
    expect(describeSurahs({ first: juz30[0], last: juz30[juz30.length - 1] })).toBe('An-Naba to An-Nas');
    expect(describeSurahRuns(pageRuns([1, 2, 582, 583]))).toBe("Al-Fatihah to Al-Baqarah · An-Naba to An-Nazi'at"); // 583 begins An-Nazi'at
  });
});
