// The design's tokens ("Revisely: Threads-style UI Migration"; CLAUDE.md,
// "The design"). The only place colours are written (noRawColours.test).
//
// - white (light) or black (dark) grounds, flat: no cards, no glass; the one
//   gradient is Home's glow (and the accent's progress fill);
// - content is a feed of rows on 0.5pt separators, with avatar-size marks;
// - an accent (Indigo by default, Crimson, Jade) is a token set below;
// - text pairs are checked against WCAG (src/design/__tests__): ≥ 4.5:1.
//
// `v2ThemeColors` gives the same palette under the older names (textPrimary,
// accent, …) that many screens read through useTheme().theme.

import { TextStyle } from 'react-native';

/**
 * The new design's accent (Settings → Appearance → Accent, kept with the
 * account). Indigo is the default; Crimson and Indigo put the accent on the
 * primary action, links, the active tab, "done", the calendar and a glow
 * behind Home's top; Jade keeps ink buttons and jade only for "done".
 */
export type AccentName = 'jade' | 'crimson' | 'indigo';
/** In the order Settings offers them. */
export const ACCENTS: AccentName[] = ['indigo', 'crimson', 'jade'];
export const ACCENT_LABELS: Record<AccentName, string> = { jade: 'Jade', crimson: 'Crimson', indigo: 'Indigo' };
/** For new installs and anyone who hasn't chosen. */
export const DEFAULT_ACCENT: AccentName = 'indigo';

/** A glow's colour stops, centre (offset 0) to edge (offset 1). */
export type HeroStops = readonly { offset: number; color: string; opacity: number }[];

/** What an accent sets. Every coloured thing in the new design reads one of these. */
interface AccentTokens {
  /** The primary action's fill (solid buttons, chosen pills, switches) and what's on it. */
  primary: string;
  onPrimary: string;
  /** "Done" fills (the check, a revised page) and the glyph on them. A fill, not a text colour. */
  done: string;
  onDone: string;
  /** "Done" as text (≥ 4.5:1 on every ground). */
  doneText: string;
  /** Text in the accent: the active tab, highlighted words (≥ 4.5:1 on every ground). */
  accentText: string;
  /** Text on an `accentText` fill (≥ 4.5:1). */
  onAccentText: string;
  /** Links ("See all"; ≥ 4.5:1). */
  link: string;
  /** A tinted ground (a selected row, a chip). */
  accentSubtle: string;
  /** Accent text on `accentSubtle` (≥ 4.5:1): the next prayer's row. */
  subtleText: string;
  /** The glow behind Home's Today post; null for none. */
  hero: HeroStops | null;
  /** A progress fill, start to end. */
  progress: readonly [string, string];
  /**
   * The memorized ring around Today's mark, start to end: `progress` where both
   * ends hold 3:1 on the ground, brighter starts in dark (its deep start would
   * vanish on black).
   */
  ring: readonly [string, string];
  /**
   * Activity's calendar: an empty day, then four steps of the accent, more
   * activity reading darker (light) or brighter (dark). Checked as an ordinal
   * ramp: one hue, monotone lightness, the first step ≥ 2:1 on the ground.
   */
  heat: readonly [string, string, string, string, string];
  /** A day's number on each `heat` step (≥ 4.5:1). */
  heatInk: readonly [string, string, string, string, string];
}

export interface PaletteV2 extends AccentTokens {
  accent: AccentName;
  /** Screen ground. */
  bg: string;
  text: string;
  /** Metadata, placeholders, inactive icons. */
  secondary: string;
  /** Hairlines between rows (0.5pt) and the thread line. */
  separator: string;
  /** A control's outline (an outline pill, an unchosen chip): firmer than the separator. */
  outline: string;
  /** Destructive actions and errors. */
  red: string;
  /**
   * A destructive action's fill (a swiped row's Delete) and the label on it
   * (≥ 4.5:1 in both modes). Not `red`: dark mode's red is light enough to
   * read on black, too light to carry white.
   */
  redFill: string;
  onRedFill: string;
  /**
   * Status "good" (a strong page, a positive figure): green whatever the
   * accent, as status colours never follow it (weak is `red`).
   */
  good: string;
  /** Marks, chips, the Cancel bar: a quiet fill on the ground. */
  fill: string;
  /** Sheets and menus. */
  sheet: string;
  /** A sheet's grab handle. */
  handle: string;
  /**
   * What hasn't been reached yet on a progress track or a recording's waveform
   * (the played part is `accentText`): ≥ 3:1 against every accent's
   * `accentText`, so played and unplayed tell apart.
   */
  track: string;
  /** Dimmed backdrop behind a sheet. */
  overlay: string;
  /** A floating menu's shadow (light only shows it; dark relies on the outline). */
  shadow: string;
  /** A switch that is off: its track, and the thumb on it (on, the track is `primary`). */
  switchOff: string;
  switchThumb: string;
}

