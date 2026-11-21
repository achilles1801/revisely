// The Ramadan theme (Revisely Dev only; BEHAVIOUR.md THEME-1): decorations over the app's usual design, like a
// game's seasonal skin (Majd, Nov 21 2026: "nothing functional with the app but genuinely just the design and ui
// itself"). Falling light over Home's glow, lanterns in Home's header, a crescent by the greeting, string lights
// along the tab bar (components/ramadan). Never over the mushaf page, a session's page or a Recite take: those
// screens don't draw any of it.
//
// Settings → Appearance → Ramadan theme, off by default, kept on this phone (not the account). The store app has no
// row and never shows it, whatever is stored.

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import { isDevVariant } from './variant';

export const RAMADAN_THEME_KEY = '@revisely_ramadan_theme:v1';

let saved = false;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function apply(on: boolean): void {
  if (on === saved) return;
  saved = on;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What Settings' switch shows: the stored choice. */
export function getRamadanThemeSaved(): boolean {
  return saved;
}

/** Whether the decorations show: Revisely Dev, with the switch on. */
export function ramadanThemeOn(): boolean {
  return isDevVariant() && saved;
}

/** Reads the stored choice, once. */
export function loadRamadanTheme(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(RAMADAN_THEME_KEY);
      // A choice made while this was loading wins.
      if (!loaded) apply(raw === '1');
    } catch (err) {
      logger.warn('Could not read the Ramadan theme choice', err);
    } finally {
      loaded = true;
      loading = null;
    }
  })();
  return loading;
}

/** Settings → Appearance → Ramadan theme. */
export async function setRamadanTheme(on: boolean): Promise<void> {
  loaded = true;
  apply(on);
  try {
    await AsyncStorage.setItem(RAMADAN_THEME_KEY, on ? '1' : '0');
  } catch (err) {
    logger.warn('Could not save the Ramadan theme choice', err);
  }
}

/** The stored choice, kept current (Settings' switch). Nothing is read in the store app. */
export function useRamadanThemeSaved(): boolean {
  const value = useSyncExternalStore(subscribe, getRamadanThemeSaved);
  useEffect(() => {
    if (isDevVariant()) void loadRamadanTheme();
  }, []);
  return value;
}

/** Whether to draw the decorations: Revisely Dev with the switch on. */
export function useRamadanTheme(): boolean {
  return useRamadanThemeSaved() && isDevVariant();
}

/** Test hook. */
export function __resetRamadanThemeForTests(): void {
  saved = false;
  loaded = false;
  loading = null;
  listeners.clear();
}
