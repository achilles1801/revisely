// Android's own UI follows the app's theme (Settings → Theme), not the phone's:
// - the status bar's icons: edge-to-edge makes the bar transparent and the native
//   theme picks its icons from the system, so they were white on the light theme's
//   white ground;
// - native dialogs (Alert) and pickers: Appearance.setColorScheme sets Android's night
//   mode (AppCompat), so a confirmation in the dark theme is dark too.
// iOS is unchanged. A screen that renders its own <StatusBar> (the reader) still wins
// while it is mounted.
import React, { useEffect } from 'react';
import { Appearance, Platform, StatusBar } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function AndroidSystemTheme() {
  const { isDark, themeMode } = useTheme();
  const android = Platform.OS === 'android';
  useEffect(() => {
    if (!android) return;
    // null: follow the phone again.
    Appearance.setColorScheme(themeMode === 'system' ? null : isDark ? 'dark' : 'light');
  }, [android, isDark, themeMode]);
  if (!android) return null;
  return <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />;
}