type Base = Omit<PaletteV2, keyof AccentTokens | 'accent'>;

const BASE_LIGHT: Base = {
  bg: '#FFFFFF',
  text: '#1A1A1A',
  secondary: '#616977',
  separator: '#E5E7EB',
  outline: '#D1D5DB',
  red: '#DC2626',
  redFill: '#DC2626',
  onRedFill: '#FFFFFF',
  good: '#0E6B5A',
  fill: '#F7F7F8',
  sheet: '#FFFFFF',
  handle: '#D1D5DB',
  track: '#D1D5DB',
  overlay: 'rgba(0,0,0,0.4)',
  shadow: '#000000',
  switchOff: '#E5E7EB',
  switchThumb: '#FFFFFF',
};

const BASE_DARK: Base = {
  bg: '#000000',
  text: '#FFFFFF',
  secondary: '#8A8A93',
  separator: '#1F1F1F',
  outline: '#333333',
  red: '#F87171',
  redFill: '#DC2626',
  onRedFill: '#FFFFFF',
  good: '#4DBA9F',
  fill: '#181818',
  sheet: '#101010',
  handle: '#3A3A3C',
  track: '#333333',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
  switchOff: '#39393D',
  switchThumb: '#FFFFFF',
};

/**
 * How far Home's accent glow (v2/HeroGlow) reaches from the top of the screen.
 * In light it is a wide band behind the status bar and top bar, where text is
 * ink, and has all but faded by Home's first line of grey text (about 136pt
 * down: a radius offset of 0.65), so that text keeps 4.5:1. In dark, light text
 * keeps its contrast over the glow, so it spreads further.
 */
export const HERO_SHAPE = {
  light: { height: 340, rx: '130%' },
  dark: { height: 360, rx: '85%' },
} as const;

/** Where Home's first grey text sits in the light glow (about 136pt down; see HERO_SHAPE). */
export const HERO_FIRST_TEXT_OFFSET = 0.4;

/**
 * The light glow's stops: `top` opacity at the top, easing to nothing as
 * (1 − t)^2.8, so it reaches well past the header and fades out with no edge
 * (the curve ends flat). Faint enough by the first grey text (offset 0.4) for
 * 4.5:1 with every accent (design.test). It used to fade out just above the
 * hairline under the header, and the tinted header read as a box (Oct 28 2026).
 */
