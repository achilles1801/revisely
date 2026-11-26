// What's new 1.0.6, the tour (Majd, Nov 26 2026: one "ultimate" What's new, "out of this world in terms of animation";
// the orchestrator's picks: nine slides, two for the tafsir, Ramadan last). Each card is a slide that plays by itself
// (components/whatsNew/tour): a screen of the app floats in the middle, the camera moves over it, and what's new lifts
// off it and lands where it now lives; at the slide's end the screen eases up and its words rise. Boards and the
// playable preview: ~/Documents/revisely-whatsnew-mocks/ultimate/.
//
// This is its clock, kept pure so tests can read it. Every function here is a worklet: the slides call them on the UI
// thread from useAnimatedStyle, one clock (seconds) per slide, only transform and opacity.

import type { TourMoment } from '../help/whatsNew';

/** How long each slide plays before its words (seconds; about 70 s if each plays to its end). */
export const TOUR_SECONDS: Readonly<Record<TourMoment, number>> = {
  ask: 8.0,
  books: 8.0,
  revoSide: 7.5,
  reciteUp: 7.0,
  spot: 7.5,
  activityTab: 6.5,
  homeToday: 7.0,
  badges: 9.5,
  ramadan: 8.5,
};

/** The words coming in at a slide's end: the screen eases up as they rise (seconds). */
export const WORDS_IN = 0.7;

/**
 * The stage's design box (points): every slide draws in it, and it is scaled to fit the room between the top bar and
 * the dots. A screen of the app is drawn at a phone's 402 × 874 inside it.
 */
export const STAGE = { width: 402, height: 690 } as const;
export const PHONE = { width: 402, height: 874 } as const;
/** A screen at rest on the stage: its scale, and its top. */
export const SCREEN_AT = { scale: 0.74, top: 22 } as const;

/** 0 before `a`, 1 after `b`, straight between. */
export function seg(t: number, a: number, b: number): number {
  'worklet';
  if (b <= a) return t >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

export function lerp(a: number, b: number, u: number): number {
  'worklet';
  return a + (b - a) * u;
}

export function easeOut(u: number): number {
  'worklet';
  return 1 - Math.pow(1 - u, 3);
}

export function easeIn(u: number): number {
  'worklet';
  return u * u * u;
}

export function easeInOut(u: number): number {
  'worklet';
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Past its end and back: a pop, a landing. */
export function easeBack(u: number): number {
  'worklet';
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}

/** Up and down once over 0..1 (a pulse, a glint). */
export function bump(u: number): number {
  'worklet';
  return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u);
}

/**
 * A value along keyframes: `keys` is [t0, v0, t1, v1, …] (flat, so a worklet reads it), eased in and out between each
 * pair, held before the first and after the last.
 */
export function along(t: number, keys: readonly number[]): number {
  'worklet';
  if (t <= keys[0]) return keys[1];
  for (let i = 0; i + 3 < keys.length; i += 2) {
    if (t <= keys[i + 2]) return lerp(keys[i + 1], keys[i + 3], easeInOut(seg(t, keys[i], keys[i + 2])));
  }
  return keys[keys.length - 1];
}

/** A point on a quadratic curve from `a` to `b` bowed through `c`. */
export function curve(a: readonly [number, number], c: readonly [number, number], b: readonly [number, number], u: number): [number, number] {
  'worklet';
  const v = 1 - u;
  return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]];
}

/** The screen growing in at a slide's start: a little small, a little low, fading in (its first 0.7 s). */
export function entering(t: number): { scale: number; dy: number; opacity: number } {
  'worklet';
  const u = easeOut(seg(t, 0, 0.7));
  return { scale: 0.86 + 0.14 * u, dy: 34 * (1 - u), opacity: u };
}

/** Where a point of a screen's phone (x, y) is on the stage, for a screen at `scale` and `top`, the camera at `zoom` on (ox, oy). */
export function onStage(
  x: number,
  y: number,
  scale: number = SCREEN_AT.scale,
  top: number = SCREEN_AT.top,
  zoom = 1,
  ox: number = PHONE.width / 2,
  oy: number = PHONE.height / 2,
  dx = 0,
): [number, number] {
  'worklet';
  const left = (STAGE.width - PHONE.width * scale) / 2 + dx;
  return [left + (ox + (x - ox) * zoom) * scale, top + (oy + (y - oy) * zoom) * scale];
}

/**
 * The badge climb's count (slide 8): pages revised as the badge rises from tier `from` toward the next, `u` of the way,
 * rolling on a log scale between the two tiers' top milestones (50, 250, 1,000 … 100,000).
 */
export const CLIMB_TOPS = [50, 250, 1000, 5000, 25000, 100000] as const;
export function climbCount(tier: number, u: number): number {
  'worklet';
  const i = Math.max(0, Math.min(CLIMB_TOPS.length - 1, tier));
  if (i >= CLIMB_TOPS.length - 1) return CLIMB_TOPS[i];
  const v = Math.exp(lerp(Math.log(CLIMB_TOPS[i]), Math.log(CLIMB_TOPS[i + 1]), Math.min(1, Math.max(0, u))));
  return v >= 10000 ? Math.round(v / 50) * 50 : Math.round(v);
}

/** Total length of a tour of `moments`, each played to its end with its words (seconds). */
export function tourLength(moments: readonly TourMoment[]): number {
  return moments.reduce((sum, m) => sum + TOUR_SECONDS[m] + WORDS_IN, 0);
}
