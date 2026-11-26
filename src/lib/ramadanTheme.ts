// The Ramadan theme (Revisely Dev only; BEHAVIOUR.md THEME-1 to THEME-4): decorations over the app's usual design, like
// a game's seasonal skin (Majd, Nov 21 2026: "nothing functional with the app but genuinely just the design and ui
// itself"). Falling light over Home's glow, lanterns in Home's header, a crescent by the greeting, string lights along
// the tab bar and every sheet (components/ramadan). Never over the mushaf page, a session's page or a Recite take: those
// screens don't draw any of it (RamadanQuiet).
//
// Settings → Appearance → Ramadan theme: Automatic, On or Off, kept on this phone (not the account). Automatic shows it
// from two weeks before Ramadan to three days after Eid (lib/ramadanDates; Majd, Nov 26 2026, his pick of the v2 mocks).
// - Until the release switch: Revisely Dev only, where a phone that hasn't chosen is On (Majd, Nov 22 2026: "yes ramadan
//   theme as default for dev too"). The store app has no row and never shows it, whatever is stored.
// - The release (RAMADAN_THEME_RELEASED, flipped by the release owner; Majd, Nov 21 2026: "When we release the next
//   update the ramadan theme should be on by default with the option to take it off in settings"): every app, and a
//   phone that hasn't chosen is Automatic.
// A phone that chose before Automatic existed stored '1' (on) or '0' (off): read as On and Off.

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDay } from './fajrBoundary';
import { logger } from './logger';
import { inRamadanWindow, ramadanDates, useRamadanDatesVersion } from './ramadanDates';
import { isDevVariant } from './variant';

export const RAMADAN_THEME_KEY = '@revisely_ramadan_theme:v1';

/** The release switch: true offers the theme in every app (Automatic by default). The release PR flips it. */
export const RAMADAN_THEME_RELEASED = false;

export const RAMADAN_CHOICES = ['auto', 'on', 'off'] as const;
export type RamadanChoice = (typeof RAMADAN_CHOICES)[number];

let released = RAMADAN_THEME_RELEASED;
/** The phone's own choice; null until it has made one (or before it has been read). */
let saved: RamadanChoice | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** A stored value: the three choices, or the switch's old '1' and '0'. */
export function ramadanChoiceOf(raw: string | null): RamadanChoice | null {
  if (raw === '1') return 'on';
  if (raw === '0') return 'off';
  return (RAMADAN_CHOICES as readonly string[]).includes(raw ?? '') ? (raw as RamadanChoice) : null;
}

function apply(next: RamadanChoice): void {
  const before = getRamadanChoice();
  saved = next;
  if (next !== before) listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether this app has the Settings row: every app once released, Revisely Dev before. */
export function ramadanThemeOffered(): boolean {
  return released || isDevVariant();
}

/** A phone that hasn't chosen: Automatic once released; On in Revisely Dev before that. */
export function defaultRamadanChoice(): RamadanChoice {
  return released ? 'auto' : 'on';
}

/** What Settings shows: the phone's choice, or the default. */
export function getRamadanChoice(): RamadanChoice {
  return saved ?? defaultRamadanChoice();
}

/** Whether the decorations show on `today` (a day key): offered, and On, or Automatic within its span. */
export function ramadanThemeShows(today: string, choice: RamadanChoice = getRamadanChoice()): boolean {
  if (!ramadanThemeOffered() || choice === 'off') return false;
  return choice === 'on' || inRamadanWindow(today, ramadanDates(today));
}

/** Whether the decorations show now. */
export function ramadanThemeOn(now: Date = new Date()): boolean {
  return ramadanThemeShows(localDay(now));
}

/** Reads the stored choice, once. */
export function loadRamadanTheme(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(RAMADAN_THEME_KEY);
      // A choice made while this was loading wins. Nothing stored: no choice, so the default.
      const choice = ramadanChoiceOf(raw);
      if (!loaded && choice) apply(choice);
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
export async function setRamadanChoice(next: RamadanChoice): Promise<void> {
  loaded = true;
  apply(next);
  try {
    await AsyncStorage.setItem(RAMADAN_THEME_KEY, next);
  } catch (err) {
    logger.warn('Could not save the Ramadan theme choice', err);
  }
}

/** The choice, kept current (Settings' pills). Nothing is read where it isn't offered. */
export function useRamadanChoice(): RamadanChoice {
  const value = useSyncExternalStore(subscribe, getRamadanChoice);
  useEffect(() => {
    if (ramadanThemeOffered()) void loadRamadanTheme();
  }, []);
  return value;
}

/** Whether to draw the decorations: offered, and On or Automatic within its span (the dates kept current too). */
export function useRamadanTheme(): boolean {
  const choice = useRamadanChoice();
  useRamadanDatesVersion(ramadanThemeOffered());
  return ramadanThemeShows(localDay(new Date()), choice);
}

/** Test hook: the release switch flipped. */
export function __setRamadanReleasedForTests(on: boolean): void {
  released = on;
}

/** Test hook. */
export function __resetRamadanThemeForTests(): void {
  released = RAMADAN_THEME_RELEASED;
  saved = null;
  loaded = false;
  loading = null;
  listeners.clear();
}
