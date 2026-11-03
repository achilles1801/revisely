import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { logger } from '../logger';
import { PRAYER_CHANNEL_ID } from '../notificationChannels';
import type { PrayerSound } from './prefs';

/**
 * Tapping a sound in a prayer's sheet plays it (#173). The standard tone is the
 * phone's own notification sound, which no API plays by itself and no file
 * holds, so the preview is a notification that is only heard:
 * - posted at once, marked `data.soundPreview`;
 * - the handler (lib/notifications) gives it sound and no banner or list;
 * - iOS then plays its default sound; Android plays the prayer channel's sound
 *   (expo-notifications plays it with RingtoneManager when nothing is shown).
 * So it is exactly what the prayer notification will sound like, including the
 * ring/silent switch and Focus on iOS and the channel's own sound on Android.
 * Silent plays nothing. Without notification permission nothing is asked here
 * (turning the prayer on asked), and nothing plays.
 */
export const SOUND_PREVIEW_ID = 'prayer-sound-preview';

/** How long the preview stays delivered (never shown) before it's cleared. */
const CLEAR_AFTER_MS = 5000;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export function isSoundPreview(n: Notifications.Notification | null | undefined): boolean {
  return n?.request?.content?.data?.soundPreview === true;
}

/** What the handler does with a notification: a preview is heard, not seen. */
export function notificationBehavior(
  n: Notifications.Notification | null | undefined,
): Notifications.NotificationBehavior {
  if (isSoundPreview(n)) {
    return { shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false };
  }
  return { shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true };
}

export type PreviewResult = 'played' | 'silent' | 'no-permission' | 'failed';

export async function previewPrayerSound(sound: PrayerSound): Promise<PreviewResult> {
  if (sound === 'silent') return 'silent';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return 'no-permission';
    if (clearTimer) clearTimeout(clearTimer);
    await Notifications.dismissNotificationAsync(SOUND_PREVIEW_ID).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier: SOUND_PREVIEW_ID,
      content: { title: 'Standard tone', sound: true, data: { soundPreview: true } },
      // Android: the sound is the channel's, as for the prayer notification.
      trigger: Platform.OS === 'android' ? { channelId: PRAYER_CHANNEL_ID } : null,
    });
    clearTimer = setTimeout(() => {
      clearTimer = null;
      Notifications.dismissNotificationAsync(SOUND_PREVIEW_ID).catch(() => undefined);
    }, CLEAR_AFTER_MS);
    return 'played';
  } catch (err) {
    logger.warn('Could not play the sound preview', err);
    return 'failed';
  }
}
