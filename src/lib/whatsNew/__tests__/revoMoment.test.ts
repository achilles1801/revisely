import {
  MOMENT_BEATS_P,
  MOMENT_DURATION,
  MOMENT_END_P,
  MOMENT_HAPTICS,
  MOMENT_ORBIT,
  MOMENT_QUESTIONS,
  MOMENT_SPEED,
  MOMENT_STILLS_P,
  MOMENT_WEEK,
  MOMENT_WORDS,
  QUESTION_TIMES_P,
  STILL_FADE,
  STILL_HOLD,
  STILLS_DURATION,
  hapticsCrossed,
  momentFrame,
  momentLayout,
  momentLength,
  stillFade,
  typedState,
} from '../revoMoment';
import { R_TRACE, tracePath } from '../../../components/whatsNew/rTrace';
import { R_PATH } from '../../../components/revo/rMarkPath';

describe("Revo's moment, at Majd's speed", () => {
  it('plays the prototype at three quarters of its speed: about 19 seconds', () => {
    expect(MOMENT_SPEED).toBe(0.75);
    expect(MOMENT_DURATION).toBeCloseTo(19.2, 5);
    expect(momentFrame(0, false)).toBe(0);
    expect(momentFrame(4, false)).toBeCloseTo(3, 5);
    expect(momentFrame(MOMENT_DURATION, false)).toBeCloseTo(MOMENT_END_P, 5);
    expect(momentFrame(MOMENT_DURATION + 5, false)).toBe(MOMENT_END_P);
    expect(momentLength(false)).toBe(MOMENT_DURATION);
  });

  it('moves every haptic with its beat, inside the moment, in order', () => {
    expect(MOMENT_HAPTICS).toHaveLength(MOMENT_BEATS_P.length);
    MOMENT_HAPTICS.forEach((h, i) => {
      expect(h).toBeCloseTo(MOMENT_BEATS_P[i] / MOMENT_SPEED, 5);
      expect(h).toBeLessThan(MOMENT_DURATION);
      if (i > 0) expect(h).toBeGreaterThan(MOMENT_HAPTICS[i - 1]);
    });
    // Each question's start is a beat.
    for (const [start] of QUESTION_TIMES_P) expect(MOMENT_BEATS_P).toContain(start);
  });

  it('buzzes for a beat played through, never for a tap that skips to the end', () => {
    const h = MOMENT_HAPTICS[1];
    expect(hapticsCrossed(h - 0.016, h + 0.001)).toBe(1);
    expect(hapticsCrossed(h + 0.01, h + 0.03)).toBe(0);
    expect(hapticsCrossed(1, MOMENT_DURATION)).toBe(0);
    expect(hapticsCrossed(MOMENT_DURATION, 0)).toBe(0);
  });

  it('types each question in its own window, the next only once the last has gone', () => {
    QUESTION_TIMES_P.forEach(([s, e], i) => {
      expect(e).toBeGreaterThan(s);
      if (i > 0) expect(s).toBe(QUESTION_TIMES_P[i - 1][1]);
    });
    expect(typedState(4.7)).toEqual([0, 0, 0, 0]);
    const mid = typedState(4.95);
    expect(mid[0]).toBeGreaterThan(0);
    expect(mid[0]).toBeLessThan(MOMENT_QUESTIONS[0].length);
    expect(mid[0] % 1).toBe(0.5); // the caret
    // At the end everything is typed and no caret blinks.
    expect(typedState(MOMENT_END_P)).toEqual(MOMENT_QUESTIONS.map((q) => q.length));
  });

  it('under Reduce Motion holds each still, cross-fading, the end screen last', () => {
    expect(STILLS_DURATION).toBeCloseTo(MOMENT_STILLS_P.length * STILL_HOLD, 5);
    expect(momentLength(true)).toBe(STILLS_DURATION);
    MOMENT_STILLS_P.forEach((p, i) => {
      expect(momentFrame(i * STILL_HOLD + STILL_HOLD / 2, true)).toBe(p);
      expect(stillFade(i * STILL_HOLD + STILL_HOLD / 2, true)).toBe(1);
    });
    expect(MOMENT_STILLS_P[MOMENT_STILLS_P.length - 1]).toBe(MOMENT_END_P);
    // Fades in from nothing, out before the next, and the last one stays.
    expect(stillFade(0, true)).toBe(0);
    expect(stillFade(STILL_HOLD - 0.001, true)).toBeLessThan(0.01);
    expect(stillFade(STILLS_DURATION, true)).toBe(1);
    expect(STILL_FADE).toBeLessThan(STILL_HOLD / 4);
    // Without Reduce Motion nothing fades.
    expect(stillFade(3, false)).toBe(1);
  });

  it('says surahs and juz, never page numbers or strength, and its numbers are an example', () => {
    const words = [...MOMENT_QUESTIONS, ...MOMENT_ORBIT, ...Object.values(MOMENT_WORDS).flat()].join(' ');
    expect(words).not.toMatch(/\bp\.\s*\d|\bpages? \d/i);
    expect(words).not.toMatch(/\b(rat(e|ed|ing|ings)|strength|strong|weak)\b/i);
    expect(MOMENT_WORDS.example).toBe('Example');
    expect(MOMENT_WEEK).toHaveLength(7);
  });
});

