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
  /** Text in the accent: the active tab, a chosen row's tick (≥ 4.5:1 on every ground; never a highlight on the page). */
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
  /** Revo's mark and glows, in the accent (components/revo). */
  revo: RevoTokens;
}

/**
 * Revo in the accent: the R's gradient on its black disc (each end ≥ 3:1 on the disc), the disc's
 * light from the top-left, the button's ring and glow in dark and its shadow in light, and the
 * sheet's glow at the top-left (null for none: Jade has no glow in dark, as on Home).
 */
export interface RevoTokens {
  r: readonly [string, string];
  disc: string;
  ring: string;
  glow: string;
  shadow: string;
  sheetGlow: { color: string; opacity: number } | null;
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
  /**
   * A recording's voice bubble (Activity) and Listen back's bar: a step firmer
   * than `fill`, so the bubble reads on the ground without an outline.
   */
  bubble: string;
  /** Sheets and menus. */
  sheet: string;
  /** A sheet's grab handle. */
  handle: string;
  /** The chosen segment of a segmented control, raised on its `bubble` track (Activity's add sheets). */
  raised: string;
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
  /**
   * A slip, not a mistake (the live recitation check: a haraka, a letter, a tajweed note), and the amber score: text
   * at 4.5:1 on every ground. Like `red` and `good`, it never follows the accent.
   */
  warn: string;
  /**
   * Quiet fills behind `red`, `warn` and `good` (the score pill, a picked mark): `warn` and `good` read at 4.5:1 on
   * theirs; red on its fill is `onRedSubtle` (light's red is only 4.6:1 on white, too little for any tint).
   */
  redSubtle: string;
  onRedSubtle: string;
  warnSubtle: string;
  goodSubtle: string;
  /**
   * The one highlight on a mushaf page, a neutral grey for every accent (Majd, Nov 21 2026: "we should have one global
   * highlite color that doesnt conflict with other colors, maybe gray?"): `highlight` for an ayah (held, playing, a
   * search result, a similar ayah, "You continued with…", a passage opened from Insights) and the cover of the word being
   * said on a hidden page; `highlightSoft`, its lighter shade, for Recite's band on the line being recited (none on a
   * hidden page). Grey like Tarteel's (Majd, Nov 15 2026: the blue ayah band read as
   * running ahead). It never follows the accent, so it never reads as a mistake (Nov 14: Crimson's follow looked like
   * one), and it stays apart from the mistake highlights (`mark…`) and the peek veil. The page's ink reads at 4.5:1 on
   * both. `followInk` is Recite's one following colour, a green of our own (Majd, Nov 22 2026, of Tarteel's hidden page:
   * "i dont see the words being a different color as its recited with page hidden, why are we not taking that up?"):
   * the newest word shown on a hidden page, in its own ink (components/reciteLive/FollowInk), and the word being said in
   * the bar. Text at 4.5:1 on every ground and on the page; apart from the mistakes' red, amber and violet by hue.
   */
  highlight: string;
  highlightSoft: string;
  /**
   * Its firmer shade: the rectangle on the word being recited on a shown page, inside the ayah's band (Majd, Nov 22
   * 2026, of Tarteel's: "follow along is clearly shading each word … a boxed rectangle kinda that moves side to side").
   */
  highlightFirm: string;
  followInk: string;
  /**
   * Recite's mistakes as highlights behind the word, three colours at most (Majd, Nov 15 2026: "only things we should
   * show are highlites for mistakes 3 colors max and each color can consists of diff types of mistake"): `markWord` a
   * wrong, skipped or extra word (on the word before it), `markSlip` a haraka or letter slip and "Not clear",
   * `markTajweed` a tajweed note (Strict). Each `…Firm` is the mark a card is open for. On the page (as soft washes,
   * components/reciteLive/Wash), in the bar, the card's and the summary's swatches. Pastel (Majd, Nov 21 2026: "I also
   * like their color shades its like more pastel which is what we should aim for as well"): light and soft on a light
   * page, muted on a dark one. The ink reads at 4.5:1 on each; the three tell apart by hue and by lightness (colour
   * blindness); the card and the summary always name the kind in words. None follows the accent.
   */
  markWord: string;
  markWordFirm: string;
  markSlip: string;
  markSlipFirm: string;
  markTajweed: string;
  markTajweedFirm: string;
  /**
   * A word said wrong and corrected straight away (RECITE-33; Majd, Nov 27 2026: "show as corrected i think"): never a
   * mistake, so never a mistake's colour. A calm green, pastel like the three, the ink at 4.5:1 on it, apart from each of
   * them, the page's grey highlight, the peek veil and the Ramadan theme (design.test). `…Firm` as for the others.
   */
  markCorrected: string;
  markCorrectedFirm: string;
  /**
   * The paid recitation check, drawn special: a gradient, start to end, the same for every accent, only for it (its
   * row in the mic's menu, the mic's badge). Each end reads at 4.5:1 as text on the sheet; `onPremium` is the glyph on it.
   */
  premium: readonly [string, string];
  onPremium: string;
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
  bubble: '#F0F0F2',
  sheet: '#FFFFFF',
  handle: '#D1D5DB',
  raised: '#FFFFFF',
  track: '#D1D5DB',
  overlay: 'rgba(0,0,0,0.4)',
  shadow: '#000000',
  switchOff: '#E5E7EB',
  switchThumb: '#FFFFFF',
  warn: '#B45309',
  redSubtle: '#FDECEC',
  onRedSubtle: '#B91C1C',
  warnSubtle: '#FDF2E2',
  goodSubtle: '#E6F2EF',
  highlight: '#DEDEE3',
  highlightSoft: '#F2F2F4',
  highlightFirm: '#C8C8CC',
  followInk: '#1A7A44',
  markWord: '#F6B9BC',
  markWordFirm: '#EF9CA1',
  markSlip: '#FADDA0',
  markSlipFirm: '#F4C878',
  markTajweed: '#D6C8F5',
  markTajweedFirm: '#BFA9EF',
  markCorrected: '#B5E0CA',
  markCorrectedFirm: '#94D0B2',
  premium: ['#7C3AED', '#DB2777'],
  onPremium: '#FFFFFF',
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
  bubble: '#1C1C1E',
  sheet: '#101010',
  handle: '#3A3A3C',
  raised: '#2C2C2E',
  track: '#333333',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
  switchOff: '#39393D',
  switchThumb: '#FFFFFF',
  warn: '#FBBF24',
  redSubtle: '#2A1212',
  onRedSubtle: '#F87171',
  warnSubtle: '#2A2008',
  goodSubtle: '#0D2721',
  highlight: '#26262B',
  highlightSoft: '#121214',
  highlightFirm: '#444446',
  followInk: '#86E0B0',
  markWord: '#7A3D48',
  markWordFirm: '#94505E',
  markSlip: '#7A5D2C',
  markSlipFirm: '#937035',
  markTajweed: '#55487F',
  markTajweedFirm: '#6B5C9E',
  markCorrected: '#2F5E4A',
  markCorrectedFirm: '#3D7560',
  premium: ['#A78BFA', '#F472B6'],
  onPremium: '#000000',
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
      revo: {
        r: ['#3FA084', '#79C2AA'],
        disc: '#0B3A30',
        ring: '#4DBA9F',
        glow: '#3FA084',
        shadow: '#06231D',
        sheetGlow: { color: '#3FA084', opacity: 0.12 },
      },
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
      revo: {
        r: ['#3FA084', '#79C2AA'],
        disc: '#0B3A30',
        ring: '#4DBA9F',
        glow: '#3FA084',
        shadow: '#06231D',
        sheetGlow: null,
      },
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
      revo: {
        r: ['#DC1433', '#F5455E'],
        disc: '#3E0812',
        ring: '#F03C56',
        glow: '#DC1433',
        shadow: '#2A0509',
        sheetGlow: { color: '#DC1433', opacity: 0.08 },
      },
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
      revo: {
        r: ['#DC1433', '#F5455E'],
        disc: '#3E0812',
        ring: '#F03C56',
        glow: '#DC1433',
        shadow: '#2A0509',
        sheetGlow: { color: '#DC1433', opacity: 0.22 },
      },
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
      revo: {
        r: ['#624BD5', '#9789DA'],
        disc: '#2B2352',
        ring: '#9789DA',
        glow: '#624BD5',
        shadow: '#14103C',
        sheetGlow: { color: '#624BD5', opacity: 0.1 },
      },
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
      revo: {
        r: ['#624BD5', '#9789DA'],
        disc: '#2B2352',
        ring: '#9789DA',
        glow: '#624BD5',
        shadow: '#14103C',
        sheetGlow: { color: '#624BD5', opacity: 0.22 },
      },
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

/** The launch screen's ground (app.config.js, expo-splash-screen: #000000 in
 *  both appearances), also behind the icon while the app restarts into an update. */
export const SPLASH_GROUND = '#000000';

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

/**
 * Amiri's own line, as fractions of the font size: the ascender and descender of its hhea table (unitsPerEm 1000),
 * which both platforms build a line from. arabicLines.test reads them from assets/fonts/Amiri-Regular.ttf.
 */
export const AMIRI_LINE = { ascent: 1.124, descent: 0.634 } as const;

/**
 * How far unvoweled Amiri reaches, as fractions of the font size: the highest and lowest of the 114 surah names
 * (scripts/measure-amiri-ink.swift, Nov 22 2026: the hamza of الأنبياء reaches 1.001 above, the meem's tail of القلم
 * 0.651 below). The salam, the prayer names and الكهف stay inside it.
 */
export const AMIRI_NAME_INK = { above: 1.001, below: 0.651 } as const;

/**
 * How far voweled Amiri's ink reaches from the baseline, as fractions of the font size: the highest and the lowest of
 * every word of the Qur'an, shaped by CoreText (`swift scripts/measure-amiri-ink.swift`, Nov 22 2026: ظَمَأٌۭ reaches
 * 1.481 above, عَظِيمٌۭ 0.950 below). Half of all words reach past the font's own ascent: stacked marks (a shadda and
 * its haraka over a lam, dammatan on a hamza over an alif) sit higher than the line the font declares.
 */
export const AMIRI_INK = { above: 1.481, below: 0.95 } as const;

/** Room beyond the measured ink, for Android's shaping and pixel rounding (a fraction of the font size). */
const INK_MARGIN = 0.02;

/**
 * A line taller than the font's own gets half the extra above the ascent and half below the descent, on iOS
 * (RCTApplyBaselineOffset) and Android (CustomLineHeightSpan) alike, React Native 0.81. So the line that holds some ink
 * adds twice its larger overshoot to the font's own line (none when it fits, but never a shorter line than the font's).
 */
function lineFor(ink: { above: number; below: number }): number {
  const over = Math.max(ink.above - AMIRI_LINE.ascent, ink.below - AMIRI_LINE.descent, 0);
  return AMIRI_LINE.ascent + AMIRI_LINE.descent + 2 * (over + INK_MARGIN);
}

/** The line voweled Amiri needs: 2.51× the font size. */
export const ARABIC_FULL_LINE = lineFor(AMIRI_INK);

/** The line unvoweled Amiri needs: 1.83× the font size. */
export const ARABIC_NAME_LINE = lineFor(AMIRI_NAME_INK);

/**
 * Unvoweled Arabic in Amiri (a surah's name, the salam, a prayer's name): a little larger than the Latin beside it,
 * on a line that holds every letter and hamza (ARABIC_NAME_LINE). Until Nov 22 2026 it was 1.6×, shorter than the
 * font's own line: iOS cut the line's top (a hamza over an alif) and Android its bottom (a meem's tail). Anything with
 * harakat uses arabicFullV2.
 */
export function arabicV2(size: number): TextStyle {
  return { fontFamily: fontsV2.arabic, fontSize: size, lineHeight: Math.ceil(size * ARABIC_NAME_LINE) };
}

/**
 * Voweled Arabic in Amiri that never clips (Majd, Nov 22 2026: on a mistake's card "u cant even see if theres a dumma
 * or fatha on the top"): every line tall enough for every haraka above and below, on iOS and Android. A highlight
 * behind a word (a nested Text's background) fills the line, so it covers the marks too. The line grows with the text
 * size, as the font does. Use it for Qur'an words, phrases and anything with harakat.
 */
export function arabicFullV2(size: number): TextStyle {
  return { fontFamily: fontsV2.arabic, fontSize: size, lineHeight: Math.ceil(size * ARABIC_FULL_LINE) };
}

/** Harakat, tanween, the dagger alif and the Qur'an's small signs. */
const HARAKAT = /[ً-ٰٟۖ-ۭ]/;

/** Whether Arabic text carries harakat (so it needs arabicFullV2's line). */
export const hasHarakat = (text: string): boolean => HARAKAT.test(text);

/**
 * The line a given Arabic text needs, where one place shows both kinds (a picker's surah name and a juz's voweled
 * opening words, a typed search and a heard one): arabicFullV2 when it carries harakat, arabicV2 when it doesn't.
 */
export function arabicForV2(text: string | null | undefined, size: number): TextStyle {
  return text && hasHarakat(text) ? arabicFullV2(size) : arabicV2(size);
}

/**
 * Room above and below the baseline in a line of Amiri `lineHeight` tall, as React Native 0.81 lays it out: a taller
 * line than the font's own is centred on both platforms; a shorter one loses its top on iOS (TextKit keeps the
 * descent) and half from each end on Android, so the smaller of the two.
 */
export function amiriRoom(fontSize: number, lineHeight: number): { above: number; below: number } {
  const ascent = AMIRI_LINE.ascent * fontSize;
  const descent = AMIRI_LINE.descent * fontSize;
  const half = (lineHeight - ascent - descent) / 2;
  if (half >= 0) return { above: ascent + half, below: descent + half };
  return { above: Math.min(lineHeight - descent, ascent + half), below: descent + half };
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

/**
 * Revo's mark (the assistant's button, its header capsule, the opt-in): an R on a black disc lit
 * from the top-left, in the accent (palette.revo: the R, the disc's light, the ring and glow in
 * dark, the shadow in light). The disc's middle and edge are the same for every accent.
 */
export const revoV2 = {
  discMid: '#0A0A12',
  discEdge: '#000000',
  /** The pen's lit tip while the R writes itself (What's new's Revo moment): white on any accent. */
  penTip: '#FFFFFF',
} as const;

/**
 * The Ramadan theme's colours (Revisely Dev, Settings → Appearance → Ramadan theme; lib/ramadanTheme): decorations
 * only, never text. Warm gold for the lanterns, the crescent and the falling light, the same for every accent; one
 * string-light bulb in three takes the accent. The site's Ramadan theme uses the same values (shared notes,
 * ramadan-theme.md).
 */
export interface RamadanTokens {
  /** Lantern metal, the crescent, sparkles, the rope the lanterns hang from. */
  gold: string;
  /** Lantern glass and its halo, drawn at `glassOpacity`. */
  glass: string;
  glassOpacity: number;
  /** The flame inside a lantern. */
  flame: string;
  /** The falling light over Home's glow, at most `moteOpacity`. */
  mote: string;
  moteOpacity: number;
  /** The string lights' wire and the lanterns' strings. */
  wire: string;
  /** The string lights' bulbs, in turn. */
  bulbs: readonly [string, string, string];
}

const RAMADAN_BASE = {
  light: {
    gold: '#B07D1E',
    glass: '#F7C561',
    glassOpacity: 0.4,
    flame: '#FFE7A8',
    mote: '#C99532',
    moteOpacity: 0.7,
    wire: '#CBBFA6',
    amber: '#E3A72F',
    third: '#D9774A',
  },
  dark: {
    gold: '#E8B65A',
    glass: '#FFCF73',
    glassOpacity: 0.55,
    flame: '#FFF1CC',
    mote: '#FFE2A0',
    moteOpacity: 0.9,
    wire: '#5A4F3C',
    amber: '#FFC857',
    third: '#FFE9B8',
  },
} as const;

export function ramadanV2(isDark: boolean, accent: AccentName = DEFAULT_ACCENT): RamadanTokens {
  const b = RAMADAN_BASE[isDark ? 'dark' : 'light'];
  return {
    gold: b.gold,
    glass: b.glass,
    glassOpacity: b.glassOpacity,
    flame: b.flame,
    mote: b.mote,
    moteOpacity: b.moteOpacity,
    wire: b.wire,
    // doneText: the accent itself for every accent (Jade's accentText is ink). An accent it doesn't know (a test's stand-in
    // palette) takes the default's, so a bulb never goes missing.
    bulbs: [b.amber, paletteV2(isDark, ACCENTS.includes(accent) ? accent : DEFAULT_ACCENT).doneText, b.third],
  };
}

/**
 * The badges for pages revised (Settings → Account, ACCOUNT-5; Majd approved the boards on Nov 26 2026, their soft
 * two-colour materials an exception to the no-gradient rule): one material a tier, the same in light and dark. Each is a
 * gradient from `light` (top left) to `deep`, edged in `rim`, with the milestone in `ink`. A badge not won yet is drawn in
 * the palette's fill, outline and secondary instead.
 */
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'emerald';

export interface BadgeMaterial {
  light: string;
  deep: string;
  rim: string;
  ink: string;
}

/** What's new's tour (components/whatsNew/tour): the example account's photo, a sunset, never an account's own. */
export const EXAMPLE_PHOTO = { sky: ['#F6C7A1', '#F4A98A'], sun: '#FFF3E4', hill: '#D9825F', hillDeep: '#B9603F' } as const;

export const BADGE_MATERIALS: Record<BadgeTier, BadgeMaterial> = {
  bronze: { light: '#E2A878', deep: '#9C5D30', rim: '#7A4520', ink: '#3E2210' },
  silver: { light: '#F3F5F8', deep: '#A9B0BA', rim: '#7D8590', ink: '#2B3038' },
  gold: { light: '#FCE39A', deep: '#C99227', rim: '#9C6E14', ink: '#4A3200' },
  platinum: { light: '#EEF7F8', deep: '#98B6BF', rim: '#6A8892', ink: '#1E3940' },
  diamond: { light: '#E6F3FF', deep: '#7DB0E6', rim: '#4A82BE', ink: '#0E355E' },
  emerald: { light: '#86E3B9', deep: '#1D8760', rim: '#C99227', ink: '#FFFFFF' },
};

/** The diamond's facet lines, over its material. */
export const BADGE_FACET = '#FFFFFF';
