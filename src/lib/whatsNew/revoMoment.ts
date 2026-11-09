// What's new, Revo's card as a moment: the R writes itself, four questions answer themselves, a ring
// of questions is drawn into Revo and Revo flies to its place on Home (Majd's pick of the prototype's
// "signature", Nov 8 2026: ~/Documents/revisely-today-mocks/whats-new/revo-intro/). Drawn by
// components/whatsNew/RevoMoment; this is its clock, words and layout, kept pure so tests can read them.
//
// Times are the prototype's (seconds at 1×). Majd chose ¾ of its speed ("1x is too fast and .5x is
// too slow"), so the phone's clock is a prototype time divided by MOMENT_SPEED: 14.4 s become 19.2 s.
// Every beat, stroke, type-in and hold moves together, haptics with them.

export const MOMENT_SPEED = 0.75;

/** The prototype's last frame (its end screen settled). */
export const MOMENT_END_P = 14.4;
/** When the end screen starts to come in (prototype seconds). */
export const MOMENT_CHOICE_P = 13.75;
/** On the phone: about 19 s. */
export const MOMENT_DURATION = MOMENT_END_P / MOMENT_SPEED;

/** A light haptic on each beat: the R floods, each question, the ring drawn in, Revo landing. */
export const MOMENT_BEATS_P = [2.6, 4.8, 6.35, 7.9, 9.45, 12.4, 13.4] as const;
export const MOMENT_HAPTICS = MOMENT_BEATS_P.map((p) => p / MOMENT_SPEED);

/**
 * Watch again takes Skip's place in the top corner only this long after the end: a quick second tap on
 * Skip (or Maestro's retried tap) never starts the moment over.
 */
export const AGAIN_AFTER_MS = 800;

/** Reduce Motion: these frames as stills, each held, cross-fading (the end screen last). */
export const MOMENT_STILLS_P = [4.1, 6.2, 7.75, 9.3, 10.7, 11.9, MOMENT_END_P] as const;
export const STILL_HOLD = 2.6 / MOMENT_SPEED;
export const STILL_FADE = 0.45 / MOMENT_SPEED;
export const STILLS_DURATION = MOMENT_STILLS_P.length * STILL_HOLD;

/** The questions, typed in big type, and when each is on screen (prototype seconds). */
export const MOMENT_QUESTIONS = [
  'How was my week?',
  'What should I revise first?',
  'How do I log revision from the masjid?',
  'How did today go?',
] as const;
export const QUESTION_TIMES_P: readonly (readonly [number, number])[] = [
  [4.8, 6.35],
  [6.35, 7.9],
  [7.9, 9.45],
  [9.45, 10.9],
];

/** The ring of things people ask, drawn into Revo. */
export const MOMENT_ORBIT = [
  'What should I revise first?',
  'Plan my week',
  'When did I last revise Al-Mulk?',
  'How does the streak work?',
  'What did I memorize in October?',
  'Make tomorrow lighter',
  'Compare Juz 29 and 30',
  'Where’s the Qibla?',
  'How do I set prayer times?',
  'Show my month',
] as const;

/** An example week, Sunday to Saturday (marked "Example" on screen: no account's own numbers). */
export const MOMENT_WEEK = [8, 6, 9, 0, 14, 7, 8] as const;
export const MOMENT_WEEK_MAX = 14;
export const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
/** The example's 30 juz, each a share of the accent; Juz 29 is the one to start with. */
export const JUZ_SHADE = [0.35, 0.55, 0.3, 0.7, 0.45, 0.6, 0.25, 0.5, 0.8, 0.4, 0.65, 0.3, 0.55, 0.75, 0.45, 0.6, 0.35, 0.7, 0.5, 0.85, 0.4, 0.6, 0.9, 0.55, 0.7, 0.8, 0.95, 0.6, 1, 0.9] as const;
export const FIRST_JUZ = 29;

export const MOMENT_WORDS = {
  wordmark: 'Revo',
  tagline: 'Your revision coach, inside Revisely.',
  example: 'Example',
  juzLead: 'Start with ',
  juzName: `Juz ${FIRST_JUZ}`,
  juzTail: '. It’s been 12 days.',
  crumbs: ['Activity', 'Today'],
  logLine: 'It counts toward today and your streak.',
  dayTitle: 'Your day in review',
  dayLine: 'Every evening, a short look back',
  hereTitle: 'Always here',
  hereLine: 'on the main screens',
  /** The top corner's button while it plays: the one way to its end (a touch elsewhere does nothing). */
  skip: 'Skip',
  turnOn: 'Turn on Revo',
  later: 'Later',
  next: 'Next',
  done: 'Done',
  again: 'Watch again',
  /** VoiceOver's one line, read for the end screen's words. */
  summary:
    'Revo is Revisely’s AI assistant. Ask about your revision, or how anything in the app works. It’s at the bottom right of the main screens.',
} as const;

