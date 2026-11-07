// Scheduling the revision reminders (lib/reminders/plan) with expo-notifications,
// on the phone. Only identifiers that start with "revision-reminder-" are
// touched, plus the daily reminder that Revisely used to schedule (its
// "daily-reminder" id, and the unnamed ones of the first versions): prayer
// notifications and the reading timer's are left alone. Runs one at a time.

import * as Notifications from 'expo-notifications';
import { logger } from '../logger';
import { REMINDER_CHANNEL_ID, REMINDER_SILENT_CHANNEL_ID } from '../notificationChannels';
import { REVISION_REMINDER_PREFIX, type PlannedReminder } from './plan';

const LEGACY_DAILY_ID = 'daily-reminder';
// Before it had a name, the daily reminder was scheduled without an identifier,
// and expo-notifications gave it a random UUID.
const UNNAMED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isOurs = (id: string) => id.startsWith(REVISION_REMINDER_PREFIX);
const isLegacy = (id: string) => id === LEGACY_DAILY_ID || UNNAMED.test(id);

let chain: Promise<unknown> = Promise.resolve();

/** Replace every revision reminder with `planned` (and drop the old daily one). */
export function syncRevisionReminders(planned: PlannedReminder[]): Promise<void> {
  const run = chain.then(() => syncNow(planned));
  chain = run.catch(() => undefined);
  return run;
}

/** Cancel every revision reminder (signed out, notifications off, or no permission). */
export function clearRevisionReminders(): Promise<void> {
  return syncRevisionReminders([]);
}

async function syncNow(planned: PlannedReminder[]): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const stale = scheduled.map((n) => n.identifier).filter((id) => isOurs(id) || isLegacy(id));
  await Promise.all(stale.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));

  for (const r of planned) {
    const active = r.interruption === 'active';
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: {
          title: r.title,
          body: r.body,
          sound: active,
          interruptionLevel: r.interruption,
          data: { kind: 'revision-reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: r.at,
          // Android: the sound is the channel's (iOS uses the content's).
          channelId: active ? REMINDER_CHANNEL_ID : REMINDER_SILENT_CHANNEL_ID,
        },
      });
    } catch (err) {
      logger.warn('Could not schedule a revision reminder', err);
    }
  }
}

/** Lift this app's revision reminders off the lock screen (a session was opened). */
export async function dismissPresentedRevisionReminders(): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .map((n) => n.request.identifier)
        .filter(isOurs)
        .map((id) => Notifications.dismissNotificationAsync(id).catch(() => undefined)),
    );
  } catch (err) {
    logger.log('Could not dismiss revision reminders:', err);
  }
}
