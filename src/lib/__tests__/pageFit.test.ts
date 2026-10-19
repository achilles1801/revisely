import { fitPage } from '../pageFit';
import { PAGE_IMAGE_ASPECT } from '../ayahBounds';

describe('fitPage', () => {
  it('fills the width when the page fits (large phones)', () => {
    const size = fitPage(440, 760); // 440 / 0.618 ≈ 712 tall
    expect(size.width).toBe(440);
    expect(size.height).toBeCloseTo(440 / PAGE_IMAGE_ASPECT);
    expect(size.scale).toBeCloseTo(440 / 1024);
  });

  it('shrinks to the height when there is not enough room (small phones, player showing)', () => {
    const size = fitPage(375, 520);
    expect(size.height).toBeLessThanOrEqual(520);
    expect(size.width).toBeLessThan(375);
    expect(size.width / size.height).toBeCloseTo(PAGE_IMAGE_ASPECT, 2);
  });

  it('never exceeds either side, for any screen', () => {
    for (const [w, h] of [[320, 480], [375, 600], [393, 640], [430, 800], [402, 500]]) {
      const size = fitPage(w, h);
      expect(size.width).toBeLessThanOrEqual(w);
      expect(size.height).toBeLessThanOrEqual(h + 0.01);
    }
  });

  it('falls back to the full width before the height is known', () => {
    expect(fitPage(390, 0).width).toBe(390);
  });
});
