// Which over-the-air update channel this install follows.
//
// One binary is both the TestFlight build and the App Store build, and its
// channel ("production") is fixed when it is built. A tester's TestFlight
// install switches itself to "preview", where every merge to develop is
// published, so new JavaScript is tried in TestFlight before it is promoted,
// unchanged, to production for App Store users (.github/workflows/promote.yml).
//
// Two conditions, both needed: installed from TestFlight (sandbox receipt), and
// signed in to an account marked `previewTester` (set only by an admin:
// functions/scripts/set-preview-tester.js; clients can't write it). App Review
// also installs with a sandbox receipt, so the receipt alone would hand
// reviewers untested JavaScript; their account isn't a tester. Anything else
// (App Store, other accounts, unsure) clears the switch: production.
//
// expo-updates keeps the choice. When it changes, the new channel's update is
// fetched at once, so the next cold start runs it. Only the channel header,
// which the build itself sets, is replaced, so expo-updates' safeguards stay on.

import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import InstallSource from '../../modules/install-source';
import { logger } from './logger';

export const PREVIEW_CHANNEL = 'preview';
type Channel = typeof PREVIEW_CHANNEL | 'production';

/** The header override for a channel: preview, or none (the build's own). */
export function channelOverride(channel: Channel): Record<string, string> | null {
  return channel === PREVIEW_CHANNEL ? { 'expo-channel-name': PREVIEW_CHANNEL } : null;
}

/** Installed from TestFlight (a sandbox receipt); false when unsure. */
export function installedFromTestFlight(): boolean {
  try {
    return InstallSource?.isTestFlight() === true;
  } catch (err) {
    logger.warn('Could not tell where the app was installed from', err);
    return false;
  }
}

/** The channel this install last followed, kept across launches. */
const LAST_CHANNEL_KEY = 'updateChannel.last';
let applied: Channel | null = null;

/**
 * Point this install at its channel. Returns the channel it follows, or null
 * where updates don't apply (development, binaries before 1.0.2).
 */
export function applyUpdateChannel(isTester: boolean): Channel | null {
  if (__DEV__ || !Updates.isEnabled || !InstallSource) return null;
  const channel: Channel = isTester && installedFromTestFlight() ? PREVIEW_CHANNEL : 'production';
  if (channel === applied) return channel;
  try {
    Updates.setUpdateRequestHeadersOverride(channelOverride(channel));
  } catch (err) {
    logger.warn('Could not set the update channel', err);
    return null;
  }
  const previous = applied;
  applied = channel;
  // The launch check already ran on the old channel: if this one differs from
  // what the install last followed, fetch its update now, so the next cold start
  // has it (a first launch on production needs nothing).
  void (async () => {
    const last = previous ?? (await AsyncStorage.getItem(LAST_CHANNEL_KEY).catch(() => null));
    if (last !== channel && (last != null || channel === PREVIEW_CHANNEL)) {
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) await Updates.fetchUpdateAsync();
      } catch (err) {
        logger.warn('Could not fetch the update for the new channel', err);
      }
    }
    await AsyncStorage.setItem(LAST_CHANNEL_KEY, channel).catch(() => undefined);
  })();
  return channel;
}

/** For tests. */
export function resetUpdateChannelForTests(): void {
  applied = null;
}
