// Premium early access (Majd, Nov 16 2026; BEHAVIOUR.md PREM-1): "give everyone premium access right now … it'll be
// paid for in the future but anyone who has premium now will keep it forever". Nov 18 2026: "for end date tbd i meant
// new people from singing up and taking advantage of this deal. those users can have premium for life": free for
// everyone who signs up during early access, whose end date isn't set yet, and every account that got it then keeps it
// for life ("for life", his word, in place of "for good").
// - Firestore config/app's `earlyAccess` (true: early access is on). The functions give every account set up then
//   the grant `early` (Premium, no end date; functions/src/support/early.ts), and older accounts get it from a script.
//   Set it with functions/scripts/set-app-config.js --early-access on|off.
// - Read at launch and again when the app comes back after EARLY_ACCESS_EVERY_MS; the last value is kept on the phone.
// - The words: "Premium" stays the name, with no prices or dates. "Early access", never "trial" (both stores use
//   trial for time-limited subscription trials). While it's on, "Can't afford it? Apply for support" is hidden: every
//   account has Premium for nothing. "bi-idhnillah" (Majd, Nov 16 2026), spelled as the terms spell it.
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { logger } from './logger';
import { callFunction } from '../services/firestoreService';
import { t } from '../i18n';

export const EARLY_ACCESS_EVERY_MS = 10 * 60_000;
export const EARLY_ACCESS_KEY = '@revisely_early_access';

/** On only for exactly `true`: anything else (unset, a typo) is off. */
export const earlyAccessOf = (value: unknown): boolean => value === true;

let on: boolean | undefined;
let readAt: number | null = null;
let reading: Promise<void> | null = null;
let started = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (next === on) return;
  on = next;
  listeners.forEach((l) => l());
}

/** Reads config/app's `earlyAccess` when due, or now with `force`. */
export function refreshEarlyAccess(force = false, now = Date.now()): Promise<void> {
  if (reading) return reading;
  if (!force && readAt != null && now - readAt < EARLY_ACCESS_EVERY_MS) return Promise.resolve();
  reading = (async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'app'));
      const next = earlyAccessOf(snap.exists() ? snap.get('earlyAccess') : undefined);
      readAt = now;
      set(next);
      await AsyncStorage.setItem(EARLY_ACCESS_KEY, next ? '1' : '0');
    } catch (err) {
      logger.warn('Early access: config/app could not be read', err);
    } finally {
      reading = null;
    }
  })();
  return reading;
}

function start(): void {
  if (started) return;
  started = true;
  AsyncStorage.getItem(EARLY_ACCESS_KEY)
    .then((v) => {
      if (on === undefined && v != null) set(v === '1');
    })
    .catch(() => undefined);
  refreshEarlyAccess(true);
  AppState.addEventListener('change', (s) => {
    if (s === 'active') refreshEarlyAccess();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Whether Premium is in early access now (config/app), live. */
export function useEarlyAccess(): boolean {
  useEffect(start, []);
  return useSyncExternalStore(subscribe, () => on === true);
}

/** Tests only. */
export function resetEarlyAccessForTests(): void {
  on = undefined;
  readAt = null;
  reading = null;
  started = false;
  listeners.clear();
}

// ------------------------------------------------------------------ the words

/** Settings' Premium row, while early access is on. */
const fullLine = () => t('premium.earlyAccess.line');
/** Settings' Premium row, after early access, for an account that had it then. */
const keptLine = () => t('premium.earlyAccess.kept');
/** Marking mistakes' intro (an account without Premium yet), in place of Apply for support. */
export const earlyAccessIntroLine = () => t('premium.earlyAccess.intro');
/** The take summary's quiet line, while early access is on. */
const shortLine = () => t('premium.earlyAccess.short');
/** The take summary's quiet line, after early access, for an account that had it then. */
const keptShortLine = () => t('premium.earlyAccess.keptShort');

/** The account's Premium, as lib/premium's usePremium gives it. */
interface PremiumNow {
  has: boolean;
  /** The account has the early-access grant (kept for life). */
  early: boolean;
}

/** Settings' line under Premium, or null when there's nothing about early access to say. */
export function earlyAccessLine(premium: PremiumNow, earlyAccessOn: boolean): string | null {
  if (!premium.has) return null;
  if (earlyAccessOn) return fullLine();
  return premium.early ? keptLine() : null;
}

/** The take summary's quiet line, or null. */
export function earlyAccessShortLine(premium: PremiumNow, earlyAccessOn: boolean): string | null {
  if (!premium.has) return null;
  if (earlyAccessOn) return shortLine();
  return premium.early ? keptShortLine() : null;
}

// ------------------------------------------------------------------ claiming it

/**
 * Premium for this account now, while early access is on (the functions' `claimEarlyAccess`): for an account the
 * sign-up grant or the script hasn't reached. Resolves to whether the account has Premium; the live grant follows.
 */
export async function claimEarlyAccess(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('Sign in first.'), { code: 'UNAUTHENTICATED' });
  const out = (await callFunction(user, 'claimEarlyAccess', {}, { timeoutMs: 20_000 })) as { result?: { premium?: unknown } } | null;
  return out?.result?.premium === true;
}
