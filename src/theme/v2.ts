// Design v2 tokens ("paper and ink"), from "Revisely UI Modernization:
// Research & Plan". Used when the new design is on (design/DesignContext):
//
// - flat paper (light) or ink (dark) grounds, no gradient;
// - one accent, jade, for "act here" and "done"; gold only for milestones;
// - text pairs checked against WCAG (every value ≥ 4.5:1 on its ground).
//
// `v2ThemeColors` maps the palette onto the classic ThemeColors names, so every
// screen picks up the new colours at once; screens moved to the new design use
// the richer names (paper, ink, jadeWash…) through useDesign().

import { TextStyle } from 'react-native';
import type { ThemeColors } from './colors';

export interface PaletteV2 {
  /** Screen ground, flat. */
  paper: string;
  /** Grouped rows, the one card per screen. */
  surface: string;
  /** Wells: tracks, inputs, segmented control base. */
  surfaceSunken: string;
  ink: string;
  ink2: string;
  /** Metadata; not on surfaceSunken in light. */
  ink3: string;
  /** Hairlines (0.5pt). */
  line: string;
  /** The one accent: primary action, done state, links. */
  jade: string;
  onJade: string;
  /** Selected row, verse highlight, chip fill. */
  jadeWash: string;
  /** Milestones only. */
  gold: string;
  /** Page strength, weakest (1) to strongest (5); always with a label. */
  strength: [string, string, string, string, string];
  danger: string;
  dangerWash: string;
  warning: string;
  warningWash: string;
  warningInk: string;
}

export const paletteLight: PaletteV2 = {
  paper: '#FAF7F0',
  surface: '#FFFFFF',
  surfaceSunken: '#F2EDE3',
  ink: '#1C1A17',
  ink2: '#5E564C',
  ink3: '#746C60',
  line: '#E6DFD2',
  jade: '#0E6B5A',
  onJade: '#FFFFFF',
  jadeWash: '#E3EFEA',
  gold: '#8F6524',
  strength: ['#A8402F', '#A0611D', '#7E7035', '#56794E', '#0E6B5A'],
  danger: '#A8402F',
  dangerWash: '#F7E6E1',
  warning: '#A0611D',
  warningWash: '#F8ECDB',
  warningInk: '#6E4210',
};

export const paletteDark: PaletteV2 = {
  paper: '#0F1211',
  surface: '#181C1A',
  surfaceSunken: '#0A0C0B',
  ink: '#F2EEE6',
  ink2: '#B5AD9F',
  ink3: '#8E877B',
  line: '#2A302C',
  jade: '#4DBA9F',
  onJade: '#0F1211',
  jadeWash: '#12302A',
  gold: '#D9B26E',
  strength: ['#E08A78', '#E0A15E', '#CDBB7A', '#93C08A', '#4DBA9F'],
  danger: '#E08A78',
  dangerWash: '#3A1D17',
  warning: '#E0A15E',
  warningWash: '#33240F',
  warningInk: '#F0D8A8',
};

export function paletteV2(isDark: boolean): PaletteV2 {
  return isDark ? paletteDark : paletteLight;
}

/** The v2 palette under the classic token names, for screens not yet moved. */
export function v2ThemeColors(isDark: boolean): ThemeColors {
  const p = paletteV2(isDark);
  return {
    bg: p.paper,
    bgAlt: p.surfaceSunken,
    surface: p.surface,
    bgDark: isDark ? '#070908' : '#1C1A17',
    textPrimary: p.ink,
    textSecondary: p.ink2,
    textMuted: p.ink3,
    textInverse: p.paper,
    accent: p.jade,
    accentSoft: p.jadeWash,
    gold: p.gold,
    success: p.jade,
    successBg: p.jadeWash,
    warning: p.warning,
    warningBg: p.warningWash,
    warningText: p.warningInk,
    error: p.danger,
    errorBg: p.dangerWash,
    border: p.line,
    borderLight: p.line,
    // Content is flat in v2: what used to be a translucent fill is a surface.
    glass: p.surface,
  };
}

/** Display face (Latin): Newsreader, OFL, loaded in App.tsx. */
export const fontsV2 = {
  display: 'Newsreader_500Medium',
  displayRegular: 'Newsreader_400Regular',
  /** Arabic display (salam, bismillah, surah names): Amiri. */
  arabic: 'Amiri-Regular',
};

const t = <T extends Record<string, TextStyle>>(x: T) => x;

/**
 * Type scale, mapped to iOS text styles. SF Pro for UI (no fontFamily set);
 * Newsreader for at most one display moment per screen; Amiri for Arabic.
 * No uppercase styles: section headers are sentence case.
 */
export const typeV2 = t({
  /** Large Title, the one serif moment on a screen. */
  display: { fontFamily: fontsV2.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  /** Title 2. */
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.2 },
  /** Headline: row titles, section headers that carry weight. */
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  /** Subheadline: section headers, secondary rows. */
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /** Numbers that line up (counts, times). */
  numeral: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});

/** Arabic beside Latin: 1.3× the Latin size, line height 1.6×. */
export function arabicDisplay(latinSize: number): TextStyle {
  const size = Math.round(latinSize * 1.3);
  return { fontFamily: fontsV2.arabic, fontSize: size, lineHeight: Math.round(size * 1.6) };
}

/** Concentric radii: chips, controls, the one card, sheets and the capsule. */
export const radiusV2 = { chip: 8, control: 12, card: 16, sheet: 24, full: 999 } as const;

/** Layout constants. */
export const layoutV2 = {
  screenMargin: 20,
  sectionGap: 32,
  rowPaddingV: 12,
  rowPaddingH: 16,
  headerGap: 8,
} as const;

/** Two springs only. */
export const springsV2 = {
  snappy: { damping: 26, stiffness: 320, mass: 0.7 },
  gentle: { damping: 22, stiffness: 160, mass: 0.9 },
} as const;
