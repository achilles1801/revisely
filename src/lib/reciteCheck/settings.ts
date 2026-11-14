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
  /** What a tap on the reader's mic starts (held, it picks): Record, Recite (follow along) or Check (mistakes). */
  mode: 'record' | 'recite' | 'check';
  /**
   * Check's level (contract draft 4, Majd): Words and harakat (wrong, skipped and added words, letter and haraka
   * slips) or Strict (the same and tajweed, with the madd settings above).
   */
  level: 'words' | 'strict';
  /** Reciting (Recite, Check) also saves the recitation as the session's recording; off in Settings. */
  saveRecording: boolean;
  /** Tests and previews: show Check locked, as it will be for those who haven't got it. */
  previewLocked: boolean;
}

export const RECITE_CHECK_DEFAULTS: ReciteCheckSettings = {
  munfasil: 4,
  muttasil: 4,
  aared: 0,
  letters: false,
  keep: true,
  noticeSeen: false,
  mode: 'recite',
  level: 'words',
  saveRecording: true,
  previewLocked: false,
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
    mode: pick(s.mode, ['record', 'recite', 'check'] as const, d.mode),
    level: pick(s.level, ['words', 'strict'] as const, d.level),
    saveRecording: typeof s.saveRecording === 'boolean' ? s.saveRecording : d.saveRecording,
    previewLocked: s.previewLocked === true,
  };
}

let owner: string | null = null;
let current: ReciteCheckSettings = RECITE_CHECK_DEFAULTS;
/** Changes made while the account's saved settings were still loading: they win over what loads. */
let pending: Partial<ReciteCheckSettings> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Load the account's settings (once per account; a later call for the same account does nothing). */
export function loadReciteCheckSettings(uid: string | null | undefined): void {
  if (!uid || uid === owner) return;
  owner = uid;
  current = RECITE_CHECK_DEFAULTS;
  pending = {};
  emit();
  AsyncStorage.getItem(KEY(uid))
    .then((raw) => {
      if (owner !== uid) return;
      const changed = pending ?? {};
      pending = null;
      current = { ...parseReciteCheckSettings(raw), ...changed };
      emit();
      if (Object.keys(changed).length) AsyncStorage.setItem(KEY(uid), JSON.stringify(current)).catch(() => {});
    })
    .catch(() => {
      pending = null;
    });
}

export function setReciteCheckSettings(uid: string | null | undefined, update: Partial<ReciteCheckSettings>): void {
  if (!uid) return;
  if (owner !== uid) loadReciteCheckSettings(uid);
  current = { ...current, ...update };
  if (pending) pending = { ...pending, ...update };
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
  pending = null;
  current = RECITE_CHECK_DEFAULTS;
}
