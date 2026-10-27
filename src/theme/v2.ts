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

export interface PaletteV2 {
  /** Screen ground. */
  bg: string;
  text: string;
  /** Metadata, placeholders, inactive icons. */
  secondary: string;
  /** Hairlines between rows (0.5pt) and the thread line. */
  separator: string;
  /** Destructive actions and errors. */
  red: string;
  /** Revisely jade, for "done" only. */
  done: string;
  /** Text or a glyph on `done`. */
  onDone: string;
  /** Marks, chips, the Cancel bar: a quiet fill on the ground. */
  fill: string;
  /** Sheets and menus. */
  sheet: string;
  /** A sheet's grab handle. */
  handle: string;
  /** Dimmed backdrop behind a sheet. */
  overlay: string;
  /** The primary (solid) button. */
  primary: string;
  onPrimary: string;
}

export const paletteLight: PaletteV2 = {
  bg: '#FFFFFF',
  text: '#1A1A1A',
  secondary: '#6B7280',
  separator: '#E5E7EB',
  red: '#DC2626',
  done: '#0E6B5A',
  onDone: '#FFFFFF',
  fill: '#F7F7F8',
  sheet: '#FFFFFF',
  handle: '#D1D5DB',
  overlay: 'rgba(0,0,0,0.4)',
  primary: '#1A1A1A',
  onPrimary: '#FFFFFF',
};

export const paletteDark: PaletteV2 = {
  bg: '#000000',
  text: '#FFFFFF',
  secondary: '#8A8A93',
  separator: '#1F1F1F',
  red: '#F87171',
  done: '#4DBA9F',
  onDone: '#000000',
  fill: '#181818',
  sheet: '#101010',
  handle: '#3A3A3C',
  overlay: 'rgba(0,0,0,0.6)',
  primary: '#FFFFFF',
  onPrimary: '#000000',
};

export function paletteV2(isDark: boolean): PaletteV2 {
  return isDark ? paletteDark : paletteLight;
}

/** The v2 palette under the classic token names, for screens not yet moved. */
export function v2ThemeColors(isDark: boolean): ThemeColors {
  const p = paletteV2(isDark);
  return {
    bg: p.bg,
    bgAlt: p.fill,
    surface: p.bg,
    bgDark: isDark ? '#000000' : '#1A1A1A',
    textPrimary: p.text,
    textSecondary: p.secondary,
    textMuted: p.secondary,
    textInverse: p.bg,
    // No accent tint: what was jade is the ink (solid black, white in dark).
    accent: p.primary,
    accentSoft: p.fill,
    onAccent: p.onPrimary,
    gold: p.text,
    success: p.done,
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
