// Android: the media notification expo-audio 1.1 shows for a recitation (its
// AudioControlsService) can outlive what it controls. Seen on an emulator, Nov 4
// 2026, swiping the app away from recents while a verse plays:
// - Media3's MediaSessionService.onTaskRemoved pauses the player and stops the
//   service (expo-audio bypasses Media3's own notification manager, so Media3
//   never counts the playback as ongoing).
// - expo-audio posts the paused notification as the service goes; the system
//   removes the service's notification, then that post lands: a plain
//   notification that can't be swiped away (NO_CLEAR), for a session that no
//   longer exists, so no buttons and a progress bar that doesn't move. Nothing
//   cancels it; it outlives the app.
// - The app's screens unmount and stop the recitation; clearing the lock screen
//   (setActiveForLockScreen(false)) then starts the service again with nothing to
//   show, and Android kills the app 30 s later
//   (ForegroundServiceDidNotStartInTimeException).
// - expo-audio's onDestroy also leaves its listener on our player, and once it has
//   no player it posts under a fallback id ("expo_audio_channel".hashCode() in
//   Java), which nothing cancels either.
//
// Binaries before 1.0.4 run expo-audio as released, and lib/recitation works
// around it: it frees its player rather than clearing the lock screen, dismisses
// any media notification still on show once it has let go of the lock screen
// (right after a stop, at launch and when the app comes back), and when the app
// comes back pauses a recitation whose notification has lost its service. With
// the app away React Native's timers stand still on Android, so right after a
// stop it reads what is on show again and again for a moment instead of waiting.
//
// From 1.0.4 the binary carries the fix (patches/expo-audio+1.1.1.patch,
// mediaControlsLevel() >= 1): nothing is posted once the service is going, a
// paused notification can be put away (its session stays; playing again
// brings it back), and the service is never started only to be cleared. There
// the app skips the sweeps after a stop, and asks the player whether its
// notification is still on instead of guessing from what is on show. Leftovers
// from an older binary still go at launch. Level 2 adds previous and next to the
// notification and the lock screen (onTrackCommand), as iOS has them.

import { AudioModule } from 'expo-audio';
import * as Notifications from 'expo-notifications';

/**
 * Which fixes of Revisely's expo-audio patch this binary carries: 1 = the
 * notification's service, 2 = also previous and next on it (1.0.4 on). 0 on
 * older binaries, on iOS and in tests.
 */
export function mediaControlsLevel(): number {
  try {
    const level = (AudioModule as { reviselyMediaControls?: unknown } | undefined)?.reviselyMediaControls;
    return typeof level === 'number' ? level : 0;
  } catch {
    return 0;
  }
}

type RemoteCommandModule = {
  addListener?: (event: string, listener: (e: { command?: unknown }) => void) => { remove(): void };
};

/**
 * Previous (-1) and next (1) pressed on Android's notification or lock screen,
 * on a binary that has them (level 2). Null where there are none to listen to.
 */
export function onTrackCommand(listener: (direction: 1 | -1) => void): { remove(): void } | null {
  if (mediaControlsLevel() < 2) return null;
  try {
    const module = AudioModule as unknown as RemoteCommandModule | undefined;
    return (
      module?.addListener?.('reviselyRemoteCommand', (e) => {
        if (e?.command === 'next') listener(1);
        else if (e?.command === 'previous') listener(-1);
      }) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Whether a player's notification and lock screen controls are still on, on a
 * binary with the fix (they go when the app's task is removed). True where the
 * player can't say.
 */
export function stillOnLockScreen(player: object): boolean {
  try {
    const on = (player as { reviselyIsActiveForLockScreen?: unknown }).reviselyIsActiveForLockScreen;
    return typeof on === 'boolean' ? on : true;
  } catch {
    return true;
  }
}

/** Java's String.hashCode (32-bit). */
export function javaStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** The id expo-audio posts its notification under once its service has lost the player. */
export const ORPHAN_NOTIFICATION_ID = javaStringHash('expo_audio_channel');

// How expo-notifications names a notification it didn't post (its tag and id).
const FOREIGN = /^expo-notifications:\/\/foreign_notifications\?/;

/** The id of a notification another part of the app posted, from its identifier. */
export function foreignNotificationId(identifier: string): { id: number; tagged: boolean } | null {
  if (!FOREIGN.test(identifier)) return null;
  const id = /[?&]id=(-?\d+)/.exec(identifier);
  if (!id) return null;
  return { id: Number(id[1]), tagged: /[?&]tag=/.test(identifier) };
}

export interface MediaNotifications {
  /** Identifiers of expo-audio's media notifications on show (live or left over). */
  media: string[];
  /** Identifiers of notifications at its fallback id: never live. */
  orphans: string[];
}

/** expo-audio's notifications on show now (Android). */
export async function readMediaNotifications(): Promise<MediaNotifications> {
  const out: MediaNotifications = { media: [], orphans: [] };
  for (const n of await Notifications.getPresentedNotificationsAsync()) {
    const identifier = n.request.identifier;
    const foreign = foreignNotificationId(identifier);
    if (!foreign || foreign.tagged) continue;
    if (foreign.id === ORPHAN_NOTIFICATION_ID) out.orphans.push(identifier);
    else if (isMediaStyle(n.request.content.data)) out.media.push(identifier);
  }
  return out;
}

// A notification's extras, which expo-notifications passes as its data: a media
// notification's template is Notification.MediaStyle (or Media3's own, by name).
function isMediaStyle(data: Record<string, unknown> | null | undefined): boolean {
  const template = data?.['android.template'] ?? data?.['androidx.core.app.extra.COMPAT_TEMPLATE'];
  return typeof template === 'string' && template.includes('MediaStyle');
}

export async function dismissNotifications(identifiers: string[]): Promise<void> {
  await Promise.all(identifiers.map((id) => Notifications.dismissNotificationAsync(id)));
}
