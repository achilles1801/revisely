import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { logger } from './logger';
import { NOTIFICATION_LIGHT_COLOR } from '../theme/v2';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Requests notification permission (idempotent — no-op if already granted).
// Returns true if the user has granted permission, false otherwise.
// Works on simulators for local notifications; the device gate only applies
// to fetching a push token below.
export async function ensureNotificationsPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: NOTIFICATION_LIGHT_COLOR,
    });
  }

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

/** The daily reminder's identifier: scheduling it again replaces it. */
export const DAILY_REMINDER_ID = 'daily-reminder';

// Before it had a name, the reminder was scheduled without an identifier, and
// expo-notifications gave it a random UUID. Every other notification the app
// schedules has a name (the reading timer's is 'reading-timer-complete'), so a
// UUID is an old reminder. Give any new notification a name too.
const UNNAMED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cancels the daily reminder and nothing else. It used to cancel every
 * scheduled notification, which took the reading timer's "session complete"
 * with it (the reminder is rescheduled at each launch).
 */
export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => UNNAMED.test(n.identifier))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
  } catch (error) {
    logger.log('Could not list scheduled notifications:', error);
  }
}

export async function scheduleDailyReminder(time: string, enabled: boolean) {
  await cancelDailyReminder();
  if (!enabled) return;

  const [hours, minutes] = time.split(':').map(Number);

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: 'Revisely',
      body: 'Time for your daily Quran revision',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hours,
      minute: minutes,
    },
  });
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
    trigger: null, // Immediate
  });
}
