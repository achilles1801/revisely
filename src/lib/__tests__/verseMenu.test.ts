import { menuPosition } from '../verseMenu';

const screen = { width: 390, height: 844 };

describe('menuPosition', () => {
  it('opens below the press, centred on it', () => {
    expect(menuPosition({ x: 200, y: 300 }, screen)).toEqual({ left: 75, top: 316 });
  });

  it('opens above when there is no room below', () => {
    const { top } = menuPosition({ x: 200, y: 800 }, screen);
    expect(top).toBe(800 - 16 - 112);
  });

  it('stays inside the screen near the edges', () => {
    expect(menuPosition({ x: 5, y: 300 }, screen).left).toBe(16);
    expect(menuPosition({ x: 389, y: 300 }, screen).left).toBe(390 - 250 - 16);
    expect(menuPosition({ x: 200, y: 10 }, screen).top).toBeGreaterThanOrEqual(10);
  });

  it('a menu made taller by large text still opens fully on screen (it used to run off the bottom)', () => {
    const se = { width: 375, height: 667 };
    const tall = 190;
    // A press low on the page: above it, by its real height.
    const low = menuPosition({ x: 187, y: 560 }, se, 60, 40, tall);
    expect(low.top).toBe(560 - 16 - tall);
    expect(low.top + tall).toBeLessThanOrEqual(667 - 40);
    // A press in the middle with room on neither side: as low as it fits.
    const mid = menuPosition({ x: 187, y: 330 }, { width: 375, height: 500 }, 60, 40, 300);
    expect(mid.top).toBe(500 - 40 - 300);
  });
});
