// Design v2 tokens: the new design's look, from "Revisely: Threads-style UI
// Migration". Used when the new design is on (design/DesignContext).
//
// - white (light) or black (dark) grounds, flat: no cards, no glass, no gradient;
// - content is a feed of rows on 0.5pt separators, with avatar-size marks;
// - no accent tint: the primary button is solid black (white in dark). Revisely's
//   jade appears only for "done";
// - text pairs are checked against WCAG (src/design/__tests__): ≥ 4.5:1.
//
// `v2ThemeColors` maps the palette onto the classic ThemeColors names, so
// screens not yet moved take the new colours at once; moved screens use the
// palette names through useTheme().palette.

import { TextStyle } from 'react-native';
import type { ThemeColors } from './colors';

/**
 * The accent, chosen in Settings → Preview (testers): Jade is the design as
 * agreed (ink buttons, jade only for "done"); Crimson and Indigo are trials
 * that put the accent on the primary action, links, the active tab, "done",
 * the calendar and a glow behind Today.
 */
export type AccentName = 'jade' | 'crimson' | 'indigo';
export const ACCENTS: AccentName[] = ['jade', 'crimson', 'indigo'];
export const ACCENT_LABELS: Record<AccentName, string> = { jade: 'Jade', crimson: 'Crimson', indigo: 'Indigo' };

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
  /** The glow behind Home's Today post; null for none. */
  hero: HeroStops | null;
  /** A progress fill, start to end. */
  progress: readonly [string, string];
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
  /** Destructive actions and errors. */
  red: string;
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
  /** Dimmed backdrop behind a sheet. */
  overlay: string;
}

type Base = Omit<PaletteV2, keyof AccentTokens | 'accent'>;

const BASE_LIGHT: Base = {
  bg: '#FFFFFF',
  text: '#1A1A1A',
  secondary: '#6B7280',
  separator: '#E5E7EB',
  red: '#DC2626',
  good: '#0E6B5A',
  fill: '#F7F7F8',
  sheet: '#FFFFFF',
  handle: '#D1D5DB',
  overlay: 'rgba(0,0,0,0.4)',
};

const BASE_DARK: Base = {
  bg: '#000000',
  text: '#FFFFFF',
  secondary: '#8A8A93',
  separator: '#1F1F1F',
  red: '#F87171',
  good: '#4DBA9F',
  fill: '#181818',
  sheet: '#101010',
  handle: '#3A3A3C',
  overlay: 'rgba(0,0,0,0.6)',
};

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
      link: '#6B7280',
      accentSubtle: '#F7F7F8',
      hero: null,
      progress: ['#0E6B5A', '#0E6B5A'],
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
      hero: null,
      progress: ['#4DBA9F', '#4DBA9F'],
      heat: ['#1C1C1E', '#0F4A3B', '#18735C', '#2A9C7F', '#5CD1B2'],
      heatInk: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#000000', '#000000'],
    },
  },
  // RedotPay-like: a bright red action, deep wine tints. #E63946 is taken to
  // #D92B3A so a white label reads at 4.5:1; text on dark is a lighter #F0505C.
  crimson: {
    light: {
      primary: '#D92B3A',
      onPrimary: '#FFFFFF',
      done: '#D92B3A',
      onDone: '#FFFFFF',
      doneText: '#C8283A',
      accentText: '#C8283A',
      onAccentText: '#FFFFFF',
      link: '#C8283A',
      accentSubtle: '#FDECEE',
      hero: [
        { offset: 0, color: '#E63946', opacity: 0.12 },
        { offset: 1, color: '#E63946', opacity: 0 },
      ],
      progress: ['#A62B37', '#E63946'],
      heat: ['#EBEDF0', '#EF8F98', '#E25563', '#BE2A39', '#7E1D29'],
      heatInk: ['#1A1A1A', '#1A1A1A', '#1A1A1A', '#FFFFFF', '#FFFFFF'],
    },
    dark: {
      primary: '#D92B3A',
      onPrimary: '#FFFFFF',
      done: '#D92B3A',
      onDone: '#FFFFFF',
      doneText: '#F0505C',
      accentText: '#F0505C',
      onAccentText: '#000000',
      link: '#F0505C',
      accentSubtle: '#2A1014',
      hero: [
        { offset: 0, color: '#6E1E28', opacity: 0.65 },
        { offset: 0.45, color: '#5C1D24', opacity: 0.3 },
        { offset: 1, color: '#5C1D24', opacity: 0 },
      ],
      progress: ['#A62B37', '#E63946'],
      heat: ['#1C1C1E', '#7A2430', '#A62B37', '#D23545', '#F26B75'],
      heatInk: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#000000'],
    },
  },
  // The real-estate app's indigo: #6355C4 for actions, deep #322B7A tints,
  // lavender #8B7FE8 for text on dark (#6355C4 there is only 3.6:1).
  indigo: {
    light: {
      primary: '#6355C4',
      onPrimary: '#FFFFFF',
      done: '#6355C4',
      onDone: '#FFFFFF',
      doneText: '#6355C4',
      accentText: '#6355C4',
      onAccentText: '#FFFFFF',
      link: '#6355C4',
      accentSubtle: '#EFEDFB',
      hero: [
        { offset: 0, color: '#6355C4', opacity: 0.12 },
        { offset: 1, color: '#6355C4', opacity: 0 },
      ],
      progress: ['#4F43A8', '#A99CF2'],
      heat: ['#EBEDF0', '#A99CF2', '#8679E0', '#5547BE', '#322B7A'],
      heatInk: ['#1A1A1A', '#1A1A1A', '#1A1A1A', '#FFFFFF', '#FFFFFF'],
    },
    dark: {
      primary: '#6355C4',
      onPrimary: '#FFFFFF',
      done: '#6355C4',
      onDone: '#FFFFFF',
      doneText: '#8B7FE8',
      accentText: '#8B7FE8',
      onAccentText: '#000000',
      link: '#8B7FE8',
      accentSubtle: '#17142E',
      hero: [
        { offset: 0, color: '#3A2BD6', opacity: 0.4 },
        { offset: 0.45, color: '#322B7A', opacity: 0.3 },
        { offset: 1, color: '#322B7A', opacity: 0 },
      ],
      progress: ['#3A2BD6', '#A99CF2'],
      heat: ['#1C1C1E', '#3D3299', '#5245B8', '#6F62D6', '#A99CF2'],
      heatInk: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#000000'],
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

/** Jade, the default. */
export const paletteLight: PaletteV2 = paletteV2(false);
export const paletteDark: PaletteV2 = paletteV2(true);

/** The v2 palette under the classic token names, for screens not yet moved. */
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
    // Classic screens use their accent for text as well as fills, so they get
    // the text-safe one: the ink with Jade, the accent's text colour otherwise.
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
    // Flat: what used to be a translucent fill is the quiet fill.
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
