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
});
