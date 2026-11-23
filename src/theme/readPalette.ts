/**
 * Neutral iOS-style palette for the Quran surfaces (Read tab + mushaf pages).
 * The mushaf reads best on pure black (OLED) in dark mode and on plain white
 * paper in light mode.
 */
export interface ReadPalette {
  bg: string;
  pageBg: string;
  card: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** The reader's controls (buttons, the capsule): set off from the page. */
  control: string;
  /** Tint applied to the (black-ink) page PNGs; null = render as-is. */
  pageTint: string | null;
  /** Over a word's ink, the page's colour half through: the word in quiet grey (Recite's peeked words). */
  peekVeil: string;
}

// White and black pages, with the design's greys around them.
const DARK: ReadPalette = {
  bg: '#000000',
  pageBg: '#000000',
  card: '#181818',
  divider: '#1F1F1F',
  textPrimary: '#FFFFFF',
  textSecondary: '#8A8A93',
  textMuted: '#8A8A93',
  control: '#181818',
  pageTint: '#FFFFFF',
  peekVeil: 'rgba(0,0,0,0.55)',
};

const LIGHT: ReadPalette = {
  bg: '#FFFFFF',
  pageBg: '#FFFFFF',
  card: '#FFFFFF',
  divider: '#E5E7EB',
  textPrimary: '#1A1A1A',
  textSecondary: '#616977',
  textMuted: '#616977',
  control: '#F7F7F8',
  pageTint: null,
  peekVeil: 'rgba(255,255,255,0.6)',
};

export function getReadPalette(isDark: boolean): ReadPalette {
  return isDark ? DARK : LIGHT;
}