describe("Revo's moment, laid out", () => {
  const phones = [
    { name: 'iPhone SE', w: 375, h: 667, top: 20, bottom: 0, tab: 66 },
    { name: 'iPhone 17 Pro', w: 402, h: 874, top: 62, bottom: 34, tab: 86 },
    { name: 'iPhone 17 Pro Max', w: 440, h: 956, top: 62, bottom: 34, tab: 86 },
  ];
  it.each(phones)('fits $name: the pictures and the choice above Revo’s button, the ring on screen', ({ w, h, top, bottom, tab }) => {
    const L = momentLayout(w, h, top, bottom, tab);
    expect(L.cx).toBe(w / 2);
    expect(L.button.x).toBe(w - 16 - 22);
    expect(L.button.y).toBe(h - tab - 14 - 22);
    // The mark's top place clears the status bar, the lowest picture (the juz line) is on screen, and
    // the end's step dots sit above the button (gone until then).
    expect(118 + L.oy - 30).toBeGreaterThanOrEqual(top);
    expect(590 + L.oy + 48).toBeLessThanOrEqual(h - bottom);
    expect(520 + L.oy + 8).toBeLessThan(L.button.y - 22);
    // The ring of questions stays between the top and the button.
    expect(400 + L.oy - L.orbitRy).toBeGreaterThanOrEqual(top);
    expect(L.questionWidth).toBeLessThanOrEqual(w - 52);
  });
});

describe("Revo's R, measured for the pen", () => {
  it('runs from the outline’s start to its end, evenly', () => {
    expect(R_TRACE.xs).toHaveLength(240);
    expect(R_TRACE.length).toBeGreaterThan(4000);
    expect(R_TRACE.xs[0]).toBeCloseTo(526.8, 1);
    expect(R_TRACE.ys[0]).toBeCloseTo(610.4, 1);
    // The outline closes where it began.
    expect(Math.hypot(R_TRACE.xs[239] - R_TRACE.xs[0], R_TRACE.ys[239] - R_TRACE.ys[0])).toBeLessThan(1);
    const step = R_TRACE.length / 239;
    for (let i = 1; i < 240; i++) {
      // A straight step is never longer than the stretch of outline it stands for.
      expect(Math.hypot(R_TRACE.xs[i] - R_TRACE.xs[i - 1], R_TRACE.ys[i] - R_TRACE.ys[i - 1])).toBeLessThanOrEqual(step + 0.2);
    }
  });

  it('measures a square the way it should', () => {
    const square = tracePath('M0 0C0 0 10 0 10 0C10 0 10 10 10 10C10 10 0 10 0 10Z', 5);
    expect(square.length).toBeCloseTo(40, 3);
    expect(square.xs).toEqual([0, 10, 10, 0, 0]);
    expect(square.ys).toEqual([0, 0, 10, 10, 0]);
    expect(tracePath(R_PATH).length).toBe(R_TRACE.length);
  });
});
