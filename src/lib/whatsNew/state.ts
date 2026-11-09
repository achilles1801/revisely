// What "What's new" keeps on the phone, per account (`@revisely_whats_new:v1:<uid>`):
// - `card`: the card the required walkthrough is on, so a swipe-away or a crash reopens it there
//   (NEW-2). By id, so a card that drops out (its feature closed) never shifts the others. Another
//   phone starts again at the first card: rare, and not worth a synced field.
// - `forced`: a tester's Settings → Testing → Show What's new at launch. From the next launch the
//   required walkthrough runs as App Store users will see it, resume included; finishing it turns the
//   switch off and writes nothing to the account.
// Whether the account has seen the release is on the account (`whatsNewSeen`, lib/help/whatsNew).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { logger } from '../logger';

export interface WhatsNewSaved {
  /** The release the card belongs to; a card of another release is ignored. */
  release?: string;
  card?: string;
  forced?: boolean;
}

const key = (uid: string) => `@revisely_whats_new:v1:${uid}`;

const saved = new Map<string, WhatsNewSaved>();
const loading = new Map<string, Promise<void>>();
/** `forced` as first read in this run: the switch acts from the next launch. */
const forcedAtLaunch = new Map<string, boolean>();
/** The walkthrough is on screen (WidgetSync holds a widget's link until it's done). */
let showing = false;

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const emit = () => listeners.forEach((l) => l());

function parse(raw: string | null): WhatsNewSaved {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    return {
      release: typeof v.release === 'string' ? v.release : undefined,
      card: typeof v.card === 'string' ? v.card : undefined,
      forced: v.forced === true,
    };
  } catch {
    return {};
  }
}

export function loadWhatsNew(uid: string): Promise<void> {
  if (saved.has(uid)) return Promise.resolve();
  let p = loading.get(uid);
  if (!p) {
    p = AsyncStorage.getItem(key(uid))
      .then((raw) => {
        if (!saved.has(uid)) saved.set(uid, parse(raw));
      })
      .catch((err) => {
        logger.warn("Could not read What's new on this phone", err);
        if (!saved.has(uid)) saved.set(uid, {});
      })
      .finally(() => {
        if (!forcedAtLaunch.has(uid)) forcedAtLaunch.set(uid, saved.get(uid)?.forced === true);
        loading.delete(uid);
        emit();
      });
    loading.set(uid, p);
  }
  return p;
}

function write(uid: string, next: WhatsNewSaved): void {
  saved.set(uid, next);
  emit();
  AsyncStorage.setItem(key(uid), JSON.stringify(next)).catch((err) =>
    logger.warn("Could not save What's new on this phone", err),
  );
}

/** What's kept on the phone, once read (undefined until then). */
export function useWhatsNewSaved(uid: string | null | undefined): WhatsNewSaved | undefined {
  const value = useSyncExternalStore(subscribe, () => (uid ? saved.get(uid) : undefined), () => undefined);
  useEffect(() => {
    if (uid) void loadWhatsNew(uid);
  }, [uid]);
  return value;
}

/** Whether this run started with Show What's new at launch on (undefined until read). */
export function useForcedAtLaunch(uid: string | null | undefined): boolean | undefined {
  useWhatsNewSaved(uid);
  return useSyncExternalStore(subscribe, () => (uid ? forcedAtLaunch.get(uid) : undefined), () => undefined);
}

/** The card the walkthrough of `release` was left on. */
export function savedCard(uid: string, release: string): string | undefined {
  const s = saved.get(uid);
  return s?.release === release ? s.card : undefined;
}

/** Next was tapped: reopen on `card` (NEW-2). */
export function saveCard(uid: string, release: string, card: string): void {
  write(uid, { ...saved.get(uid), release, card });
}

/** Done: nothing to resume, and a tester's run at launch is over (the switch goes off). */
export function finishWhatsNew(uid: string): void {
  forcedAtLaunch.set(uid, false);
  write(uid, {});
}

/** Settings → Testing → Show What's new at launch (testers): from the next launch. */
export function setForcedAtLaunch(uid: string, on: boolean): void {
  write(uid, on ? { forced: true } : { ...saved.get(uid), forced: false });
}

export function setWhatsNewShowing(on: boolean): void {
  if (on === showing) return;
  showing = on;
  emit();
}

export const isWhatsNewShowing = (): boolean => showing;

/** The walkthrough is on screen: a widget's link waits until it's done (NEW-4). */
export function useWhatsNewShowing(): boolean {
  return useSyncExternalStore(subscribe, isWhatsNewShowing, isWhatsNewShowing);
}

/** For tests: a phone that has read nothing. */
export function resetWhatsNewForTests(): void {
  saved.clear();
  loading.clear();
  forcedAtLaunch.clear();
  showing = false;
  emit();
}
