import { MENU_GAP, MENU_MARGIN, placeMenu, unionBox } from '../menuPlacement';

// An iPhone 17 Pro Max in points, and a 248 × 190 menu.
const screen = { width: 440, height: 956 };
const insets = { top: 62, bottom: 34, left: 0, right: 0 };
const menu = { width: 248, height: 190 };

describe('placeMenu', () => {
  it('below the verse when there is room, growing from the finger’s side of its top edge', () => {
    const verse = { x: 20, y: 300, width: 400, height: 60 };
    const p = placeMenu({ menu, verse, point: { x: 200, y: 330 }, screen, insets });
    expect(p.side).toBe('below');
    expect(p.top).toBe(300 + 60 + MENU_GAP);
    expect(p.left).toBe(200 - 124);
    expect(p.origin).toEqual({ x: 124, y: 0 });
  });

  it('above it near the bottom of the page, growing from its bottom edge', () => {
    const verse = { x: 20, y: 760, width: 400, height: 80 };
    const p = placeMenu({ menu, verse, point: { x: 200, y: 800 }, screen, insets });
    expect(p.side).toBe('above');
    expect(p.top).toBe(760 - MENU_GAP - 190);
    expect(p.origin.y).toBe(190);
  });

  it('a verse too tall for either (2:282 fills a page): beside the finger, where there is more room', () => {
    const verse = { x: 20, y: 100, width: 400, height: 780 };
    const high = placeMenu({ menu, verse, point: { x: 200, y: 250 }, screen, insets });
    expect(high.side).toBe('beside');
    expect(high.top).toBeGreaterThan(250);
    const low = placeMenu({ menu, verse, point: { x: 200, y: 800 }, screen, insets });
    expect(low.top + menu.height).toBeLessThan(800);
  });

  it('never past the edges or into the safe areas', () => {
    const left = placeMenu({ menu, verse: null, point: { x: 5, y: 100 }, screen, insets });
    expect(left.left).toBe(MENU_MARGIN);
    expect(left.origin.x).toBe(0);
    const right = placeMenu({ menu, verse: null, point: { x: 438, y: 940 }, screen, insets });
    expect(right.left).toBe(440 - MENU_MARGIN - 248);
    expect(right.top + menu.height).toBeLessThanOrEqual(956 - 34 - MENU_MARGIN);
    const top = placeMenu({ menu, verse: null, point: { x: 200, y: 10 }, screen, insets });
    expect(top.top).toBeGreaterThanOrEqual(62 + MENU_MARGIN);
  });

  it('a screen narrower than the menu still starts at the margin', () => {
    const p = placeMenu({ menu, verse: null, point: { x: 100, y: 300 }, screen: { width: 200, height: 600 }, insets });
    expect(p.left).toBe(MENU_MARGIN);
  });
});

describe('unionBox', () => {
  it('the box around a verse’s lines', () => {
    expect(
      unionBox([
        { x: 300, y: 100, width: 100, height: 40 },
        { x: 20, y: 140, width: 380, height: 40 },
      ]),
    ).toEqual({ x: 20, y: 100, width: 380, height: 80 });
    expect(unionBox([])).toBeNull();
  });
});
