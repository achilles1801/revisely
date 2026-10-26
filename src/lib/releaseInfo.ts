// What this copy of the app is running: the binary (version, build, runtime) and
// the JavaScript on top of it (the update, or the bundle built into the binary).
//
// Used for Sentry (so every session and event says which update it ran, and
// crash-free rates can be read per update before one is promoted) and for the
// diagnostic row in Settings → About. No personal data.

import * as Updates from 'expo-updates';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

export const BUNDLE_ID = 'com.revisionbuddy.app';

export interface ReleaseInput {
  version: string | null;
  build: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  updateId: string | null;
  /** EAS update group (the same JS on every platform), when running an update. */
  updateGroup: string | null;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
  emergencyLaunchReason: string | null;
  updateCreatedAt: Date | null;
  isDev: boolean;
  /** A real phone or tablet, not a simulator. */
  isDevice: boolean;
}

export interface ReleaseInfo extends ReleaseInput {
  /** Sentry release: com.revisionbuddy.app@1.0.2+19, and `.u<group>` when an
   *  update runs (com.revisionbuddy.app@1.0.2+19.u84b0091f), so sessions and
   *  crash-free rates come out per update. */
  sentryRelease: string;
  /** Sentry environment: the update channel (production, preview), or development. */
  sentryEnvironment: string;
  /** Whether this launch reports to Sentry at all (see sentryReports). */
  sentryEnabled: boolean;
  /** Sentry dist: the build number (unchanged from before). */
  sentryDist: string | undefined;
  /** The first 8 characters of the update group, or null for the built-in bundle. */
  updateShort: string | null;
  /** "1.0.2 (19)". */
  versionLabel: string;
}

/** The short form of an update group used in Sentry releases (8 hex characters). */
export function shortUpdate(group: string | null): string | null {
  if (!group) return null;
  const hex = group.replace(/[^0-9a-f]/gi, '').toLowerCase();
  return hex.length >= 8 ? hex.slice(0, 8) : null;
}

/** The channels of builds people install (App Store, TestFlight): the only ones that report. */
export const REPORTING_CHANNELS = ['production', 'preview'] as const;

/**
 * Only installed builds report to Sentry: a store or TestFlight binary on a real
 * device, on the production or preview channel. Development (Metro), simulators
 * (screenshots, UI automation) and dev clients (no channel, or `development`)
 * send nothing, so their crashes can't open issues, alert or count against a
 * release.
 */
export function sentryReports(input: Pick<ReleaseInput, 'isDev' | 'isDevice' | 'channel'>): boolean {
  return !input.isDev && input.isDevice && (REPORTING_CHANNELS as readonly string[]).includes(input.channel ?? '');
}

export function describeRelease(input: ReleaseInput): ReleaseInfo {
  const version = input.version ?? '0.0.0';
  const build = input.build ?? '0';
  const updateShort = input.isEmbeddedLaunch ? null : shortUpdate(input.updateGroup ?? input.updateId);
  const sentryRelease = `${BUNDLE_ID}@${version}+${build}${updateShort ? `.u${updateShort}` : ''}`;
  const sentryEnvironment = input.isDev ? 'development' : input.channel || 'production';
  return {
    ...input,
    sentryRelease,
    sentryEnvironment,
    sentryEnabled: sentryReports(input),
    sentryDist: input.build ?? undefined,
    updateShort,
    versionLabel: `${version} (${build})`,
  };
}

function manifestUpdateGroup(): string | null {
  const metadata = (Updates.manifest as { metadata?: { updateGroup?: unknown } } | undefined)?.metadata;
  return typeof metadata?.updateGroup === 'string' ? metadata.updateGroup : null;
}

let cached: ReleaseInfo | null = null;

/** This launch's release (fixed for the life of the process). */
export function currentRelease(): ReleaseInfo {
  if (cached) return cached;
  cached = describeRelease({
    version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
    build: Application.nativeBuildVersion ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    // iOS reports no channel as "".
    channel: Updates.channel || null,
    updateId: Updates.updateId ?? null,
    updateGroup: manifestUpdateGroup(),
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    isEmergencyLaunch: Updates.isEmergencyLaunch,
    emergencyLaunchReason: Updates.emergencyLaunchReason ?? null,
    updateCreatedAt: Updates.createdAt ?? null,
    isDev: __DEV__,
    isDevice: Device.isDevice,
  });
  return cached;
}

/** Tags put on every Sentry session and event (no personal data). */
export function releaseTags(r: ReleaseInfo): Record<string, string> {
  return {
    update_id: r.updateId ?? 'none',
    update_group: r.updateGroup ?? (r.isEmbeddedLaunch ? 'embedded' : 'unknown'),
    channel: r.channel ?? 'none',
    runtime: r.runtimeVersion ? r.runtimeVersion.slice(0, 12) : 'none',
    build: r.build ?? 'none',
    embedded_launch: String(r.isEmbeddedLaunch),
    emergency_launch: String(r.isEmergencyLaunch),
  };
}

/** The diagnostic text a user can copy for support (one fact a line). */
export function diagnosticLines(r: ReleaseInfo, lastCheck: Date | null): string[] {
  return [
    `Version ${r.versionLabel}`,
    `Runtime ${r.runtimeVersion ? r.runtimeVersion.slice(0, 12) : '—'}`,
    `Channel ${r.channel ?? '—'}`,
    r.isEmbeddedLaunch
      ? 'JavaScript: built-in'
      : `Update ${r.updateId ?? '—'}${r.updateCreatedAt ? ` (${r.updateCreatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC)` : ''}`,
    ...(r.isEmergencyLaunch ? [`Emergency launch: ${r.emergencyLaunchReason ?? 'unknown reason'}`] : []),
    `Last update check: ${lastCheck ? lastCheck.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'not yet this launch'}`,
  ];
}
