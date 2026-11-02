// Scheduling the planned prayer notifications (lib/prayer/schedule) with
// expo-notifications, on the phone: no server, no push. Only identifiers that
// start with "prayer-" are touched; the daily reminder's and the reading
// timer's are left alone (and counted against the 64). A notification already
// scheduled exactly as planned is left as it is; one that changed (a new time,
// sound or text) is replaced under the same identifier; one no longer planned
// is cancelled. Runs one at a time.

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../logger';
import { PRAYER_CHANNEL_ID, PRAYER_SILENT_CHANNEL_ID } from '../notificationChannels';
import type { PrayerSound } from './prefs';
import {
  interruptionFor,
  PlannedNotification,
  PRAYER_ID_PREFIX,
  planPrayerNotifications,
  prayerBudget,
  signature,
} from './schedule';

const SIGNATURES_KEY = '@revisely_prayer_scheduled';

/** Android takes the sound from the channel, so "silent" has its own. */
export function androidChannel(sound: PrayerSound): string {
  return sound === 'standard' ? PRAYER_CHANNEL_ID : PRAYER_SILENT_CHANNEL_ID;
}

type PlanInput = Omit<Parameters<typeof planPrayerNotifications>[0], 'budget'>;

let chain: Promise<unknown> = Promise.resolve();

/** Schedule `input`'s plan (or cancel every prayer notification when nothing is on). */
export function syncPrayerNotifications(input: PlanInput): Promise<PlannedNotification[]> {
  const run = chain.then(() => syncNow(input));
  chain = run.catch(() => undefined);
  return run;
}

/** Cancel every prayer notification (signed out, or no longer a tester). */
export function clearPrayerNotifications(): Promise<PlannedNotification[]> {
  return syncPrayerNotifications({ now: new Date(), days: [], alerts: NONE, place: null });
}

const OFF = { on: false, before: 0, sound: 'standard' } as const;
const NONE = { fajr: OFF, dhuhr: OFF, asr: OFF, maghrib: OFF, isha: OFF };

async function syncNow(input: PlanInput): Promise<PlannedNotification[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = new Set(scheduled.map((n) => n.identifier).filter((id) => id.startsWith(PRAYER_ID_PREFIX)));
  const others = scheduled.length - ours.size;
  const plan = planPrayerNotifications({ ...input, budget: prayerBudget(others) });

  let saved: Record<string, string> = {};
  try {
    saved = JSON.parse((await AsyncStorage.getItem(SIGNATURES_KEY)) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  const planned = new Set(plan.map((p) => p.id));
  await Promise.all(
    [...ours]
      .filter((id) => !planned.has(id))
      .map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)),
  );
  const next: Record<string, string> = {};
  for (const n of plan) {
    const sig = signature(n);
    next[n.id] = sig;
    if (ours.has(n.id) && saved[n.id] === sig) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: n.id,
        content: {
          title: n.title,
          body: n.body,
          sound: n.sound === 'standard',
          interruptionLevel: interruptionFor(n.kind),
          data: { kind: 'prayer', prayer: n.prayer ?? null },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: n.at,
          // Android: the sound is the channel's (iOS ignores it).
          channelId: androidChannel(n.sound),
        },
      });
    } catch (err) {
      logger.warn('Could not schedule a prayer notification', err);
      delete next[n.id];
    }
  }
  await AsyncStorage.setItem(SIGNATURES_KEY, JSON.stringify(next)).catch(() => undefined);
  return plan;
}
