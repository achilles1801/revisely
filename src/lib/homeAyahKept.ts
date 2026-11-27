// Home's ayah of the day on its first frame (HOME-8): its English (Saheeh International) comes from the sura's file,
// read into memory after the first frame on a cold start, so the translation arrived a moment late and the line moved.
// Today's verse is kept on the phone (read as the app starts, as homePrefs does), so it shows with Home at once.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SaheehVerse } from './saheeh';

export const HOME_AYAH_KEY = '@revisely_home_ayah:v1';

interface Kept {
  sura: number;
  ayah: number;
  verse: SaheehVerse;
}

let kept: Kept | null = null;
let loaded = false;
const listeners = new Set<() => void>();

AsyncStorage.getItem(HOME_AYAH_KEY)
  .then((raw) => {
    if (kept || !raw) return;
    const v = JSON.parse(raw) as Partial<Kept> | null;
    if (v && typeof v.sura === 'number' && typeof v.ayah === 'number' && v.verse && typeof v.verse.text === 'string') {
      kept = { sura: v.sura, ayah: v.ayah, verse: { ...v.verse, footnotes: v.verse.footnotes ?? '' } as SaheehVerse };
    }
  })
  .catch(() => undefined)
  .finally(() => {
    loaded = true;
    listeners.forEach((l) => l());
  });

/** Keeps the verse Home shows today. */
export function keepHomeAyah(sura: number, ayah: number, verse: SaheehVerse): void {
  if (kept && kept.sura === sura && kept.ayah === ayah && kept.verse.text === verse.text) return;
  kept = { sura, ayah, verse };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(HOME_AYAH_KEY, JSON.stringify(kept)).catch(() => undefined);
}

/** The verse kept for this ayah, or null. */
export function useKeptHomeAyah(sura: number, ayah: number): SaheehVerse | null {
  const k = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => (loaded ? kept : null),
  );
  return k && k.sura === sura && k.ayah === ayah ? k.verse : null;
}

/** Tests only. */
export function resetHomeAyahKeptForTests(next: Kept | null = null): void {
  kept = next;
  loaded = true;
  listeners.clear();
}
