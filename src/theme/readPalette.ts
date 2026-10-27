/**
 * Neutral iOS-style palette for the Quran surfaces (Read tab + mushaf pages).
 * Deliberately separate from the Mihrab palette: the mushaf reads best on
 * pure black (OLED) in dark mode and on plain white paper in light mode.
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
}

const DARK: ReadPalette = {
  bg: '#000000',
  pageBg: '#000000',
  card: '#1C1C1E',
  divider: 'rgba(84, 84, 88, 0.35)',
  textPrimary: '#FFFFFF',
  textSecondary: '#AEAEB2',
  textMuted: '#8E8E93',
  control: '#1C1C1E',
  pageTint: '#FFFFFF',
};

const LIGHT: ReadPalette = {
  bg: '#F2F2F7',
  pageBg: '#FFFFFF',
  card: '#FFFFFF',
  divider: 'rgba(60, 60, 67, 0.2)',
  textPrimary: '#000000',
  textSecondary: '#3C3C43',
  textMuted: '#8E8E93',
  control: '#F2F2F7',
  pageTint: null,
};

// The new design: the same white and black pages, its own greys around them.
const DARK_V2: ReadPalette = {
  bg: '#000000',
  pageBg: '#000000',
  card: '#181818',
  divider: '#1F1F1F',
  textPrimary: '#FFFFFF',
  textSecondary: '#8A8A93',
  textMuted: '#8A8A93',
  control: '#181818',
  pageTint: '#FFFFFF',
};

const LIGHT_V2: ReadPalette = {
  bg: '#FFFFFF',
  pageBg: '#FFFFFF',
  card: '#FFFFFF',
  divider: '#E5E7EB',
  textPrimary: '#1A1A1A',
  textSecondary: '#616977',
  textMuted: '#616977',
  control: '#F7F7F8',
  pageTint: null,
};

/** `isNew`: the new design (design/DesignContext). */
export function getReadPalette(isDark: boolean, isNew = false): ReadPalette {
  if (isNew) return isDark ? DARK_V2 : LIGHT_V2;
  return isDark ? DARK : LIGHT;
}
