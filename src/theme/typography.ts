import { TextStyle } from 'react-native';

/**
 * Typography tokens.
 *
 *   display* — Georgia serif, used for hero headings (kept from original).
 *   title*   — Inter, sans-serif. Section titles, card titles, large stats.
 *   body*    — Inter, body copy. Default reading text.
 *   label    — Inter, uppercase tracking. Small section labels and tab labels.
 *   caption  — smallest readable; metadata, timestamps.
 *
 * IMPORTANT: Inter is loaded via expo-font in App.tsx. Falls back to System if
 * the load fails so the app still renders.
 */

const INTER = 'Inter_400Regular';
const INTER_MEDIUM = 'Inter_500Medium';
const INTER_SEMI = 'Inter_600SemiBold';
const INTER_BOLD = 'Inter_700Bold';

const t = <T extends Record<string, TextStyle>>(x: T) => x;

export const typography = t({
  // Display — Georgia serif, used sparingly for hero moments
  displayLarge: {
    fontFamily: 'Georgia',
    fontSize: 56,
    fontWeight: '400',
    letterSpacing: -1.2,
    lineHeight: 64,
  },
  displayMedium: {
    fontFamily: 'Georgia',
    fontSize: 40,
    fontWeight: '400',
    letterSpacing: -0.6,
    lineHeight: 48,
  },
  displaySmall: {
    fontFamily: 'Georgia',
    fontSize: 28,
    fontWeight: '400',
    letterSpacing: -0.3,
    lineHeight: 36,
  },

  // Titles — Inter
  titleLarge: {
    fontFamily: INTER_SEMI,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  titleMedium: {
    fontFamily: INTER_SEMI,
    fontSize: 17,
    lineHeight: 22,
  },
  titleSmall: {
    fontFamily: INTER_MEDIUM,
    fontSize: 15,
    lineHeight: 20,
  },

  // Body — Inter
  bodyLarge: {
    fontFamily: INTER,
    fontSize: 17,
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily: INTER,
    fontSize: 15,
    lineHeight: 22,
  },
  bodySmall: {
    fontFamily: INTER,
    fontSize: 13,
    lineHeight: 18,
  },

  // Label — uppercase tracking (Apple HIG: minimum 11pt, we use 12)
  label: {
    fontFamily: INTER_MEDIUM,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  caption: {
    fontFamily: INTER,
    fontSize: 11,
    lineHeight: 14,
  },

  // Number-style for big stat values (tabular for alignment)
  statValue: {
    fontFamily: INTER_BOLD,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
});

// iOS auto-substitutes Geeza Pro for Arabic in System; Inter doesn't include
// Arabic glyphs, so we keep System for Arabic text specifically.
export const fonts = {
  arabic: 'System',
  body: INTER,
  bodyMedium: INTER_MEDIUM,
  bodySemibold: INTER_SEMI,
  bodyBold: INTER_BOLD,
  display: 'Georgia',
};

export const interFontMap = {
  Inter_400Regular: undefined as any, // populated by App.tsx
  Inter_500Medium: undefined as any,
  Inter_600SemiBold: undefined as any,
  Inter_700Bold: undefined as any,
};
