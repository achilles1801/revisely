// E2E builds only (install.ts runs it before the app starts).

import AsyncStorage from '@react-native-async-storage/async-storage';

/** ThemeContext's key. */
export const THEME_KEY = '@revisely_theme_v2';

/**
 * A fresh install starts light, the theme every flow's screenshots are approved in
 * (.maestro/README.md, "Screenshots"). ThemeContext decides once, at the first
 * launch: light, unless an earlier launch left keys behind. This launch's own early
 * writes can land first on a slow Simulator (the store check saves the app config 3 s
 * in), and a fresh install then turned dark (run 42336185779, iOS 03-revise-ahead).
 * So E2E builds make that first choice before the app starts; a choice already made
 * stays.
 */
export async function pinFreshTheme(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(THEME_KEY)) == null) await AsyncStorage.setItem(THEME_KEY, 'light');
  } catch {
    // The app decides as it would without E2E.
  }
}
