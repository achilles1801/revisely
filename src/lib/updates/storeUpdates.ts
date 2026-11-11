// New versions in the store (native releases, which an update can't deliver):
// "New version available" once per version, and "Update required" below the
// oldest supported version (rules: versions.ts).
//
// - iOS asks Apple's public lookup (itunes.apple.com/lookup, by bundle id; it
//   carries nothing about the user) at most once a day, and hourly while a
//   minimum waits for the listing to catch up.
// - Android reads what Play has from Firestore config/app: Play has no public
//   lookup, and In-App Updates needs a native module (1.0.4). `latest.android`
//   is production; `testing.android` is internal testing, written when
//   android-build.yml has put a build there, and counts for previewTester
//   accounts only (the internal testers). Builds compare by version code, so a
//   new build of the same version is offered too.
// - The minimum is config/app's `minSupported`, set with
//   functions/scripts/set-app-config.js. It blocks only if the store already has
//   a version that meets it.
// Development, TestFlight and App Review (a sandbox receipt) never see either.
// What was last read is kept on the phone, so this works offline too.

import { AppState, Linking, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import InstallSource from '../../../modules/install-source';
import { BUNDLE_ID } from '../releaseInfo';
import { isDevVariant } from '../variant';
import { logger } from '../logger';
import {
  AppConfig,
  EMPTY_CONFIG,
  NO_STORE_UPDATE,
  StoreDecision,
  StoreInput,
  StoreListing,
  minimumAwaitsListing,
  parseAppConfig,
  parseListing,
  parseLookup,
  storeDecision,
} from './versions';

export const APP_STORE_ID = '6767990248';
export const PLAY_PACKAGE = 'com.revisionbuddy.app';
export const LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}`;

export const CONFIG_EVERY_MS = 6 * 60 * 60_000;
export const LOOKUP_EVERY_MS = 24 * 60 * 60_000;
export const LOOKUP_WAITING_EVERY_MS = 60 * 60_000;
/** After launch, before the first look (the launch has enough to do). */
export const FIRST_LOOK_DELAY_MS = 3000;
const REQUEST_TIMEOUT_MS = 10_000;

const CONFIG_KEY = '@revisely_app_config';
const LISTING_KEY = '@revisely_store_listing';
const OFFERED_KEY = '@revisely_store_offered';

interface Saved<T> {
  value: T;
  at: number;
}

let config: Saved<AppConfig> | null = null;
let listing: Saved<StoreListing | null> | null = null;
let offered: string | null = null;
let tester = false;
let loaded = false;
let started = false;
let refreshing: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function exempt(): boolean {
  if (__DEV__ || isDevVariant()) return true;
  if (Platform.OS !== 'ios') return false;
  // Binaries before 1.0.2 can't tell; TestFlight and App Review have a sandbox receipt.
  try {
    return !InstallSource || InstallSource.isTestFlight();
  } catch {
    return true;
  }
}

/** Android's version code ("5"); null on iOS, where the build number means nothing to the App Store. */
function installedCode(): number | null {
  if (Platform.OS !== 'android') return null;
  const code = Number(Application.nativeBuildVersion);
  return Number.isInteger(code) && code > 0 ? code : null;
}

function input(): StoreInput {
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    installed: Application.nativeApplicationVersion ?? null,
    installedCode: installedCode(),
    tester,
    osVersion: Platform.OS === 'ios' ? String(Platform.Version) : null,
    exempt: exempt(),
    config: config?.value ?? EMPTY_CONFIG,
    listing: listing?.value ?? null,
    offered,
  };
}

export function currentStoreDecision(): StoreDecision {
  return loaded ? storeDecision(input()) : NO_STORE_UPDATE;
}

async function readSaved<T>(key: string): Promise<Saved<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved<T>;
    return saved && typeof saved.at === 'number' ? saved : null;
  } catch {
    return null;
  }
}

async function loadSaved(): Promise<void> {
  if (loaded) return;
  const [c, l, o] = await Promise.all([
    readSaved<unknown>(CONFIG_KEY),
    readSaved<unknown>(LISTING_KEY),
    AsyncStorage.getItem(OFFERED_KEY).catch(() => null),
  ]);
  // Parsed again: what's on the phone gets the same checks as what's read.
  if (c) config = { value: parseAppConfig(c.value), at: c.at };
  if (l) listing = { value: parseListing(l.value), at: l.at };
  offered = o;
  loaded = true;
  notify();
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out')), REQUEST_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function fetchConfig(now: number): Promise<void> {
  try {
    const snap = await withTimeout(getDoc(doc(db, 'config', 'app')));
    config = { value: snap.exists() ? parseAppConfig(snap.data()) : EMPTY_CONFIG, at: now };
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config)).catch(() => undefined);
  } catch (err) {
    logger.log('Could not read the app config', err);
  }
}

async function fetchListing(now: number): Promise<void> {
  try {
    const res = await withTimeout(fetch(`${LOOKUP_URL}&t=${Math.floor(now / 3_600_000)}`));
    if (!res.ok) throw new Error(`lookup answered ${res.status}`);
    listing = { value: parseLookup(await res.json(), BUNDLE_ID), at: now };
    await AsyncStorage.setItem(LISTING_KEY, JSON.stringify(listing)).catch(() => undefined);
  } catch (err) {
    logger.log('Could not look up the App Store version', err);
  }
}

/** Read what's due: the config every CONFIG_EVERY_MS, the iOS listing once a day (hourly while a minimum waits). */
export function refreshStoreState(now = Date.now()): Promise<void> {
  if (exempt()) return Promise.resolve();
  if (refreshing) return refreshing;
  refreshing = (async () => {
    await loadSaved();
    if (!config || now - config.at >= CONFIG_EVERY_MS) await fetchConfig(now);
    if (Platform.OS === 'ios') {
      const every = minimumAwaitsListing(input()) ? LOOKUP_WAITING_EVERY_MS : LOOKUP_EVERY_MS;
      if (!listing || now - listing.at >= every) await fetchListing(now);
    }
    notify();
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Once, at launch (App.tsx): what's saved now, a fresh look shortly after, and again on each return. */
export function startStoreChecks(): void {
  if (started || exempt()) return;
  started = true;
  void loadSaved();
  setTimeout(() => void refreshStoreState(), FIRST_LOOK_DELAY_MS);
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void refreshStoreState();
  });
}

/** Whether the signed-in account is a `previewTester` (AppContext, with the update channel). */
export function setStoreTester(isTester: boolean): void {
  if (tester === isTester) return;
  tester = isTester;
  notify();
}

/** The offer was shown: not again for this version. */
export function markOffered(version: string): void {
  offered = version;
  AsyncStorage.setItem(OFFERED_KEY, version).catch(() => undefined);
  notify();
}

/** This app's page in the App Store or Google Play. */
export async function openStore(): Promise<void> {
  const [app, web] =
    Platform.OS === 'ios'
      ? [`itms-apps://apps.apple.com/app/id${APP_STORE_ID}`, `https://apps.apple.com/app/id${APP_STORE_ID}`]
      : [`market://details?id=${PLAY_PACKAGE}`, `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`];
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(web).catch((err) => logger.warn('Could not open the store', err));
  }
}

export function storeName(): string {
  return Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
}

export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStoreDecision(): StoreDecision {
  const [decision, setDecision] = useState<StoreDecision>(currentStoreDecision);
  useEffect(() => {
    const update = () =>
      setDecision((prev) => {
        const next = currentStoreDecision();
        const same =
          prev.offer === next.offer &&
          prev.required?.installed === next.required?.installed &&
          prev.required?.minimum === next.required?.minimum;
        return same ? prev : next;
      });
    update();
    return subscribeStore(update);
  }, []);
  return decision;
}

/** For tests. */
export function resetStoreForTests(): void {
  config = null;
  listing = null;
  offered = null;
  tester = false;
  loaded = false;
  started = false;
  refreshing = null;
  listeners.clear();
}