// ------------------------------------------------------------------ easing (worklets)

export function seg(t: number, a: number, b: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}
export function lerp(a: number, b: number, k: number): number {
  'worklet';
  return a + (b - a) * k;
}
/** Ease out (cubic). */
export function eo(x: number): number {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
}
/** Ease in and out (cubic). */
export function eio(x: number): number {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
/** Ease out with a little overshoot. */
export function back(x: number): number {
  'worklet';
  if (x <= 0) return 0;
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// ------------------------------------------------------------------ the clock

/**
 * The prototype time to draw for a clock reading (real seconds). Under Reduce Motion the clock runs
 * through the stills instead: each still's frame, held.
 */
export function momentFrame(clock: number, still: boolean): number {
  'worklet';
  if (!still) return Math.min(MOMENT_END_P, Math.max(0, clock * MOMENT_SPEED));
  const i = Math.min(MOMENT_STILLS_P.length - 1, Math.max(0, Math.floor(clock / STILL_HOLD)));
  return MOMENT_STILLS_P[i];
}

/** How much of a still shows (it fades in, holds, and fades out unless it is the last). 1 without Reduce Motion. */
export function stillFade(clock: number, still: boolean): number {
  'worklet';
  if (!still) return 1;
  const i = Math.min(MOMENT_STILLS_P.length - 1, Math.max(0, Math.floor(clock / STILL_HOLD)));
  const local = clock - i * STILL_HOLD;
  const fadeIn = Math.min(1, Math.max(0, local / STILL_FADE));
  if (i === MOMENT_STILLS_P.length - 1) return fadeIn;
  return Math.min(fadeIn, Math.min(1, Math.max(0, (STILL_HOLD - local) / STILL_FADE)));
}

/** How long the clock runs: the moment, or its stills. */
export function momentLength(still: boolean): number {
  return still ? STILLS_DURATION : MOMENT_DURATION;
}

/** Each question's typing: how much of it shows, a half added while its caret blinks. */
export function typedState(p: number): number[] {
  'worklet';
  const out: number[] = [];
  for (let i = 0; i < MOMENT_QUESTIONS.length; i++) {
    const text = MOMENT_QUESTIONS[i];
    const s = QUESTION_TIMES_P[i][0];
    const typeFor = Math.min(0.85, text.length * 0.024);
    const n = Math.floor(seg(p, s + 0.05, s + 0.05 + typeFor) * text.length);
    const caret = p >= s && p < s + typeFor + 0.35 ? 0.5 : 0;
    out.push(n + caret);
  }
  return out;
}

/** The haptics the clock passed going from `prev` to `now`: none for a jump (a skip, Watch again). */
export function hapticsCrossed(prev: number, now: number): number {
  'worklet';
  if (now - prev > 0.5 || now < prev) return 0;
  let n = 0;
  for (let i = 0; i < MOMENT_HAPTICS.length; i++) if (prev < MOMENT_HAPTICS[i] && now >= MOMENT_HAPTICS[i]) n++;
  return n;
}

// ------------------------------------------------------------------ layout

/** The prototype's phone: its safe top, and the height its content was laid out in. */
const PROTO_TOP = 54;
const PROTO_ROOM = 786;

export interface MomentLayout {
  width: number;
  height: number;
  cx: number;
  /** Add to a prototype y: the prototype's frame moved under this phone's top, centred on tall ones. */
  oy: number;
  questionWidth: number;
  /** Revo's button on Home: its centre (MainNavigator's RevoHost). */
  button: { x: number; y: number };
  /** The ring's half-height, kept on screen. */
  orbitRy: number;
}

/**
 * Where things go on a screen `width` × `height` with safe-area insets `top` and `bottom`, the tab
 * bar `tabBar` high (useTabBarHeight) and Revo's button `buttonSize` across, `buttonGap` above it.
 */
export function momentLayout(width: number, height: number, top: number, bottom: number, tabBar: number, buttonSize = 44, buttonGap = 14): MomentLayout {
  const room = height - top - bottom;
  const oy = top - PROTO_TOP + Math.max(0, (room - PROTO_ROOM) * 0.35);
  const button = { x: width - 16 - buttonSize / 2, y: height - tabBar - buttonGap - buttonSize / 2 };
  const centre = 400 + oy;
  const orbitRy = Math.max(160, Math.min(250, centre - top - 60, button.y - 30 - centre));
  return { width, height, cx: width / 2, oy, questionWidth: Math.min(350, width - 52), button, orbitRy };
}
