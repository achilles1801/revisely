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
// - Otherwise Home shows "Update ready · Restart" (components/updates/UpdateBanner),
//   but only for an update that was already waiting the last time the app came
//   to the front: one that arrived during this visit waits quietly.
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
  /** Which time in front (`visit`) it downloaded in. */
  visit: number;
}

/** Each cold start is visit 1; every return to the front adds one. */
let visit = 1;
let pending: Pending | null = null;
let dismissed: string | null = null;
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
  pending = { updateId, visit };
  notify();
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
  visit += 1;
  notify();
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
}

export interface UpdateBannerState {
  /** An update has waited since an earlier visit, and wasn't dismissed. */
  visible: boolean;
  updateId: string | null;
}

export function bannerState(): UpdateBannerState {
  const show = !!pending && pending.visit < visit && dismissed !== pending.updateId;
  return { visible: show, updateId: pending?.updateId ?? null };
}

/** ✕ on the banner: not again for this update (it still applies at a safe moment). */
export function dismissBanner(): void {
  if (!pending) return;
  dismissed = pending.updateId;
  notify();
}

export function subscribeOta(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUpdateBanner(): UpdateBannerState {
  const [state, setState] = useState<UpdateBannerState>(bannerState);
  useEffect(() => {
    const update = () =>
      setState((prev) => {
        const next = bannerState();
        return prev.visible === next.visible && prev.updateId === next.updateId ? prev : next;
      });
    update();
    return subscribeOta(update);
  }, []);
  return state;
}

/** For tests. */
export function resetOtaForTests(): void {
  visit = 1;
  pending = null;
  dismissed = null;
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

/** For tests: what AppState would send. */
export const appStateChangeForTests = onAppStateChange;
