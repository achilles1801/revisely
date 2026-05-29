import { TextStyle } from 'react-native';

/**
 * Typography tokens.
 *
 *   display* — hero headings. Large optical sizes; SF Pro Display kicks in
 *              automatically on iOS at 20pt+.
 *   title*   — section titles, card titles, large stats.
 *   body*    — body copy. Default reading text.
 *   label    — uppercase tracking. Small section labels and tab labels.
 *   caption  — smallest readable; metadata, timestamps.
 *
 * We do not set fontFamily explicitly: iOS uses SF Pro and Android uses Roboto.
 * Weight differences come from `fontWeight`, which both platforms honor for
 * their system font family.
 */

const t = <T extends Record<string, TextStyle>>(x: T) => x;

export const typography = t({
  // Display — system font at hero sizes
  displayLarge: {
    fontSize: 56,
    fontWeight: '400',
    letterSpacing: -1.2,
    lineHeight: 64,
  },
  displayMedium: {
    fontSize: 40,
    fontWeight: '400',
    letterSpacing: -0.6,
    lineHeight: 48,
  },
  displaySmall: {
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: -0.3,
    lineHeight: 36,
  },

  // Titles
  titleLarge: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  titleMedium: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  titleSmall: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },

  // Body
  bodyLarge: {
    fontSize: 17,
    fontWeight: '400',
    lineHeight: 24,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },

  // Label — uppercase tracking (Apple HIG: minimum 11pt, we use 12)
  label: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  caption: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 14,
  },

  // Number-style for big stat values (tabular for alignment)
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
});

// Arabic UI text (surah names, salam, etc.). 'Amiri' is a classical Naskh face
// bundled in assets/fonts/Amiri-Regular.ttf and loaded at startup via
// expo-font. Falls back to the system Arabic face (Geeza Pro on iOS) if the
// font failed to load.
export const fonts = {
  arabic: 'Amiri-Regular',
};