function lightGlow(color: string, top: number): HeroStops {
  return [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((offset) => ({
    offset,
    color,
    opacity: Math.round(top * (1 - offset) ** 2.8 * 10000) / 10000,
  }));
}

const ACCENT_TOKENS: Record<AccentName, { light: AccentTokens; dark: AccentTokens }> = {
  // As agreed: ink buttons and links in grey; jade only means "done".
  jade: {
    light: {
      primary: '#1A1A1A',
      onPrimary: '#FFFFFF',
      done: '#0E6B5A',
      onDone: '#FFFFFF',
      doneText: '#0E6B5A',
      accentText: '#1A1A1A',
      onAccentText: '#FFFFFF',
      link: '#616977',
      accentSubtle: '#EDEDEF',
      subtleText: '#1A1A1A',
      hero: lightGlow('#3FA084', 0.3),
      progress: ['#0E6B5A', '#0E6B5A'],
      ring: ['#0E6B5A', '#0E6B5A'],
      heat: ['#EBEDF0', '#79C2AA', '#3FA084', '#1A7D66', '#0B5A4A'],
      heatInk: ['#1A1A1A', '#1A1A1A', '#1A1A1A', '#FFFFFF', '#FFFFFF'],
    },
    dark: {
      primary: '#FFFFFF',
      onPrimary: '#000000',
      done: '#4DBA9F',
      onDone: '#000000',
      doneText: '#4DBA9F',
      accentText: '#FFFFFF',
      onAccentText: '#000000',
      link: '#8A8A93',
      accentSubtle: '#181818',
      subtleText: '#FFFFFF',
      hero: null,
      progress: ['#4DBA9F', '#4DBA9F'],
      ring: ['#4DBA9F', '#4DBA9F'],
      heat: ['#1C1C1E', '#0F4A3B', '#18735C', '#2A9C7F', '#5CD1B2'],
      heatInk: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#000000', '#000000'],
    },
  },
  // RedotPay, from colours sampled off its screens: #DC1433 for the action,
  // links and active state (white on it 5.0:1), deep wine #3E0812 / #33080E /
  // #2E0E15 for the glow, tints and an empty day. Text on dark is #F03C56, the
  // same hue made light enough for 4.5:1 on the darkest fill.
  crimson: {
    light: {
      primary: '#DC1433',
      onPrimary: '#FFFFFF',
      done: '#DC1433',
      onDone: '#FFFFFF',
      doneText: '#DC1433',
      accentText: '#DC1433',
      onAccentText: '#FFFFFF',
      link: '#DC1433',
      accentSubtle: '#FCE8EB',
      subtleText: '#B30F28',
      hero: lightGlow('#DC1433', 0.24),
      progress: ['#3E0812', '#DC1433'],
      ring: ['#3E0812', '#DC1433'],
      heat: ['#EBEDF0', '#F29AA7', '#E9637A', '#DC1433', '#7A0B1D'],
      heatInk: ['#1A1A1A', '#1A1A1A', '#1A1A1A', '#FFFFFF', '#FFFFFF'],
    },
    dark: {
      primary: '#DC1433',
      onPrimary: '#FFFFFF',
      done: '#DC1433',
      onDone: '#FFFFFF',
      doneText: '#F03C56',
      accentText: '#F03C56',
      onAccentText: '#000000',
      link: '#F03C56',
      accentSubtle: '#2E0E15',
      subtleText: '#F03C56',
      hero: [
        { offset: 0, color: '#3E0812', opacity: 1 },
        { offset: 0.5, color: '#33080E', opacity: 0.6 },
        { offset: 0.7, color: '#2E0E15', opacity: 0.27 },
        { offset: 0.85, color: '#2E0E15', opacity: 0.07 },
        { offset: 1, color: '#2E0E15', opacity: 0 },
      ],
      progress: ['#3E0812', '#DC1433'],
      ring: ['#DC1433', '#F03C56'],
      heat: ['#2E0E15', '#8A0E26', '#B3112C', '#DC1433', '#F5455E'],
      heatInk: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#000000'],
    },
  },
  // The real-estate app, from sampled colours: #624BD5 for the action (white
  // on it 6.0:1), electric #2E0EC6 and muted #3A2694 for the glow and strong
  // fills, lavender #9789DA for text on dark (#624BD5 there is 3.5:1).
  indigo: {
    light: {
      primary: '#624BD5',
      onPrimary: '#FFFFFF',
      done: '#624BD5',
      onDone: '#FFFFFF',
      doneText: '#624BD5',
      accentText: '#624BD5',
      onAccentText: '#FFFFFF',
      link: '#624BD5',
      accentSubtle: '#EFECFB',
      subtleText: '#624BD5',
      hero: lightGlow('#624BD5', 0.32),
      progress: ['#2E0EC6', '#9789DA'],
      ring: ['#2E0EC6', '#9789DA'],
      heat: ['#EBEDF0', '#9789DA', '#624BD5', '#2E0EC6', '#1F1170'],
      heatInk: ['#1A1A1A', '#1A1A1A', '#FFFFFF', '#FFFFFF', '#FFFFFF'],
    },
    dark: {
      primary: '#624BD5',
      onPrimary: '#FFFFFF',
      done: '#624BD5',
      onDone: '#FFFFFF',
      doneText: '#9789DA',
      accentText: '#9789DA',
      onAccentText: '#000000',
      link: '#9789DA',
      accentSubtle: '#16113A',
      subtleText: '#9789DA',
      hero: [
        { offset: 0, color: '#2E0EC6', opacity: 0.45 },
        { offset: 0.5, color: '#3A2694', opacity: 0.3 },
        { offset: 0.7, color: '#3A2694', opacity: 0.135 },
        { offset: 0.85, color: '#3A2694', opacity: 0.035 },
        { offset: 1, color: '#3A2694', opacity: 0 },
      ],
      progress: ['#2E0EC6', '#9789DA'],
      ring: ['#624BD5', '#9789DA'],
      heat: ['#1C1C1E', '#3F2AA2', '#624BD5', '#7E6CD8', '#9789DA'],
      heatInk: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#000000', '#000000'],
    },
  },
};

const PALETTES = Object.fromEntries(
  ACCENTS.flatMap((a) => [
    [`${a}-light`, { ...BASE_LIGHT, ...ACCENT_TOKENS[a].light, accent: a }],
    [`${a}-dark`, { ...BASE_DARK, ...ACCENT_TOKENS[a].dark, accent: a }],
  ]),
) as Record<string, PaletteV2>;

export function paletteV2(isDark: boolean, accent: AccentName = 'jade'): PaletteV2 {
  return PALETTES[`${accent}-${isDark ? 'dark' : 'light'}`];
}

/** With Jade (paletteV2's default argument; the app's default accent is DEFAULT_ACCENT). */
export const paletteLight: PaletteV2 = paletteV2(false);
export const paletteDark: PaletteV2 = paletteV2(true);

/**
 * The palette under the older token names (textPrimary, accent, glass, …) that
 * many screens still read through `useTheme().theme`.
 */
export interface ThemeColors {
  bg: string;
  bgAlt: string;
  surface: string;
  bgDark: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  /** Text-safe: the ink with Jade, the accent's text colour otherwise. */
  accent: string;
  accentSoft: string;
  /** Text and glyphs on an `accent` fill. */
  onAccent: string;
  gold: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  warningText: string;
  error: string;
  errorBg: string;
  border: string;
  borderLight: string;
  /** The quiet fill (once a translucent glass fill). */
  glass: string;
}

/**
 * The notification light on Android (the channel's `lightColor`), outside any
 * theme: the system draws it, whatever the app's appearance.
 */
export const NOTIFICATION_LIGHT_COLOR = '#292524';

/** The palette under the older token names. */
export function v2ThemeColors(isDark: boolean, accent: AccentName = 'jade'): ThemeColors {
  const p = paletteV2(isDark, accent);
  return {
    bg: p.bg,
    bgAlt: p.fill,
    surface: p.bg,
    bgDark: isDark ? '#000000' : '#1A1A1A',
    textPrimary: p.text,
    textSecondary: p.secondary,
    textMuted: p.secondary,
    textInverse: p.bg,
    accent: p.accentText,
    accentSoft: p.accentSubtle,
    onAccent: p.onAccentText,
    gold: p.text,
    success: p.doneText,
    successBg: p.fill,
    warning: isDark ? '#FBBF24' : '#B45309',
    warningBg: p.fill,
    warningText: isDark ? '#FBBF24' : '#92400E',
    error: p.red,
    errorBg: isDark ? '#2A1212' : '#FEF2F2',
    border: p.separator,
    borderLight: p.separator,
    glass: p.fill,
  };
}

/** Arabic everywhere in the new design: Amiri (loaded in App.tsx). */
export const fontsV2 = { arabic: 'Amiri-Regular' } as const;

const t = <T extends Record<string, TextStyle>>(x: T) => x;

/**
 * Type: SF Pro for everything Latin (no fontFamily set), Amiri for Arabic.
 * Sentence case only; no uppercase eyebrows.
 */
export const typeV2 = t({
  /** Large screen title (Activity, Insights). */
  largeTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3 },
  /** A profile-style name at the top of a screen. */
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
  /** Top bar title. */
  barTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  /** Sheet and menu titles. */
  sheetTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  /** A row's author: who or what the row is about. */
  name: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  /** Time, counts, footers. */
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** Menu rows. */
  menu: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  /** Numbers that line up (counts, times). */
  numeral: { fontVariant: ['tabular-nums'] },
});

