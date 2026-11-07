// Getting new JavaScript (EAS Update) to people sooner.
//
// By itself expo-updates downloads an update in the background and runs it from
// the next cold start, and iOS can keep an app in memory for days. So:
// - At launch the splash stays up while the app asks for an update, for at most
//   LAUNCH_WINDOW_MS. One downloaded by then is applied before Home shows.
// - Back in front, it asks again if the last check was CHECK_INTERVAL_MS ago.
// - An update downloaded earlier is applied when the user comes back after
//   APPLY_AFTER_AWAY_MS or more away, unless a restart would interrupt something
//   (busy.ts: a recording, a recitation, a timer, a screen other than a tab's own).
// - Otherwise, as soon as one has downloaded, "A new update is ready · Update
//   now" (components/updates/UpdateReadySheet) opens over a tab's main screen,
//   never during a session, recording, recitation or timer (it waits until they
//   end). Later puts it off until the next cold start. Nobody has to look for
//   updates. "Downloaded" counts expo-updates' own launch download as well as
//   this file's checks: the native state is followed (addUpdatesStateChangeListener).
// - "Check for updates" in Settings (checkForUpdateNow, testers only) downloads
//   what it finds and always ends with an update ready to restart into, or none.
// A restart shows the launch screen's ground and icon (the reload screen).
// Nothing here runs in development or where updates are off.

import { AppState, AppStateStatus, Image } from 'react-native';
import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';
import * as SplashScreen from 'expo-splash-screen';
import { logger } from '../logger';
import { busyReasons } from './busy';
import { SPLASH_GROUND } from '../../theme/v2';

/** How long the splash waits for an update at launch. */
export const LAUNCH_WINDOW_MS = 2500;
/** The splash goes by then whatever happens. */
export const SPLASH_CAP_MS = 4000;
/** At most one check this often (coming back to the app). */
export const CHECK_INTERVAL_MS = 10 * 60_000;
/** Away this long, a waiting update is applied on return. */
export const APPLY_AFTER_AWAY_MS = 15 * 60_000;
/** The icon on the reload screen, as wide as the splash's (app.config.js imageWidth). */
const RELOAD_ICON_SIZE = 200;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SPLASH_ICON = require('../../../assets/splash-icon.png');

interface Pending {
  updateId: string;
}

let pending: Pending | null = null;
/** Later in the update sheet: not offered again until the next cold start. */
let later = false;
let lastCheckAt: number | null = null;
let inFlight: Promise<string | null> | null = null;
let backgroundAt: number | null = null;
let started = false;
let reloading = false;
let launchDone = false;
let uiReady = false;
let splashHidden = false;
let splashHeld = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function otaEnabled(): boolean {
  return !__DEV__ && Updates.isEnabled;
}

/** An update has downloaded (here, or by the manual check in Settings). */
export function notePendingUpdate(updateId: string): void {
  if (!updateId || updateId === Updates.updateId) return;
  if (pending?.updateId === updateId) return;
  pending = { updateId };
  notify();
}

/** What expo-updates itself has downloaded (its launch download included): pending too. */
function followNativeState(context: Updates.UpdatesNativeStateMachineContext | undefined): void {
  if (!context?.isUpdatePending) return;
  const id = context.downloadedManifest?.id ?? (context.rollback ? 'embedded' : null);
  if (id) notePendingUpdate(id);
}

/**
 * Ask for an update and download it if there is one; the id of the one waiting,
 * or null. At most one check at a time, and (unless forced) one every
 * CHECK_INTERVAL_MS.
 */
