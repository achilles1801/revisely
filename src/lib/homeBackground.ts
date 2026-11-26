// Home's background (Revisely Dev with Home v3; BEHAVIOUR.md HOME-6, HOME-7). Majd, Nov 26 2026, on the space under Today:
// "can we just build a, b, and c and just have them as appearance options in settings but make C the default?"
// - glow: the top's glow carried down as a faint wash that eases out at the tab bar;
// - glows: that, and a second, softer glow rising from the tab bar (with the Ramadan theme, the string lights' haze);
// - ayah: glow, with one ayah a day at the foot of Home (lib/homeAyah). The default.
// Settings → Appearance → Home background, kept on this phone (not the account), like the Ramadan theme. Offered where
// Home v3 is (lib/release/homeV3); elsewhere Home keeps its old glow and nothing is read.

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import { homeV3Enabled } from './release/homeV3';

export const HOME_BACKGROUND_KEY = '@revisely_home_background:v1';

export const HOME_BACKGROUNDS = ['glow', 'glows', 'ayah'] as const;
export type HomeBackground = (typeof HOME_BACKGROUNDS)[number];

/** A phone that hasn't chosen (Majd: "make C the default"). */
export const DEFAULT_HOME_BACKGROUND: HomeBackground = 'ayah';

let saved: HomeBackground | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const isChoice = (raw: string | null): raw is HomeBackground => (HOME_BACKGROUNDS as readonly string[]).includes(raw ?? '');

function apply(next: HomeBackground): void {
  const before = getHomeBackground();
  saved = next;
  if (next !== before) listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether this app has the Settings row and draws the backgrounds: where Home v3 is. */
export function homeBackgroundOffered(): boolean {
  return homeV3Enabled();
}

/** The phone's choice, or the default. */
export function getHomeBackground(): HomeBackground {
  return saved ?? DEFAULT_HOME_BACKGROUND;
}

/** Reads the stored choice, once. */
export function loadHomeBackground(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(HOME_BACKGROUND_KEY);
      // A choice made while this was loading wins.
      if (!loaded && isChoice(raw)) apply(raw);
    } catch (err) {
      logger.warn('Could not read the Home background choice', err);
    } finally {
      loaded = true;
      loading = null;
    }
  })();
  return loading;
}

/** Settings → Appearance → Home background. */
export async function setHomeBackground(next: HomeBackground): Promise<void> {
  loaded = true;
  apply(next);
  try {
    await AsyncStorage.setItem(HOME_BACKGROUND_KEY, next);
  } catch (err) {
    logger.warn('Could not save the Home background choice', err);
  }
}

/** The choice, kept current (Home and Settings). Nothing is read where it isn't offered. */
export function useHomeBackground(): HomeBackground {
  const value = useSyncExternalStore(subscribe, getHomeBackground);
  useEffect(() => {
    if (homeBackgroundOffered()) void loadHomeBackground();
  }, []);
  return value;
}

/** Test hook. */
export function __resetHomeBackgroundForTests(): void {
  saved = null;
  loaded = false;
  loading = null;
}
