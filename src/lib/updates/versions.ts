// Version numbers, and what to do when the store has a newer one. Pure, so the
// rules are tested in one place (__tests__/versions.test.ts); the glue is
// storeUpdates.ts.

const VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;

/** "1.0.3", "18.2": up to four numbers. */
export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION.test(value);
}

/** -1, 0 or 1, number by number: 1.0.10 comes after 1.0.9, and 1.0 equals 1.0.0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Firestore config/app, written only by functions/scripts/set-app-config.js:
 * the oldest version each platform still supports, and the version on Google
 * Play (the App Store's comes from Apple's lookup instead).
 */
export interface AppConfig {
  minSupported: { ios?: string; android?: string };
  latest: { android?: string };
}

export const EMPTY_CONFIG: AppConfig = { minSupported: {}, latest: {} };

/** config/app as read. Anything that isn't a version is dropped, so a typo there never blocks anyone. */
export function parseAppConfig(data: unknown): AppConfig {
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const d = obj(data);
  const min = obj(d.minSupported);
  const latest = obj(d.latest);
  const config: AppConfig = { minSupported: {}, latest: {} };
  if (isVersion(min.ios)) config.minSupported.ios = min.ios;
  if (isVersion(min.android)) config.minSupported.android = min.android;
  if (isVersion(latest.android)) config.latest.android = latest.android;
  return config;
}

/** This app's App Store listing, from itunes.apple.com/lookup. */
export interface StoreListing {
  version: string;
  /** The oldest iOS the listed version runs on. */
  minimumOsVersion: string | null;
}

/** The lookup's answer for `bundleId`, or null (not listed, or not understood). */
export function parseLookup(json: unknown, bundleId: string): StoreListing | null {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return null;
  const app = results.find(
    (r): r is Record<string, unknown> => !!r && typeof r === 'object' && (r as { bundleId?: unknown }).bundleId === bundleId,
  );
  return parseListing(app);
}

/** A listing (the lookup's entry, or the copy kept on the phone), or null if it has no version. */
export function parseListing(value: unknown): StoreListing | null {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!v || !isVersion(v.version)) return null;
  return { version: v.version, minimumOsVersion: isVersion(v.minimumOsVersion) ? v.minimumOsVersion : null };
}

export interface StoreInput {
  platform: 'ios' | 'android';
  /** The installed binary's version ("1.0.3"). */
  installed: string | null;
  /** iOS: the system's version ("18.2"). */
  osVersion: string | null;
  /** Development, TestFlight or App Review (a sandbox receipt): never offered or blocked. */
  exempt: boolean;
  config: AppConfig;
  /** iOS: the App Store listing, or null while it isn't known. */
  listing: StoreListing | null;
  /** The newest version already offered on this phone. */
  offered: string | null;
}

export interface StoreDecision {
  /** Below the oldest supported version, and the store has one that meets it. */
  required: { installed: string; minimum: string } | null;
  /** A newer version in the store that hasn't been offered yet. */
  offer: string | null;
}

export const NO_STORE_UPDATE: StoreDecision = { required: null, offer: null };

/** The version this phone can get from its store, if newer than the installed one. */
export function availableVersion(input: StoreInput): string | null {
  if (!isVersion(input.installed)) return null;
  let available: string | null = null;
  if (input.platform === 'ios') {
    const listing = input.listing;
    // A version that needs a newer iOS than the phone has isn't one it can install.
    const runsHere =
      !!listing &&
      (!listing.minimumOsVersion ||
        !isVersion(input.osVersion) ||
        compareVersions(input.osVersion, listing.minimumOsVersion) >= 0);
    available = runsHere ? listing!.version : null;
  } else {
    available = input.config.latest.android ?? null;
  }
  return available && compareVersions(available, input.installed) > 0 ? available : null;
}

/**
 * What to show, if anything: "Update required" when the installed version is
 * below the minimum and the store already has one that meets it (on iOS the
 * listing confirms it; on Android config/app says what Play has), else "New
 * version available" once per version.
 */
export function storeDecision(input: StoreInput): StoreDecision {
  if (input.exempt) return NO_STORE_UPDATE;
  const available = availableVersion(input);
  if (!available || !isVersion(input.installed)) return NO_STORE_UPDATE;
  const minimum = input.config.minSupported[input.platform];
  if (minimum && compareVersions(input.installed, minimum) < 0 && compareVersions(available, minimum) >= 0) {
    return { required: { installed: input.installed, minimum }, offer: null };
  }
  const offered = isVersion(input.offered) && compareVersions(available, input.offered) <= 0;
  return { required: null, offer: offered ? null : available };
}

/**
 * Whether a minimum is waiting on the listing: the installed version is below
 * it but the listing (maybe a day old) doesn't have it yet. Then look again
 * sooner than once a day.
 */
export function minimumAwaitsListing(input: StoreInput): boolean {
  if (input.exempt || input.platform !== 'ios' || !isVersion(input.installed)) return false;
  const minimum = input.config.minSupported.ios;
  if (!minimum || compareVersions(input.installed, minimum) >= 0) return false;
  return !input.listing || compareVersions(input.listing.version, minimum) < 0;
}
