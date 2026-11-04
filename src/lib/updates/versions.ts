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

/** A build on Google Play: its version name and, when known, its version code. */
export interface PlayBuild {
  version: string;
  code: number | null;
}

/**
 * Firestore config/app (clients only read it): the oldest version each
 * platform still supports, and what Google Play has (the App Store's version
 * comes from Apple's lookup instead).
 * - `minSupported`, `latest.android` (+ `latest.androidCode`): Play's production
 *   track, set with functions/scripts/set-app-config.js.
 * - `testing.android`: Play's internal testing track, written by the
 *   playBuildAvailable function when android-build.yml has put a build there.
 *   Only `previewTester` accounts compare against it: they are the internal testers.
 */
export interface AppConfig {
  minSupported: { ios?: string; android?: string };
  latest: { android?: string; androidCode?: number };
  testing?: { android?: { version: string; code: number } };
}

export const EMPTY_CONFIG: AppConfig = { minSupported: {}, latest: {} };

/** A version code: a whole number from 1 (Play's limit is 2100000000). */
export function isVersionCode(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2_100_000_000;
}

/** config/app as read. Anything that isn't a version is dropped, so a typo there never blocks anyone. */
export function parseAppConfig(data: unknown): AppConfig {
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const d = obj(data);
  const min = obj(d.minSupported);
  const latest = obj(d.latest);
  const testing = obj(obj(d.testing).android);
  const config: AppConfig = { minSupported: {}, latest: {} };
  if (isVersion(min.ios)) config.minSupported.ios = min.ios;
  if (isVersion(min.android)) config.minSupported.android = min.android;
  if (isVersion(latest.android)) {
    config.latest.android = latest.android;
    if (isVersionCode(latest.androidCode)) config.latest.androidCode = latest.androidCode;
  }
  if (isVersion(testing.version) && isVersionCode(testing.code)) {
    config.testing = { android: { version: testing.version, code: testing.code } };
  }
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
  /** Android: the installed binary's version code (several builds can share a version). */
  installedCode?: number | null;
  /** Android: a `previewTester` account, which gets Play's internal testing builds. */
  tester?: boolean;
  /** iOS: the system's version ("18.2"). */
  osVersion: string | null;
  /** Development, TestFlight or App Review (a sandbox receipt): never offered or blocked. */
  exempt: boolean;
  config: AppConfig;
  /** iOS: the App Store listing, or null while it isn't known. */
  listing: StoreListing | null;
  /** The newest offer already shown on this phone (an offer label, below). */
  offered: string | null;
}

export interface StoreDecision {
  /** Below the oldest supported version, and the store has one that meets it. */
  required: { installed: string; minimum: string } | null;
  /**
   * A newer build in the store that hasn't been offered yet: "1.0.4", or
   * "1.0.3 (6)" for a new build of the installed version (Android testers).
   * Shown in the sheet, and kept as what was offered.
   */
  offer: string | null;
}

export const NO_STORE_UPDATE: StoreDecision = { required: null, offer: null };

/** Newer than what's installed: by version code when both are known (Android), else by version. */
function newerThanInstalled(build: PlayBuild, input: StoreInput): boolean {
  if (build.code != null && input.installedCode != null) return build.code > input.installedCode;
  return compareVersions(build.version, input.installed!) > 0;
}

/** Which of two builds is newer: by code when both have one, else by version. */
function compareBuilds(a: PlayBuild, b: PlayBuild): number {
  if (a.code != null && b.code != null) return Math.sign(a.code - b.code);
  return compareVersions(a.version, b.version);
}

/** The build this phone can get from its store, if newer than the installed one. */
export function availableBuild(input: StoreInput): PlayBuild | null {
  if (!isVersion(input.installed)) return null;
  const candidates: PlayBuild[] = [];
  if (input.platform === 'ios') {
    const listing = input.listing;
    // A version that needs a newer iOS than the phone has isn't one it can install.
    const runsHere =
      !!listing &&
      (!listing.minimumOsVersion ||
        !isVersion(input.osVersion) ||
        compareVersions(input.osVersion, listing.minimumOsVersion) >= 0);
    if (runsHere) candidates.push({ version: listing!.version, code: null });
  } else {
    const { latest, testing } = input.config;
    if (latest.android) candidates.push({ version: latest.android, code: latest.androidCode ?? null });
    // Internal testing is for testers only: anyone else would find nothing new on Play.
    if (input.tester && testing?.android) candidates.push(testing.android);
  }
  let best: PlayBuild | null = null;
  for (const c of candidates) {
    if (newerThanInstalled(c, input) && (!best || compareBuilds(c, best) > 0)) best = c;
  }
  return best;
}

/** The version this phone can get from its store, if newer than the installed one. */
export function availableVersion(input: StoreInput): string | null {
  return availableBuild(input)?.version ?? null;
}

/** How an offer is named: the version, with the code only when the version is the installed one. */
export function offerLabel(build: PlayBuild, installed: string): string {
  return build.code != null && compareVersions(build.version, installed) <= 0 ? `${build.version} (${build.code})` : build.version;
}

/** An offer label back to a build ("1.0.3 (6)", "1.0.4"), or null. */
export function parseOfferLabel(label: unknown): PlayBuild | null {
  if (typeof label !== 'string') return null;
  const m = /^(\S+?)(?: \((\d+)\))?$/.exec(label);
  if (!m || !isVersion(m[1])) return null;
  const code = m[2] != null ? Number(m[2]) : null;
  return { version: m[1], code: code != null && isVersionCode(code) ? code : null };
}

/** Whether `build` was already offered: it is no newer than what was. A label without a code is the version's first build. */
function wasOffered(build: PlayBuild, offered: string | null): boolean {
  const o = parseOfferLabel(offered);
  if (!o) return false;
  const v = compareVersions(build.version, o.version);
  if (v !== 0) return v < 0;
  return (build.code ?? -1) <= (o.code ?? -1);
}

/**
 * What to show, if anything: "Update required" when the installed version is
 * below the minimum and the store already has one that meets it (on iOS the
 * listing confirms it; on Android config/app says what Play has), else "New
 * version available" once per version.
 */
export function storeDecision(input: StoreInput): StoreDecision {
  if (input.exempt) return NO_STORE_UPDATE;
  const available = availableBuild(input);
  if (!available || !isVersion(input.installed)) return NO_STORE_UPDATE;
  const minimum = input.config.minSupported[input.platform];
  if (minimum && compareVersions(input.installed, minimum) < 0 && compareVersions(available.version, minimum) >= 0) {
    return { required: { installed: input.installed, minimum }, offer: null };
  }
  return { required: null, offer: wasOffered(available, input.offered) ? null : offerLabel(available, input.installed) };
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
