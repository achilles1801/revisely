import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { logger } from './logger';

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
      lightColor: '#292524',
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

export async function scheduleDailyReminder(time: string, enabled: boolean) {
  if (!enabled) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  const [hours, minutes] = time.split(':').map(Number);

  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
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
