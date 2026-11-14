// Revisely Premium for the signed-in account (Revisely Dev for now): `entitlements/{uid}.premium`, written only by the
// functions (apply-support's contract draft 2, Nov 14 2026). Marking mistakes needs it; following along doesn't.
// - Has Premium: `premium` exists and its `until` is null or later than now. The `grants` map beside it is the
//   functions' bookkeeping per source and is ignored here.
// - The owner may get the document (and so listen to it); no client writes.
// - In Revisely Dev, Get Premium is free: `devGrantPremium` / `devRevokePremium` (revisely-dev and the emulators only).
// - "Can't afford it? Apply for support" opens the page `supportLink` answers with (a one-time code for the account).

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { logger } from './logger';
import { callFunction } from '../services/firestoreService';

export type PremiumSource = 'support' | 'dev' | 'purchase' | 'gift' | 'family';

export interface PremiumGrant {
  source: PremiumSource;
  /** Milliseconds since 1970. */
  grantedAt: number;
  /** Milliseconds since 1970; null: no end date. */
  until: number | null;
}

const SOURCES: PremiumSource[] = ['support', 'dev', 'purchase', 'gift', 'family'];

/** The grant as stored, or null when there is none or it isn't one. */
export function parseGrant(raw: unknown): PremiumGrant | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const millis = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    // A Firestore Timestamp, should one ever be written.
    const t = v as { toMillis?: () => number } | null;
    return t && typeof t.toMillis === 'function' ? t.toMillis() : null;
  };
  const source = SOURCES.includes(g.source as PremiumSource) ? (g.source as PremiumSource) : null;
  const grantedAt = millis(g.grantedAt);
  if (!source || grantedAt == null) return null;
  const until = g.until == null ? null : millis(g.until);
  if (g.until != null && until == null) return null;
  return { source, grantedAt, until };
}

/** Has Premium: the same rule as the functions and the recitation checker. */
export function hasPremium(grant: PremiumGrant | null | undefined, now: number): boolean {
  return !!grant && (grant.until == null || grant.until > now);
}

// ------------------------------------------------------------------ the account's grant, live

interface PremiumState {
  uid: string | null;
  grant: PremiumGrant | null;
  /** Heard from the server (or a copy of it kept on the phone) at least once. */
  known: boolean;
}

const KEY = (uid: string) => `@revisely_premium:v1:${uid}`;
const NONE: PremiumState = { uid: null, grant: null, known: false };
let state: PremiumState = NONE;
let stop: (() => void) | null = null;
let users = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(next: PremiumState) {
  state = next;
  emit();
}

function start(uid: string) {
  if (state.uid === uid && stop) return;
  stop?.();
  set({ uid, grant: null, known: false });
  // The copy kept on the phone, until the server answers (no locked flash on a cold start, and offline).
  AsyncStorage.getItem(KEY(uid))
    .then((raw) => {
      if (state.uid !== uid || state.known || raw == null) return;
      set({ uid, grant: parseGrant(JSON.parse(raw)), known: true });
    })
    .catch(() => undefined);
  stop = onSnapshot(
    doc(db, 'entitlements', uid),
    (snap) => {
      if (state.uid !== uid) return;
      // An empty first answer from Firestore's memory isn't the server's.
      if (snap.metadata.fromCache && !snap.exists()) return;
      const grant = snap.exists() ? parseGrant((snap.data() as { premium?: unknown }).premium) : null;
      set({ uid, grant, known: true });
      AsyncStorage.setItem(KEY(uid), JSON.stringify(grant)).catch(() => undefined);
    },
    (err) => logger.warn('Premium: the grant could not be read', err),
  );
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * The account's Premium, live: `has` (by the rule above, now), whether it is `known` yet, and the grant. `enabled`
 * false (the store app, a non-tester) reads nothing.
 */
export function usePremium(uid: string | null | undefined, enabled: boolean): { has: boolean; known: boolean; grant: PremiumGrant | null } {
  useEffect(() => {
    if (!uid || !enabled) return;
    users += 1;
    start(uid);
    return () => {
      users -= 1;
      if (users === 0) {
        stop?.();
        stop = null;
        set(NONE);
      }
    };
  }, [uid, enabled]);
  const s = useSyncExternalStore(subscribe, () => state);
  const mine = enabled && !!uid && s.uid === uid;
  const grant = mine ? s.grant : null;
  return { has: hasPremium(grant, Date.now()), known: mine && s.known, grant };
}

/** Tests only. */
export function resetPremiumForTests(): void {
  stop?.();
  stop = null;
  users = 0;
  state = NONE;
  listeners.clear();
}

// ------------------------------------------------------------------ the callables

function signedIn() {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('Sign in first.'), { code: 'UNAUTHENTICATED' });
  return user;
}

/**
 * Get Premium in Revisely Dev (free; nothing is charged), or take it back to see marking locked again. Resolves to
 * whether the account has Premium now; the live grant follows from the server.
 */
export async function setDevPremium(on: boolean): Promise<boolean> {
  const out = (await callFunction(signedIn(), on ? 'devGrantPremium' : 'devRevokePremium', {}, { timeoutMs: 20_000 })) as
    | { result?: { premium?: unknown } }
    | null;
  const premium = out?.result?.premium === true;
  if (state.uid) set({ uid: state.uid, known: true, grant: premium ? { source: 'dev', grantedAt: Date.now(), until: null } : null });
  return premium;
}

/** The support program's page for this account: a one-time link (30 minutes) from `supportLink`. */
export async function supportLinkUrl(): Promise<string> {
  const out = (await callFunction(signedIn(), 'supportLink', {}, { timeoutMs: 20_000 })) as { result?: { url?: unknown } } | null;
  const url = out?.result?.url;
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw Object.assign(new Error('No link came back.'), { code: 'INTERNAL' });
  return url;
}

/** One short line for a failed call (apply-support's errors, or no connection). */
export function premiumErrorText(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  switch (code) {
    case 'RESOURCE_EXHAUSTED':
      return 'That’s a lot of tries for one day. Try again tomorrow.';
    case 'UNAUTHENTICATED':
      return 'Sign in again, then try once more.';
    case 'FAILED_PRECONDITION':
      return 'Applying for support isn’t open yet.';
    case 'PERMISSION_DENIED':
      return 'Only in Revisely Dev.';
    case 'UNAVAILABLE':
    case 'DEADLINE_EXCEEDED':
    case 'deadline-exceeded':
      return 'Couldn’t connect. Try again when you’re online.';
    default:
      return err instanceof TypeError ? 'Couldn’t connect. Try again when you’re online.' : 'Something went wrong. Try again.';
  }
}
