// Android: the media notification expo-audio 1.1 shows for a recitation (its
// AudioControlsService) can outlive what it controls.
//
// Swiping the app away makes Media3's MediaSessionService.onTaskRemoved pause the
// player and stop the service (expo-audio bypasses Media3's own notification
// manager, so Media3 never counts the playback as ongoing). expo-audio's onDestroy
// releases the session but leaves its listener on our player, still marked as on
// the lock screen. The next thing that player does (a resume, the next verse)
// makes that listener post the notification again for a session that no longer
// exists: no buttons, a progress bar that doesn't move, under the id expo-audio
// falls back to when it has no player ("expo_audio_channel".hashCode() in Java),
// which nothing cancels. It stays after the app is closed.
//
// Until expo-audio itself is fixed (a native change), lib/recitation works around
// it: it frees its player rather than clearing the lock screen (clearing it once
// the service is gone starts the service again with nothing to show), checks that
// the notification is still there when the app comes back or is paused from
// outside, and dismisses the orphan.

import * as Notifications from 'expo-notifications';

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
  /** expo-audio's notification is up, backed by its service. */
  live: boolean;
  /** Identifiers of orphans (see above), to dismiss. */
  orphans: string[];
}

/** expo-audio's notifications on show now (Android). */
export async function readMediaNotifications(): Promise<MediaNotifications> {
  const out: MediaNotifications = { live: false, orphans: [] };
  for (const n of await Notifications.getPresentedNotificationsAsync()) {
    const identifier = n.request.identifier;
    const foreign = foreignNotificationId(identifier);
    if (!foreign || foreign.tagged) continue;
    if (foreign.id === ORPHAN_NOTIFICATION_ID) out.orphans.push(identifier);
    else if (isMediaStyle(n.request.content.data)) out.live = true;
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