export function checkForUpdate(force = false): Promise<string | null> {
  if (!otaEnabled()) return Promise.resolve(null);
  if (inFlight) return inFlight;
  const now = Date.now();
  if (!force && lastCheckAt != null && now - lastCheckAt < CHECK_INTERVAL_MS) {
    return Promise.resolve(pending?.updateId ?? null);
  }
  lastCheckAt = now;
  inFlight = (async () => {
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable && !check.isRollBackToEmbedded) return pending?.updateId ?? null;
      const fetched = await Updates.fetchUpdateAsync();
      if (!fetched.isNew && !fetched.isRollBackToEmbedded) return pending?.updateId ?? null;
      const id = fetched.manifest?.id ?? (fetched.isRollBackToEmbedded ? 'embedded' : null);
      if (id) notePendingUpdate(id);
      return pending?.updateId ?? null;
    } catch (err) {
      logger.warn('Could not check for an update', err);
      return pending?.updateId ?? null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function reloadScreenOptions(): Updates.ReloadScreenOptions {
  const icon = Image.resolveAssetSource?.(SPLASH_ICON);
  return {
    backgroundColor: SPLASH_GROUND,
    ...(icon?.uri
      ? { image: { url: icon.uri, width: RELOAD_ICON_SIZE, height: RELOAD_ICON_SIZE, scale: 1 } }
      : {}),
    imageResizeMode: 'contain',
    spinner: { enabled: false },
    fade: true,
  };
}

export type ManualCheckResult = 'ready' | 'up-to-date' | 'unavailable' | 'error';

/**
 * Settings → Check for updates: ask now (whatever the interval), download what
 * is found, and say whether an update is ready to restart into (also one that
 * had downloaded before). Never just "there is one".
 */
export async function checkForUpdateNow(): Promise<{ result: ManualCheckResult; error?: string }> {
  if (!otaEnabled()) return { result: 'unavailable' };
  if (inFlight) await inFlight; // a check under way finishes first (it never throws)
  lastCheckAt = Date.now();
  try {
    const check = await Updates.checkForUpdateAsync();
    // A roll back to the built-in version counts as an update waiting too.
    if (check.isAvailable || check.isRollBackToEmbedded) {
      const fetched = await Updates.fetchUpdateAsync();
      const id = fetched.manifest?.id ?? (fetched.isRollBackToEmbedded ? 'embedded' : null);
      if (id && (fetched.isNew || fetched.isRollBackToEmbedded)) notePendingUpdate(id);
    }
  } catch (err) {
    logger.warn('Manual update check failed', err);
    followNativeState(Updates.latestContext);
    if (pending) return { result: 'ready' };
    return { result: 'error', error: err instanceof Error ? err.message : String(err) };
  }
  followNativeState(Updates.latestContext);
  return { result: pending ? 'ready' : 'up-to-date' };
}

/** Restart into the update waiting. False if it couldn't (development, or the reload failed). */
export async function applyUpdate(): Promise<boolean> {
  if (!otaEnabled() || reloading) return false;
  reloading = true;
  try {
    await Updates.reloadAsync({ reloadScreenOptions: reloadScreenOptions() });
    return true;
  } catch (err) {
    reloading = false;
    logger.warn('Could not restart into the update', err);
    return false;
  }
}

/**
 * The launch check: an update downloaded within LAUNCH_WINDOW_MS is applied
 * at once ("applied"); one still on its way is left for later.
 */
export async function runLaunchCheck(): Promise<'applied' | 'none' | 'later'> {
  if (!otaEnabled()) return 'none';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const window = new Promise<'later'>((resolve) => {
    timer = setTimeout(() => resolve('later'), LAUNCH_WINDOW_MS);
  });
  const result = await Promise.race([checkForUpdate(true), window]);
  if (timer) clearTimeout(timer);
  if (result === 'later') return 'later';
  if (result && (await applyUpdate())) return 'applied';
  return 'none';
}

function hideSplash() {
  if (!splashHeld || splashHidden) return;
  splashHidden = true;
  SplashScreen.hideAsync().catch(() => undefined);
}

function maybeHideSplash() {
  if (launchDone && uiReady) hideSplash();
}

/** The app has drawn something (fonts loaded): the splash may go once the launch check is done. */
export function markUiReady(): void {
  uiReady = true;
  maybeHideSplash();
}

function onAppStateChange(next: AppStateStatus) {
  const now = Date.now();
  if (next === 'background') {
    backgroundAt = now;
    return;
  }
  if (next !== 'active' || backgroundAt == null) return;
  const away = now - backgroundAt;
  backgroundAt = null;
  if (pending && away >= APPLY_AFTER_AWAY_MS && busyReasons().length === 0) {
    void applyUpdate();
    return;
  }
  void checkForUpdate();
}

/** Once, at launch (App.tsx): hold the splash for the launch check, and watch the app come and go. */
export function startOtaUpdates(): void {
  if (started || !otaEnabled()) return;
  started = true;
  splashHeld = true;
  SplashScreen.preventAutoHideAsync().catch(() => undefined);
  // Whatever happens (a hung check, fonts that never load), the splash goes by then.
  setTimeout(hideSplash, SPLASH_CAP_MS);
  void runLaunchCheck().then((r) => {
    launchDone = true;
    if (r !== 'applied') maybeHideSplash(); // applied: the reload screen covers the switch
  });
  AppState.addEventListener('change', onAppStateChange);
  try {
    followNativeState(Updates.latestContext);
    Updates.addUpdatesStateChangeListener((event) => followNativeState(event.context));
  } catch (err) {
    logger.warn('Could not follow the update state', err);
  }
}

export interface UpdateOfferState {
  /** An update has downloaded, and Later wasn't chosen since this cold start. */
  visible: boolean;
  /** The update waiting, offered or not. */
  updateId: string | null;
}

export function offerState(): UpdateOfferState {
  return { visible: !!pending && !later, updateId: pending?.updateId ?? null };
}

/** Later: not offered again until the next cold start (it still applies at launch, or back after 15 minutes away). */
export function postponeUpdateOffer(): void {
  if (later) return;
  later = true;
  notify();
}

export function subscribeOta(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUpdateOffer(): UpdateOfferState {
  const [state, setState] = useState<UpdateOfferState>(offerState);
  useEffect(() => {
    const update = () =>
      setState((prev) => {
        const next = offerState();
        return prev.visible === next.visible && prev.updateId === next.updateId ? prev : next;
      });
    update();
    return subscribeOta(update);
  }, []);
  return state;
}

/** For tests. */
export function resetOtaForTests(): void {
  pending = null;
  later = false;
  lastCheckAt = null;
  inFlight = null;
  backgroundAt = null;
  started = false;
  reloading = false;
  launchDone = false;
  uiReady = false;
  splashHidden = false;
  splashHeld = false;
  listeners.clear();
}

/** For tests: what AppState would send, and expo-updates' native state. */
export const appStateChangeForTests = onAppStateChange;
export const nativeStateForTests = followNativeState;
