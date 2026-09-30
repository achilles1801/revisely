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
  pageTint: null,
};

export function getReadPalette(isDark: boolean): ReadPalette {
  return isDark ? DARK : LIGHT;
}
