// The tour's clock (What's new 1.0.6, lib/whatsNew/tour): pure, so the slides' moves can be read here.
import { TOUR_MOMENTS } from '../../help/whatsNew';
import {
  CLIMB_TOPS,
  PHONE,
  SCREEN_AT,
  STAGE,
  TOUR_SECONDS,
  TOUR_SPEED,
  along,
  bump,
  climbCount,
  curve,
  easeBack,
  easeInOut,
  entering,
  onStage,
  seg,
  tourLength,
} from '../tour';
import { MOMENT_SPEED } from '../revoMoment';

describe("the tour's clock", () => {
  it("every slide has a length, played at Revo's introduction's pace: the film is about a minute and a half", () => {
    for (const m of TOUR_MOMENTS) expect(TOUR_SECONDS[m]).toBeGreaterThan(5);
    expect(TOUR_SPEED).toBe(MOMENT_SPEED);
    const total = tourLength(TOUR_MOMENTS);
    expect(total).toBeGreaterThan(85);
    expect(total).toBeLessThan(110);
  });

  it('seg, the easings and bump stay within 0 to 1 and land on their ends', () => {
    expect(seg(0, 1, 2)).toBe(0);
    expect(seg(1.5, 1, 2)).toBe(0.5);
    expect(seg(3, 1, 2)).toBe(1);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeBack(1)).toBeCloseTo(1);
    expect(bump(0)).toBe(0);
    expect(bump(0.5)).toBeCloseTo(1);
    expect(bump(1)).toBe(0);
  });

  it('along holds before its first key and after its last, and passes through each', () => {
    const keys = [1, 1, 2, 2, 3, 1];
    expect(along(0, keys)).toBe(1);
    expect(along(2, keys)).toBe(2);
    expect(along(5, keys)).toBe(1);
    expect(along(1.5, keys)).toBeCloseTo(1.5);
  });

  it('a curve starts and ends where it is asked to', () => {
    expect(curve([0, 0], [5, 10], [10, 0], 0)).toEqual([0, 0]);
    expect(curve([0, 0], [5, 10], [10, 0], 1)).toEqual([10, 0]);
  });

  it('a screen grows in over its first 0.7 s, then rests', () => {
    expect(entering(0).opacity).toBe(0);
    expect(entering(0.7)).toEqual({ scale: 1, dy: 0, opacity: 1 });
  });

  it("a screen at rest fits the stage, and a point of the phone maps onto it (the camera's centre stays put)", () => {
    const [x0, y0] = onStage(0, 0);
    const [x1, y1] = onStage(PHONE.width, PHONE.height);
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(STAGE.width);
    expect(y0).toBe(SCREEN_AT.top);
    expect(y1).toBeLessThanOrEqual(STAGE.height);
    expect(onStage(390, 830, SCREEN_AT.scale, SCREEN_AT.top, 2, 390, 830)).toEqual(onStage(390, 830));
  });

  it('the badge climb counts from one tier to the next on a log scale, and stops at 100,000', () => {
    expect(climbCount(0, 0)).toBe(CLIMB_TOPS[0]);
    expect(climbCount(0, 1)).toBe(CLIMB_TOPS[1]);
    const mid = climbCount(2, 0.5);
    expect(mid).toBeGreaterThan(CLIMB_TOPS[2]);
    expect(mid).toBeLessThan(CLIMB_TOPS[3]);
    expect(climbCount(5, 0.4)).toBe(100000);
  });
});
