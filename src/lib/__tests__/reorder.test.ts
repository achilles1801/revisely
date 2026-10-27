import {
  FULL_SWIPE,
  autoScrollStep,
  moveItem,
  moveSlot,
  reconcileKeys,
  slotAt,
  swipeOutcome,
} from '../reorder';

describe('slotAt', () => {
  it('lands on the nearest slot, kept inside the list', () => {
    expect(slotAt(0, 60, 5)).toBe(0);
    expect(slotAt(29, 60, 5)).toBe(0);
    expect(slotAt(31, 60, 5)).toBe(1);
    expect(slotAt(-500, 60, 5)).toBe(0);
    expect(slotAt(10_000, 60, 5)).toBe(4);
  });

  it('has nowhere to go in an empty list', () => {
    expect(slotAt(100, 60, 0)).toBe(0);
    expect(slotAt(100, 0, 3)).toBe(0);
  });
});

describe('moveSlot', () => {
  const slots = { a: 0, b: 1, c: 2, d: 3 };

  it('moving down: the rows in between close up behind it', () => {
    expect(moveSlot(slots, 'a', 2)).toEqual({ a: 2, b: 0, c: 1, d: 3 });
  });

  it('moving up: the rows in between make room', () => {
    expect(moveSlot(slots, 'd', 1)).toEqual({ a: 0, b: 2, c: 3, d: 1 });
  });

  it('to the same slot, or for a row it does not know, nothing changes', () => {
    expect(moveSlot(slots, 'b', 1)).toBe(slots);
    expect(moveSlot(slots, 'z', 0)).toBe(slots);
  });

  it('always leaves one row per slot', () => {
    let s: Record<string, number> = slots;
    for (const [id, to] of [['a', 3], ['c', 0], ['d', 2], ['b', 3]] as const) {
      s = moveSlot(s, id, to);
      expect(Object.values(s).sort()).toEqual([0, 1, 2, 3]);
    }
  });
});

describe('autoScrollStep', () => {
  it('does not scroll away from the edges', () => {
    expect(autoScrollStep(400, 100, 800)).toBe(0);
  });

  it('scrolls up near the top and down near the bottom, faster the deeper in', () => {
    const shallowTop = autoScrollStep(160, 100, 800);
    const deepTop = autoScrollStep(105, 100, 800);
    expect(shallowTop).toBeLessThan(0);
    expect(deepTop).toBeLessThan(shallowTop);
    const shallowBottom = autoScrollStep(740, 100, 800);
    const deepBottom = autoScrollStep(799, 100, 800);
    expect(shallowBottom).toBeGreaterThan(0);
    expect(deepBottom).toBeGreaterThan(shallowBottom);
  });

  it('never goes past its top speed, even with the finger beyond the edge', () => {
    expect(autoScrollStep(0, 100, 800)).toBe(-14);
    expect(autoScrollStep(2000, 100, 800)).toBe(14);
  });

  it('does nothing when the visible area is unknown or tiny', () => {
    expect(autoScrollStep(50, 0, 0)).toBe(0);
    expect(autoScrollStep(50, 0, 100)).toBe(0);
  });
});

describe('swipeOutcome', () => {
  const W = 360;
  const A = 84;

  it('past half the row deletes on release', () => {
    expect(swipeOutcome(-W * FULL_SWIPE, 0, W, A)).toBe('delete');
    expect(swipeOutcome(-W, 0, W, A)).toBe('delete');
  });

  it('past half the button stays open on it', () => {
    expect(swipeOutcome(-A / 2, 0, W, A)).toBe('open');
    expect(swipeOutcome(-A - 20, 0, W, A)).toBe('open');
  });

  it('a short swipe closes again', () => {
    expect(swipeOutcome(-20, 0, W, A)).toBe('close');
    expect(swipeOutcome(0, 0, W, A)).toBe('close');
  });

  it('a fling left opens it, a fling right closes it', () => {
    expect(swipeOutcome(-20, -900, W, A)).toBe('open');
    expect(swipeOutcome(-A, 900, W, A)).toBe('close');
  });

  it('before the row is measured it never deletes', () => {
    expect(swipeOutcome(-300, 0, 0, A)).toBe('open');
  });
});

describe('reconcileKeys', () => {
  let n = 0;
  const make = () => `k${++n}`;
  beforeEach(() => {
    n = 0;
  });

  it('keeps every key when only what is on a day changed', () => {
    expect(reconcileKeys(['a', 'b'], [[1], [2]], [[1, 5], [2]], make)).toEqual(['a', 'b']);
  });

  it('a day added at the end (Add Rest Day) gets a new key, the rest keep theirs', () => {
    expect(reconcileKeys(['a', 'b'], [[1], [2]], [[1], [2], []], make)).toEqual(['a', 'b', 'k1']);
  });

  it('a day put back in the middle (Undo) gets a new key in its place', () => {
    expect(reconcileKeys(['a', 'c'], [[1], [3]], [[1], [2], [3]], make)).toEqual(['a', 'k1', 'c']);
  });

  it('a day removed takes its key with it', () => {
    expect(reconcileKeys(['a', 'b', 'c'], [[1], [2], [3]], [[1], [3]], make)).toEqual(['a', 'c']);
  });

  it('starts afresh when the change is not one day added or removed', () => {
    const fresh = (keys: string[]) => keys.every((k) => k.startsWith('k'));
    const one = reconcileKeys(['a', 'b', 'c'], [[1], [2], [3]], [[9]], make);
    expect(one).toHaveLength(1);
    expect(fresh(one)).toBe(true);
    const three = reconcileKeys(['a', 'b'], [[1], [2]], [[7], [8], [9]], make);
    expect(three).toHaveLength(3);
    expect(fresh(three)).toBe(true);
    // A day added that doesn't fit around the others: afresh too.
    expect(fresh(reconcileKeys(['a', 'b'], [[1], [2]], [[2], [3], [1]], make))).toBe(true);
  });

  it('with rest days next to each other, still keeps one key per day', () => {
    const next = reconcileKeys(['a', 'b', 'c'], [[1], [], []], [[1], [], [], []], make);
    expect(next).toHaveLength(4);
    expect(new Set(next).size).toBe(4);
  });
});

describe('moveItem', () => {
  it('moves an entry, clamping the target', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 5, 0)).toEqual(['a', 'b', 'c']);
  });
});
