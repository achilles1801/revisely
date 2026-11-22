// The Ramadan theme (Revisely Dev only; BEHAVIOUR.md THEME-1): decorations over the app's usual design, like a
// game's seasonal skin (Majd, Nov 21 2026: "nothing functional with the app but genuinely just the design and ui
// itself"). Falling light over Home's glow, lanterns in Home's header, a crescent by the greeting, string lights
// along the tab bar (components/ramadan). Never over the mushaf page, a session's page or a Recite take: those
// screens don't draw any of it.
//
// Settings → Appearance → Ramadan theme, kept on this phone (not the account).
// - Until the release switch: Revisely Dev only, off until turned on. The store app has no row and never shows it,
//   whatever is stored.
// - The release (RAMADAN_THEME_RELEASED, flipped by the release owner; Majd, Nov 21 2026: "When we release the next
//   update the ramadan theme should be on by default with the option to take it off in settings"): every app has the
//   row, and the theme is on unless this phone has turned it off.

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import { isDevVariant } from './variant';

export const RAMADAN_THEME_KEY = '@revisely_ramadan_theme:v1';

/** The release switch: true offers the theme in every app, on by default. The release PR flips it (one line). */
export const RAMADAN_THEME_RELEASED = false;

let released = RAMADAN_THEME_RELEASED;
let saved = released;
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

/** Whether this app has the Settings row: every app once released, Revisely Dev before. */
export function ramadanThemeOffered(): boolean {
  return released || isDevVariant();
}

/** Whether the decorations show: an app that offers it, with the switch on. */
export function ramadanThemeOn(): boolean {
  return ramadanThemeOffered() && saved;
}

/** Reads the stored choice, once. */
export function loadRamadanTheme(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(RAMADAN_THEME_KEY);
      // A choice made while this was loading wins. Nothing stored: off before the release, on after it.
      if (!loaded) apply(raw === '1' ? true : raw === '0' ? false : released);
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

/** The stored choice, kept current (Settings' switch). Nothing is read where it isn't offered. */
export function useRamadanThemeSaved(): boolean {
  const value = useSyncExternalStore(subscribe, getRamadanThemeSaved);
  useEffect(() => {
    if (ramadanThemeOffered()) void loadRamadanTheme();
  }, []);
  return value;
}

/** Whether to draw the decorations: an app that offers it, with the switch on. */
export function useRamadanTheme(): boolean {
  return useRamadanThemeSaved() && ramadanThemeOffered();
}

/** Test hook: the release switch flipped. */
export function __setRamadanReleasedForTests(on: boolean): void {
  released = on;
  saved = on;
}

/** Test hook. */
export function __resetRamadanThemeForTests(): void {
  released = RAMADAN_THEME_RELEASED;
  saved = released;
  loaded = false;
  loading = null;
  listeners.clear();
}
