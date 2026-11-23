// Activity as a tab (Revisely Dev only; BEHAVIOUR.md TAB-2). Majd, Nov 23 2026: "i wanna excitement with having the
// whole activity section being its own tab in between home and mushaf instead of it being a "hidden" button next to
// settings. can we do this on revisely dev with a test toggle in settings for me to see what it's like normal(rn) vs
// with it".
//
// Settings → Appearance → Activity tab, kept on this phone (not the account), off until turned on. On: the tab bar is
// Home, Activity, Read, and the pulse button in Home's top bar goes (navigation/MainNavigator, tabPages). Off: the app
// as it was. The store app has no row and never shows the tab, whatever is stored.

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import { isDevVariant } from './variant';

export const ACTIVITY_TAB_KEY = '@revisely_activity_tab:v1';

/** The phone's choice; false until it has turned it on (or before it has been read). */
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

/** Whether this app has the Settings row: Revisely Dev only. */
export function activityTabOffered(): boolean {
  return isDevVariant();
}

/** What Settings' switch shows: the phone's choice. */
export function getActivityTabSaved(): boolean {
  return saved;
}

/** Whether Activity is a tab now: an app that offers it, with the switch on. */
export function activityTabOn(): boolean {
  return activityTabOffered() && saved;
}

/** Reads the stored choice, once. Nothing is read where it isn't offered. */
export function loadActivityTab(): Promise<void> {
  if (loaded || !activityTabOffered()) return Promise.resolve();
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(ACTIVITY_TAB_KEY);
      // A choice made while this was loading wins.
      if (!loaded && raw === '1') apply(true);
    } catch (err) {
      logger.warn('Could not read the Activity tab choice', err);
    } finally {
      loaded = true;
      loading = null;
    }
  })();
  return loading;
}

/** Settings → Appearance → Activity tab. */
export async function setActivityTab(on: boolean): Promise<void> {
  loaded = true;
  apply(on);
  try {
    await AsyncStorage.setItem(ACTIVITY_TAB_KEY, on ? '1' : '0');
  } catch (err) {
    logger.warn('Could not save the Activity tab choice', err);
  }
}

/** The stored choice, kept current (Settings' switch). */
export function useActivityTabSaved(): boolean {
  const value = useSyncExternalStore(subscribe, getActivityTabSaved);
  useEffect(() => {
    void loadActivityTab();
  }, []);
  return value;
}

/** Whether Activity is a tab: an app that offers it, with the switch on. */
export function useActivityTab(): boolean {
  return useActivityTabSaved() && activityTabOffered();
}

/** Test hook. */
export function __resetActivityTabForTests(): void {
  saved = false;
  loaded = false;
  loading = null;
  listeners.clear();
}
