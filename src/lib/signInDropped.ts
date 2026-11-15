// AUTH-2: a sign-in saved on this phone that Firebase Auth dropped at launch.
//
// - What happens: Firebase Auth checks the saved sign-in with Google at every start and deletes it when
//   Google says it's no longer good. That happens when the account's sign-ins were ended on the server
//   (a password change, another phone's first "Continue with Google" with the same address, an admin),
//   or the account was disabled or deleted. The person lands on the sign-in screen with no reason given.
// - What this does: AuthContext notices (a sign-in was saved as the app started, and Firebase's first
//   answer is "nobody"). The sign-in screen then says so in one line, and Sentry gets one event per launch,
//   with no account details, to show whether and how often this reaches people.
// - What the event carries: the kind of app (store or Revisely Dev), whether the launch followed a restart
//   into an update, and whether the phone was online. Sentry adds the release, the update and the channel
//   itself (lib/releaseInfo).
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Sentry from '@sentry/react-native';
import { isDevVariant } from './variant';

const UPDATE_RESTART_KEY = '@revisely_update_restart:v1';
/** A launch this soon after a restart into an update counts as following it. */
const RECENT_RESTART_MS = 2 * 60_000;
const ONLINE_WAIT_MS = 1_000;

/** Notes that the app is restarting into an update (lib/updates/ota), for the report below. */
export async function markUpdateRestart(now = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(UPDATE_RESTART_KEY, String(now));
  } catch {
    // Only the report's tag depends on it.
  }
}

async function followedUpdateRestart(now: number): Promise<boolean> {
  try {
    const at = Number(await AsyncStorage.getItem(UPDATE_RESTART_KEY));
    return Number.isFinite(at) && at > 0 && now >= at && now - at < RECENT_RESTART_MS;
  } catch {
    return false;
  }
}

async function online(): Promise<'yes' | 'no' | 'unknown'> {
  const state = await Promise.race([
    NetInfo.fetch().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ONLINE_WAIT_MS)),
  ]);
  if (state?.isConnected == null) return 'unknown';
  return state.isConnected ? 'yes' : 'no';
}

/** Tells Sentry a saved sign-in was dropped at launch: one warning, no account details. */
export async function reportSignInDropped(now = Date.now()): Promise<void> {
  const [afterUpdate, connected] = await Promise.all([followedUpdateRestart(now), online()]);
  Sentry.captureMessage('A saved sign-in was dropped at launch', {
    level: 'warning',
    tags: {
      signin_dropped: 'launch',
      app_variant: isDevVariant() ? 'dev' : 'store',
      after_update_restart: afterUpdate ? 'yes' : 'no',
      online: connected,
    },
  });
}
