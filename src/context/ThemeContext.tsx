import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { paletteV2, PaletteV2, v2ThemeColors } from '../theme/v2';
import { useDesign } from '../design/DesignContext';

/** Light, dark, or following the system (offered once the binary can). */
export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextType {
  /** What Settings shows as chosen. */
  themeMode: ThemeMode;
  isDark: boolean;
  /** The palette under the older token names (textPrimary, accent, …). */
  theme: ReturnType<typeof v2ThemeColors>;
  /** The palette, with the chosen accent. */
  palette: PaletteV2;
  setThemeMode: (mode: ThemeMode) => void;
}

const THEME_KEY = '@revisely_theme_v2';
// The classic design's Light / Dark: people who chose one keep it.
const CLASSIC_THEME_KEY = '@revision_buddy_theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Whether the binary reports the system appearance. app.config's
 * userInterfaceStyle "light" pins it (iOS then always says light); following
 * the system needs "automatic", a native change for a versioned release.
 */
export function systemAppearanceAvailable(): boolean {
  return Constants.expoConfig?.userInterfaceStyle === 'automatic';
}

/**
 * The mode to show from what is stored: the choice made here; else the
 * classic design's Light / Dark (its System became Dark); else, for a phone
 * that has run the app before (it showed classic's default, dark), dark; else
 * light (a fresh install), or System once the binary follows it. A stored
 * System this binary can't follow falls back the same way.
 */
export function resolveThemeMode(
  saved: string | null,
  savedClassic: string | null,
  systemAvailable: boolean,
  existingInstall: boolean,
): ThemeMode {
  if (saved === 'light' || saved === 'dark') return saved;
  if (saved === 'system' && systemAvailable) return 'system';
  if (savedClassic === 'light' || savedClassic === 'dark') return savedClassic;
  if (savedClassic === 'system' || existingInstall) return 'dark';
  return systemAvailable ? 'system' : 'light';
}

/** Keys an earlier launch leaves behind: the sign-in, or the app's own settings. */
export function isExistingInstall(keys: readonly string[]): boolean {
  return keys.some(
    (k) => k.startsWith('firebase:authUser:') || k.startsWith('@revisely_') || k.startsWith('@revision_buddy') || k.startsWith('@revisley_'),
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { accent } = useDesign();
  const system = useColorScheme();
  const [themeMode, setMode] = useState<ThemeMode>('light');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [saved, savedClassic, keys] = await Promise.all([
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(CLASSIC_THEME_KEY),
        AsyncStorage.getAllKeys(),
      ]);
      const mode = resolveThemeMode(saved, savedClassic, systemAppearanceAvailable(), isExistingInstall(keys));
      setMode(mode);
      // Decided once: from now on this phone has a choice, so a fresh install
      // doesn't count as an existing one (and turn dark) on its next launch.
      if (saved == null) await AsyncStorage.setItem(THEME_KEY, mode);
    })()
      .catch(() => undefined)
      .finally(() => setIsLoaded(true));
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setMode(mode);
    await AsyncStorage.setItem(THEME_KEY, mode);
  };

  const isDark = themeMode === 'system' ? system === 'dark' : themeMode === 'dark';

  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{ themeMode, isDark, theme: v2ThemeColors(isDark, accent), palette: paletteV2(isDark, accent), setThemeMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
