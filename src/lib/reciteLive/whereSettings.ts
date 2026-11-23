// What lib/reciteLive/where decides from: config/app's `recite.where` (read with the other switches, lib/whatsNew/
// killSwitch, and kept on the phone), the account's pin (`entitlements/{uid}.reciteWhere`, lib/premium) and this phone's
// choice on Settings → Testing.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { RunsOn, whereSetting, WhereSetting, wherePin } from './where';

export const RECITE_WHERE_KEY = '@revisely_recite_where';
export const RECITE_TESTING_KEY = '@revisely_recite_runs_on';

let config: WhereSetting | null = null;
let configRead = false;
let pin: RunsOn | null = null;
let testing: RunsOn | null = null;

export const reciteWhere = (): { config: WhereSetting | null; pin: RunsOn | null; testing: RunsOn | null } => ({
  config,
  pin,
  testing,
});

/** From a read of config/app. */
export function applyReciteWhereConfig(raw: unknown): void {
  config = whereSetting(raw);
  configRead = true;
  AsyncStorage.setItem(RECITE_WHERE_KEY, config ?? '').catch(() => undefined);
}

/** From the account's entitlements document; null when signed out. */
export function setReciteWherePin(raw: unknown): void {
  pin = wherePin(raw);
}

/** Settings → Testing: this phone's choice (null: Automatic). */
export function setTestingChoice(next: RunsOn | null): void {
  testing = next;
  AsyncStorage.setItem(RECITE_TESTING_KEY, next ?? '').catch(() => undefined);
}

/** At launch: the phone's copies. A read of config/app that has already answered wins. */
export async function loadReciteWhere(): Promise<void> {
  try {
    const [savedConfig, savedTesting] = await Promise.all([
      AsyncStorage.getItem(RECITE_WHERE_KEY),
      AsyncStorage.getItem(RECITE_TESTING_KEY),
    ]);
    if (!configRead) config = whereSetting(savedConfig);
    testing = wherePin(savedTesting);
  } catch {
    // The phone's copies are only a head start.
  }
}

/** Tests only. */
export function resetReciteWhereForTests(): void {
  config = null;
  configRead = false;
  pin = null;
  testing = null;
}
