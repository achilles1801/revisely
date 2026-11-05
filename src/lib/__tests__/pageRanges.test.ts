import {
  describePageRuns,
  describeRevised,
  describeSurahRuns,
  describeSurahs,
  juzRunLabel,
  pageRuns,
  wholeJuzRun,
} from '../pageRanges';
import { getPagesForJuz } from '../quranData';

describe('describeRevised: a session of whole juz on the juz plan reads "Juz N"', () => {
  const juz = (n: number) => getPagesForJuz(n);
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  it('one whole juz', () => {
    expect(wholeJuzRun(juz(1))).toEqual({ first: 1, last: 1 });
    expect(describeRevised(juz(1), { juzPlan: true })).toBe('Juz 1');
    expect(describeRevised(juz(30), { juzPlan: true })).toBe('Juz 30');
  });

  it('whole juz in a row: "Juz 1–2", in any order, each page once', () => {
    const pages = [...juz(2), ...juz(1), ...juz(1).slice(0, 3)];
    expect(wholeJuzRun(pages)).toEqual({ first: 1, last: 2 });
    expect(describeRevised(pages, { juzPlan: true })).toBe('Juz 1–2');
    expect(juzRunLabel({ first: 28, last: 30 })).toBe('Juz 28–30');
  });

  it('part of a juz keeps the surahs', () => {
    expect(wholeJuzRun(range(1, 20))).toBeNull();
    expect(describeRevised(range(1, 20), { juzPlan: true })).toBe(describeSurahRuns(pageRuns(range(1, 20))));
  });

  it('a juz with one page not revised keeps the surahs, though the session was the whole juz', () => {
    const revised = juz(2).filter((p) => p !== 30);
    expect(describeRevised(juz(2), { juzPlan: true, revised })).toBe('Al-Baqarah');
  });

  it('whole juz with other pages besides, or not in a row, keep the surahs', () => {
    expect(wholeJuzRun([...juz(1), 42])).toBeNull();
    expect(wholeJuzRun([...juz(1), ...juz(3)])).toBeNull();
    expect(describeRevised([...juz(1), 42], { juzPlan: true })).toBe(describeSurahRuns(pageRuns([...juz(1), 42])));
  });

  it('on any other plan, the surahs, even for a whole juz', () => {
    expect(describeRevised(juz(1))).toBe('Al-Fatihah to Al-Baqarah');
    expect(describeRevised(juz(1), { juzPlan: false })).toBe('Al-Fatihah to Al-Baqarah');
  });

  it('no pages, or pages outside the mushaf: no juz', () => {
    expect(wholeJuzRun([])).toBeNull();
    expect(wholeJuzRun([0, 605])).toBeNull();
  });
});

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
