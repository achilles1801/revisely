import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { colors, darkColors } from '../theme/colors';
import { paletteV2, PaletteV2, v2ThemeColors } from '../theme/v2';
import { useDesign } from '../design/DesignContext';

/** Classic offers light and dark; the new design adds System (its default). */
export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  /** The classic token names (in the new design, the v2 palette under them). */
  theme: typeof colors;
  /** The v2 palette (with the chosen accent) for components moved to the new design. */
  palette: PaletteV2;
  setThemeMode: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = '@revision_buddy_theme';
// The new design's own choice, so trying it doesn't change the classic setting.
const THEME_V2_STORAGE_KEY = '@revisely_theme_v2';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Whether the binary reports the system appearance. app.config's
 * userInterfaceStyle "light" pins it (iOS then always says light); following
 * the system needs "automatic", a native change for a versioned release.
 */
export function systemAppearanceAvailable(): boolean {
  return Constants.expoConfig?.userInterfaceStyle === 'automatic';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isNew, accent } = useDesign();
  const system = useColorScheme();
  const [classicMode, setClassicMode] = useState<'light' | 'dark'>('dark');
  const [v2Mode, setV2Mode] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved theme preferences. Classic: migrate a legacy 'system' value to 'dark'.
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(THEME_STORAGE_KEY), AsyncStorage.getItem(THEME_V2_STORAGE_KEY)])
      .then(([saved, savedV2]) => {
        if (saved === 'light' || saved === 'dark') {
          setClassicMode(saved);
        } else if (saved === 'system') {
          setClassicMode('dark');
          AsyncStorage.setItem(THEME_STORAGE_KEY, 'dark');
        }
        if (savedV2 === 'system' || savedV2 === 'light' || savedV2 === 'dark') setV2Mode(savedV2);
      })
      .catch(() => undefined)
      .finally(() => setIsLoaded(true));
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    if (isNew) {
      setV2Mode(mode);
      await AsyncStorage.setItem(THEME_V2_STORAGE_KEY, mode);
      return;
    }
    const classic = mode === 'light' ? 'light' : 'dark';
    setClassicMode(classic);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, classic);
  };

  // Until the binary follows the system, "System" in the new design means the
  // classic choice, so nothing changes under the user.
  const v2Effective: ThemeMode = v2Mode === 'system' && !systemAppearanceAvailable() ? classicMode : v2Mode;
  const themeMode: ThemeMode = isNew ? v2Effective : classicMode;
  const isDark = themeMode === 'system' ? system === 'dark' : themeMode === 'dark';
  const theme = isNew ? v2ThemeColors(isDark, accent) : isDark ? darkColors : colors;

  if (!isLoaded) {
    return null; // or a loading screen
  }

  return (
    <ThemeContext.Provider value={{ themeMode, isDark, theme, palette: paletteV2(isDark, accent), setThemeMode }}>
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
