export const colors = {
  // Backgrounds
  bg: '#fafaf9',           // stone-50 - main background
  bgAlt: '#f5f5f4',        // stone-100 - cards, inputs
  bgDark: '#292524',       // stone-800 - dark elements

  // Text
  textPrimary: '#1c1917',  // stone-900
  textSecondary: '#57534e', // stone-600
  textMuted: '#a8a29e',    // stone-400
  textInverse: '#fafaf9',  // stone-50

  // Accents
  accent: '#292524',       // stone-800 - primary buttons
  warning: '#f59e0b',      // amber-500
  warningBg: '#fef3c7',    // amber-100
  warningText: '#92400e',  // amber-800
  success: '#059669',      // emerald-600
  successBg: '#ecfdf5',    // emerald-50
  error: '#dc2626',        // red-600
  errorBg: '#fef2f2',      // red-50

  // Borders
  border: '#e7e5e4',       // stone-200
  borderLight: '#f5f5f4',  // stone-100
};

export const darkColors: typeof colors = {
  // Backgrounds
  bg: '#1c1917',           // stone-900 - main background
  bgAlt: '#292524',        // stone-800 - cards, inputs
  bgDark: '#0c0a09',       // stone-950 - dark elements

  // Text
  textPrimary: '#fafaf9',  // stone-50
  textSecondary: '#a8a29e', // stone-400
  textMuted: '#78716c',    // stone-500
  textInverse: '#1c1917',  // stone-900

  // Accents
  accent: '#fafaf9',       // stone-50 - primary buttons
  warning: '#f59e0b',      // amber-500
  warningBg: '#451a03',    // amber-950
  warningText: '#fcd34d',  // amber-300
  success: '#34d399',      // emerald-400
  successBg: '#022c22',    // emerald-950
  error: '#f87171',        // red-400
  errorBg: '#450a0a',      // red-950

  // Borders
  border: '#44403c',       // stone-700
  borderLight: '#292524',  // stone-800
};

export type ThemeColors = typeof colors;

export function getColors(isDark: boolean): ThemeColors {
  return isDark ? darkColors : colors;
}

