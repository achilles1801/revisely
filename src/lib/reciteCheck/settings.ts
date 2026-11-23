import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDevVariant } from '../variant';
import { strictReleased } from '../release/mistakeDetection';
import { DEFAULT_TEST_LENGTH, TEST_LENGTHS, type TestLength } from '../reciteLive/testLength';

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
  /** What a tap on the reader's mic starts (held, it picks): Record, or Recite (the page follows you). */
  mode: 'record' | 'recite';
  /**
   * Recite marks mistakes too (Premium; Majd, Nov 14 2026: one "Mark mistakes" switch under Recite). Kept on until
   * turned off. Without Premium it is shown off and locked, whatever is kept.
   */
  markMistakes: boolean;
  /**
   * Mistakes to mark (contract draft 4, Majd): Words and harakat (wrong, skipped and added words, letter and haraka
   * slips) or Strict (the same and tajweed, with the madd settings above).
   */
  level: 'words' | 'strict';
  /** Reciting (Recite, Check) also saves the recitation as the session's recording; off in Settings. */
  saveRecording: boolean;
  /** Words missed in past takes stay lightly marked on the page until said right (lib/reciteMemory); off in Settings. */
  showPast: boolean;
  /** A short sound and a tap as a take marks a mistake (lib/reciteLive/mistakeCue; Majd, Nov 20 2026); off in Settings. */
  mistakeSound: boolean;
  /** How far a spot test goes, in pages (RECITE-8): the last one chosen. */
  testPages: TestLength;
}

/**
 * Whether Strict checks this madd at this length (RECITE-2; the per-rule measurements, Nov 23 2026): munfasil at 4 or
 * 5 counts, and muttasil not yet. Settings says so on the rows it doesn't check.
 */
export const maddChecked = (rule: 'munfasil' | 'muttasil', counts: number): boolean => rule === 'munfasil' && counts !== 2;

export const RECITE_CHECK_DEFAULTS: ReciteCheckSettings = {
  munfasil: 4,
  muttasil: 4,
  aared: 0,
  letters: false,
  keep: true,
  noticeSeen: false,
  mode: 'recite',
  markMistakes: false,
  level: 'words',
  saveRecording: true,
  showPast: true,
  mistakeSound: true,
  testPages: DEFAULT_TEST_LENGTH,
};

/** Whether Strict is offered: Revisely Dev's, until its own switch is on (lib/release/mistakeDetection). */
export const strictOffered = (): boolean => isDevVariant() || strictReleased();

/**
 * The level a take checks: Strict only where it is offered, so a Strict kept on a phone (Revisely Dev's settings, or
 * one from before) checks Words & harakat everywhere else.
 */
export const checkLevel = (s: Pick<ReciteCheckSettings, 'level'>): 'words' | 'strict' =>
  s.level === 'strict' && strictOffered() ? 'strict' : 'words';

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
    // A kept "check" (the three-way menu before Nov 14 2026) is Recite with mistakes marked.
    mode: s.mode === 'record' ? 'record' : s.mode === 'recite' || s.mode === 'check' ? 'recite' : d.mode,
    markMistakes: typeof s.markMistakes === 'boolean' ? s.markMistakes : s.mode === 'check' ? true : d.markMistakes,
    level: pick(s.level, ['words', 'strict'] as const, d.level),
    saveRecording: typeof s.saveRecording === 'boolean' ? s.saveRecording : d.saveRecording,
    showPast: typeof s.showPast === 'boolean' ? s.showPast : d.showPast,
    mistakeSound: typeof s.mistakeSound === 'boolean' ? s.mistakeSound : d.mistakeSound,
    testPages: pick(s.testPages, TEST_LENGTHS, d.testPages),
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

/** Whether `uid`'s saved settings have been read (or failed to read): until then they are the defaults. */
export function reciteCheckSettingsLoaded(uid: string | null | undefined): boolean {
  return !!uid && owner === uid && pending === null;
}

/** Tests only. */
export function resetReciteCheckSettingsForTests(): void {
  owner = null;
  pending = null;
  current = RECITE_CHECK_DEFAULTS;
}
