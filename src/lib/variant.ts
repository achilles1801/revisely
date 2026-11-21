// Which app this JavaScript is running in: the store app, or Revisely Dev, the second app that
// installs beside it, runs on the dev Firebase project and follows develop on the `dev` channel
// (APP_VARIANT=dev in app.config.js; CLAUDE.md "Dev stack").
//
// Read from the config the running JavaScript was built or published with: an update carries its
// own `extra`, and the dev channel's updates are published with APP_VARIANT=dev. Functions, not
// constants, so tests can switch variants.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** The store app's ids. The App Store lookup and the store's own release names use these. */
export const STORE_BUNDLE_ID = 'com.revisionbuddy.app';
/**
 * The store app's Android package (app.config.js ANDROID_PACKAGE): its own since Nov 2026, when Google
 * Play's listing moved to Revisely LLC's organization account as a new app (a Play package name is
 * permanent, and com.revisionbuddy.app stays with the first account's app). The Play link and the
 * store app's release names on Android use it.
 */
export const STORE_ANDROID_PACKAGE = 'app.revisely';
export const STORE_APP_GROUP = 'group.com.revisionbuddy.app';
export const DEV_BUNDLE_ID = 'com.revisionbuddy.app.dev';
export const DEV_APP_GROUP = 'group.com.revisionbuddy.app.dev';

/** revisely.app: the site and the API (worker/) the store app calls. */
const STORE_API_BASE = 'https://revisely.app';

interface VariantExtra {
  variant?: unknown;
  apiBase?: unknown;
}

function extra(): VariantExtra {
  return ((Constants.expoConfig?.extra as VariantExtra | undefined) ?? {});
}

/** Revisely Dev, not the store app. */
export function isDevVariant(): boolean {
  return extra().variant === 'dev';
}

/**
 * This app's own id: the bundle id on iOS, the package on Android. Revisely Dev has one string on
 * both; the store app's Android package is its own (STORE_ANDROID_PACKAGE). Sentry's release names
 * start with it, as Sentry's own native default does.
 */
export function appBundleId(): string {
  if (isDevVariant()) return DEV_BUNDLE_ID;
  return Platform.OS === 'android' ? STORE_ANDROID_PACKAGE : STORE_BUNDLE_ID;
}

/** The App Group the app shares with its widget extension (targets/widget). */
export function widgetAppGroup(): string {
  return isDevVariant() ? DEV_APP_GROUP : STORE_APP_GROUP;
}

/**
 * Where the app's API lives (The Clear Quran's verses, worker/): revisely.app for the store app,
 * dev.revisely.app for Revisely Dev (`API_BASE` in the EAS environment it is published with). Only
 * an https address on revisely.app or one of its subdomains is taken; anything else is the store's.
 */
export function apiBase(): string {
  const value = extra().apiBase;
  if (typeof value !== 'string') return STORE_API_BASE;
  const trimmed = value.trim().replace(/\/+$/, '');
  return /^https:\/\/([a-z0-9-]+\.)*revisely\.app$/i.test(trimmed) ? trimmed : STORE_API_BASE;
}
