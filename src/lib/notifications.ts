import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { logger } from './logger';
import { NOTIFICATION_LIGHT_COLOR } from '../theme/v2';
import {
  PRAYER_CHANNEL_ID,
  PRAYER_SILENT_CHANNEL_ID,
  REMINDER_CHANNEL_ID,
  REMINDER_SILENT_CHANNEL_ID,
} from './notificationChannels';
import { notificationBehavior } from './prayer/soundPreview';

export { REMINDER_CHANNEL_ID };

// Shown with its sound while the app is open; a prayer sound's preview is only
// heard (lib/prayer/soundPreview).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => notificationBehavior(notification),
});

/**
 * Android's notification channels, as Settings → Apps → Revisely → Notifications
 * lists them. The revision reminders and the reading timer use 'default' (its id since
 * the first version; it was also named "default"); the silent revision reminders
 * and prayer notifications theirs, each with a silent one (lib/notificationChannels). Without a channel a scheduled
 * notification went to expo-notifications' "Miscellaneous". Recitation's controls
 * (expo-audio) use its own channel, which it creates only when it is missing and
 * names after its id: made here first, it has a name.
 */
const PLAYBACK_CHANNEL_ID = 'expo_audio_channel';

export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Promise.all([
      Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: 'Reminders',
        description: 'Your revision reminders and the reading timer.',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: NOTIFICATION_LIGHT_COLOR,
      }),
      Notifications.setNotificationChannelAsync(REMINDER_SILENT_CHANNEL_ID, {
        name: 'Reminders (silent)',
        description: 'Revision reminders set to go quietly: overnight, and the congratulation.',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: null,
        enableVibrate: false,
      }),
      Notifications.setNotificationChannelAsync(PRAYER_CHANNEL_ID, {
        name: 'Prayer times',
        description: 'A prayer’s time, or a reminder before it, with the standard tone.',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: NOTIFICATION_LIGHT_COLOR,
      }),
      Notifications.setNotificationChannelAsync(PRAYER_SILENT_CHANNEL_ID, {
        name: 'Prayer times (silent)',
        description: 'Prayer notifications set to Silent.',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: null,
        enableVibrate: false,
      }),
      Notifications.setNotificationChannelAsync(PLAYBACK_CHANNEL_ID, {
        name: 'Recitation',
        description: 'Play and pause a recitation from the notification and the lock screen.',
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        showBadge: false,
      }),
    ]);
  } catch (error) {
    logger.log('Could not set up notification channels:', error);
  }
}

// Requests notification permission (idempotent — no-op if already granted).
// Returns true if the user has granted permission, false otherwise.
// Works on simulators for local notifications; the device gate only applies
// to fetching a push token below.
export async function ensureNotificationsPermission(): Promise<boolean> {
  await ensureAndroidChannels();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function registerForPushNotificationsAsync() {
  const granted = await ensureNotificationsPermission();
  if (!granted) {
    logger.log('Notification permission not granted');
    return;
  }

  if (!Device.isDevice) {
    logger.log('Must use physical device for push token');
    return;
  }

  try {
    return (await Notifications.getExpoPushTokenAsync()).data;
  } catch (error) {
    logger.log('Error getting push token:', error);
  }
}

export async function scheduleDangerAlert(juz: number, enabled: boolean) {
  if (!enabled) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Time to review',
      body: `Juz ${juz} is due for review`,
      sound: true,
    },
    trigger: { channelId: REMINDER_CHANNEL_ID }, // Immediate
  });
}
