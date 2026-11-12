import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The recitation check's settings, kept on this phone per account (Dev app, testers; not synced: a synced field
 * would need the user document's allowlist and a rules deploy).
 */
export interface ReciteCheckSettings {
  /** Madd munfasil in counts: 2 (qasr), 4 or 5. */
  munfasil: 2 | 4 | 5;
  /** Madd muttasil: 4, 5 or 6. */
  muttasil: 4 | 5 | 6;
  /** Madd aared (at a stop): 0 = any length the reciter keeps, or 2, 4, 6. */
  aared: 0 | 2 | 4 | 6;
  /** Letters and harakat (experimental: on learners it flags many correct words). */
  letters: boolean;
  /** Keep each recitation and its result in revisely-dev as test data for the lab (on for testers). */
  keep: boolean;
  /** The AI notice has been shown (it comes before the first check). */
  noticeSeen: boolean;
}

export const RECITE_CHECK_DEFAULTS: ReciteCheckSettings = {
  munfasil: 4,
  muttasil: 4,
  aared: 0,
  letters: false,
  keep: true,
  noticeSeen: false,
};

const KEY = (uid: string) => `@revisely_recite_check:v1:${uid}`;

function pick<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/** Saved settings over the defaults; anything unknown or damaged falls back. */
export function parseReciteCheckSettings(raw: string | null): ReciteCheckSettings {
  if (!raw) return RECITE_CHECK_DEFAULTS;
  let s: Record<string, unknown>;
  try {
    s = JSON.parse(raw) ?? {};
  } catch {
    return RECITE_CHECK_DEFAULTS;
  }
  const d = RECITE_CHECK_DEFAULTS;
  return {
    munfasil: pick(s.munfasil, [2, 4, 5] as const, d.munfasil),
    muttasil: pick(s.muttasil, [4, 5, 6] as const, d.muttasil),
    aared: pick(s.aared, [0, 2, 4, 6] as const, d.aared),
    letters: typeof s.letters === 'boolean' ? s.letters : d.letters,
    keep: typeof s.keep === 'boolean' ? s.keep : d.keep,
    noticeSeen: s.noticeSeen === true,
  };
}

let owner: string | null = null;
let current: ReciteCheckSettings = RECITE_CHECK_DEFAULTS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Load the account's settings (once per account; a later call for the same account does nothing). */
export function loadReciteCheckSettings(uid: string | null | undefined): void {
  if (!uid || uid === owner) return;
  owner = uid;
  current = RECITE_CHECK_DEFAULTS;
  emit();
  AsyncStorage.getItem(KEY(uid))
    .then((raw) => {
      if (owner !== uid) return;
      current = parseReciteCheckSettings(raw);
      emit();
    })
    .catch(() => {});
}

export function setReciteCheckSettings(uid: string | null | undefined, update: Partial<ReciteCheckSettings>): void {
  if (!uid) return;
  if (owner !== uid) loadReciteCheckSettings(uid);
  current = { ...current, ...update };
  emit();
  AsyncStorage.setItem(KEY(uid), JSON.stringify(current)).catch(() => {});
}

export function useReciteCheckSettings(uid: string | null | undefined): ReciteCheckSettings {
  loadReciteCheckSettings(uid);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** Tests only. */
export function resetReciteCheckSettingsForTests(): void {
  owner = null;
  current = RECITE_CHECK_DEFAULTS;
}
