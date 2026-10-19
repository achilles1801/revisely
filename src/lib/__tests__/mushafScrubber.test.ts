import {
  MUSHAF_PAGE_COUNT,
  pageAtPosition,
  positionOfPage,
  scrubberPreview,
} from '../mushafScrubber';

describe('pageAtPosition (right-to-left track)', () => {
  const W = 300;

  it('puts page 1 at the right end and the last page at the left end', () => {
    expect(pageAtPosition(W, W)).toBe(1);
    expect(pageAtPosition(0, W)).toBe(MUSHAF_PAGE_COUNT);
  });

  it('puts the middle of the mushaf in the middle of the track', () => {
    expect(pageAtPosition(W / 2, W)).toBe(303); // 1 + round(0.5 * 603)
  });

  it('clamps points past either end', () => {
    expect(pageAtPosition(W + 50, W)).toBe(1);
    expect(pageAtPosition(-50, W)).toBe(MUSHAF_PAGE_COUNT);
  });

  it('is page 1 before the track has a width or for a bad point', () => {
    expect(pageAtPosition(10, 0)).toBe(1);
    expect(pageAtPosition(10, -5)).toBe(1);
    expect(pageAtPosition(NaN, W)).toBe(1);
  });

  it('handles tiny page sets', () => {
    expect(pageAtPosition(0, W, 1)).toBe(1);
    expect(pageAtPosition(0, W, 2)).toBe(2);
    expect(pageAtPosition(W, W, 2)).toBe(1);
  });
});

describe('positionOfPage', () => {
  const W = 300;

  it('is the inverse of pageAtPosition for every page', () => {
    for (let p = 1; p <= MUSHAF_PAGE_COUNT; p++) {
      expect(pageAtPosition(positionOfPage(p, W), W)).toBe(p);
    }
  });

  it('places the ends and clamps out-of-range pages', () => {
    expect(positionOfPage(1, W)).toBe(W);
    expect(positionOfPage(MUSHAF_PAGE_COUNT, W)).toBe(0);
    expect(positionOfPage(0, W)).toBe(W);
    expect(positionOfPage(9999, W)).toBe(0);
  });

  it('is 0 without a width', () => {
    expect(positionOfPage(100, 0)).toBe(0);
  });

  it('moves left as pages advance', () => {
    expect(positionOfPage(2, W)).toBeLessThan(positionOfPage(1, W));
    expect(positionOfPage(500, W)).toBeLessThan(positionOfPage(100, W));
  });
});

describe('scrubberPreview', () => {
  it('names the surah and juz of a page', () => {
    expect(scrubberPreview(294)).toEqual({ page: 294, surahs: 'Al-Kahf', juz: 15 });
    expect(scrubberPreview(1).surahs).toBe('Al-Fatihah');
    expect(scrubberPreview(604).juz).toBe(30);
  });

  it('names every surah on a shared page', () => {
    expect(scrubberPreview(293).surahs).toBe('Al-Isra / Al-Kahf');
    expect(scrubberPreview(604).surahs.split(' / ').length).toBeGreaterThan(1);
  });

  it('clamps and rounds the page', () => {
    expect(scrubberPreview(0).page).toBe(1);
    expect(scrubberPreview(700).page).toBe(604);
    expect(scrubberPreview(2.4).page).toBe(2);
  });
});