/** Arabic text in Amiri: a little larger than the Latin beside it, with room for its marks. */
export function arabicV2(size: number): TextStyle {
  return { fontFamily: fontsV2.arabic, fontSize: size, lineHeight: Math.round(size * 1.6) };
}

/** Avatar-size marks: a top-level row, a reply, a nested reply. */
export const markV2 = { top: 40, reply: 36, nested: 28 } as const;
export type MarkSize = keyof typeof markV2;

export const layoutV2 = {
  /** Side padding on every screen. */
  gutter: 16,
  /** Vertical padding of a top-level row. */
  rowPad: 16,
  /** Vertical padding of a nested row. */
  nestedPad: 12,
  /** Between a mark and its row's text. */
  markGap: 12,
  /** The line joining a thread's marks. */
  threadLine: 2,
  /** Separators. */
  hairline: 0.5,
  /** The grab handle on sheets. */
  handle: { width: 40, height: 4 },
} as const;

/** Pills 16–20, sheets 20, media 12. */
export const radiusV2 = { chip: 8, media: 12, cancel: 16, pill: 18, sheet: 20, full: 999 } as const;

/**
 * A colour `t` (0–1) of the way from `a` to `b` (both #RRGGBB): a step along an
 * accent gradient, e.g. the juz dots stepping along `palette.ring`.
 */
export function mixColors(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
