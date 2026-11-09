// The catch-up line on Home: one line, no guilt, the same words in VoiceOver.
import { catchUpLine } from '../todayLines';
import { plainText as plain } from '../passages';

const one = (pages: number[], ago: number, missed = true) => ({
  pages,
  from: {},
  days: [{ day: `d${ago}`, ago, missed }],
});

describe('catchUpLine', () => {
  it('nothing left over: no line', () => {
    expect(catchUpLine({ pages: [], from: {}, days: [] })).toBeNull();
  });

  it('a missed yesterday: "Missed yesterday · Revise At-Talaq to Al-Mulk" (its surahs, short)', () => {
    const got = catchUpLine(one([559, 560, 561, 562, 563], 1));
    expect(plain(got!.title)).toBe('Missed yesterday · Revise At-Talaq to Al-Mulk');
    expect(got?.label).toBe('Missed yesterday · Revise At-Talaq to Al-Mulk');
  });

  it('a page inside a surah names its ayahs; a surah\'s start or end says so', () => {
    expect(plain(catchUpLine(one([7], 1))!.title)).toBe('Missed yesterday · Revise Al-Baqarah 38–48');
    expect(catchUpLine(one([7], 1))?.label).toBe('Missed yesterday · Revise Al-Baqarah 38 to 48');
    expect(plain(catchUpLine(one([2, 3], 1))!.title)).toBe('Missed yesterday · Revise the start of Al-Baqarah');
    expect(plain(catchUpLine(one([48, 49], 1))!.title)).toBe('Missed yesterday · Revise the end of Al-Baqarah');
    expect(plain(catchUpLine(one([560, 561], 1))!.title)).toBe('Missed yesterday · Revise At-Tahrim');
  });

  it('two days back says how long ago', () => {
    expect(plain(catchUpLine(one([6, 7], 2))!.title)).toBe('Missed 2 days ago · Revise Al-Baqarah 30–48');
  });

  it('several missed days say how many, and name their pages as one passage', () => {
    const got = catchUpLine({
      pages: Array.from({ length: 15 }, (_, i) => 6 + i),
      from: {},
      days: [
        { day: 'd3', ago: 3, missed: true },
        { day: 'd2', ago: 2, missed: true },
        { day: 'd1', ago: 1, missed: true },
      ],
    });
    expect(plain(got!.title)).toBe('Missed 3 days · Revise Al-Baqarah 30–134');
  });

  it('a partly revised day reads "Left", not "Missed"', () => {
    expect(plain(catchUpLine(one([13, 14, 15], 1, false))!.title)).toBe('Left yesterday · Revise Al-Baqarah 84–101');
  });

  it('pages in two runs name both, in page order', () => {
    expect(plain(catchUpLine(one([6, 7, 1, 2], 1))!.title)).toBe(
      'Missed yesterday · Revise Al-Fatihah to Al-Baqarah and Al-Baqarah 30–48',
    );
  });

  it('more than two runs: the first, then how many more', () => {
    expect(plain(catchUpLine(one([1, 3, 5, 7], 1))!.title)).toBe('Missed yesterday · Revise Al-Fatihah and 3 more');
    expect(plain(catchUpLine(one([563, 559, 561], 1))!.title)).toBe('Missed yesterday · Revise the end of At-Talaq and 2 more');
  });

  it('never a page number', () => {
    for (const pages of [[559, 560], [7], [1, 3, 5, 7], [604]]) {
      expect(catchUpLine(one(pages, 1))!.title).not.toMatch(/\bpp?\.|\bpages? \d/i);
    }
  });
});
