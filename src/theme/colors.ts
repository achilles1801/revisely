/**
 * "Mihrab" palette — warm earth tones + deep jade accent.
 * Inspired by Quran manuscript bindings and mosque interiors.
 *
 * Usage:
 *   bg          → screen background
 *   bgAlt       → secondary surfaces (rows, sections without elevation)
 *   surface     → elevated surfaces (cards with shadow, sheets)
 *   accent      → single primary color: CTAs, active states, links
 *   accentSoft  → tinted background for accent chips, badges
 *   gold        → reserved for special moments only (streaks, milestones)
 */
export const colors = {
  // Backgrounds
  bg: '#FBF8F3',           // warm parchment
  bgAlt: '#F4EFE6',        // oatmeal — secondary surfaces
  surface: '#FFFFFF',      // elevated cards (paired with shadow)
  bgDark: '#1A201B',       // legacy slot, kept for compat

  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#5C5147',
  textMuted: '#8B8275',
  textInverse: '#FBF8F3',

  // Accents
  accent: '#0E6B5A',       // jade — primary CTA + brand color
  accentSoft: '#E5F0EC',   // tinted bg for chips
  gold: '#B8893E',         // streak / milestone highlight ONLY

  // Semantic
  success: '#0E6B5A',      // unified with accent
  successBg: '#E5F0EC',
  warning: '#C0833D',
  warningBg: '#FBEFD9',
  warningText: '#7A4D17',
  error: '#B23B3B',
  errorBg: '#FBE5E5',

  // Borders
  border: '#E8E1D4',
  borderLight: '#F0EAE0',
};

export const darkColors: typeof colors = {
  // Backgrounds
  bg: '#0F1410',           // deep ink
  bgAlt: '#1A201B',        // forest ink
  surface: '#222B23',      // elevated cards
  bgDark: '#070A07',

  // Text
  textPrimary: '#F5F1EA',
  textSecondary: '#A8A095',
  textMuted: '#6B6359',
  textInverse: '#0F1410',

  // Accents
  accent: '#34A88F',
  accentSoft: '#0E2A24',
  gold: '#D4A968',

  // Semantic
  success: '#34A88F',
  successBg: '#0E2A24',
  warning: '#E0A158',
  warningBg: '#3A2A12',
  warningText: '#F0D8A8',
  error: '#E07070',
  errorBg: '#3A1A1A',

  // Borders
  border: '#2D332E',
  borderLight: '#252A26',
};

export type ThemeColors = typeof colors;

export function getColors(isDark: boolean): ThemeColors {
  return isDark ? darkColors : colors;
}
