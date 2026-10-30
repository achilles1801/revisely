// Which prayer notifications to schedule (pure; lib/prayer/sync schedules
// them). iOS keeps the 64 soonest pending local notifications per app, shared
// with the daily reminder and the reading timer, so prayer notifications get
// what is left: soonest first, and the last slot asks to open the app, which
// tops the window up again.

import type { PrayerAlert, PrayerName, PrayerSound } from './prefs';
import { PRAYERS } from './prefs';
import { DayTimes, formatTime, TIME_LABELS } from './times';

/** Every prayer notification's identifier starts with this; nothing else's does. */
export const PRAYER_ID_PREFIX = 'prayer-';
export const KEEP_GOING_ID = 'prayer-keep-going';
export const IOS_PENDING_LIMIT = 64;
/** Kept for the app's other notifications even while they aren't scheduled
 *  (the daily reminder and the reading timer's). */
export const RESERVED_FOR_OTHERS = 2;
/** Days of times worked out; the budget usually ends the window sooner. */
export const PLAN_DAYS = 14;

/** How a notification may interrupt (iOS 15+): a prayer's time breaks through
 *  Focus and the summary (Time Sensitive, once the app has the entitlement; until
 *  then iOS treats it as an ordinary one); a reminder before it is ordinary;
 *  "keep going" never lights the screen. */
export type Interruption = 'timeSensitive' | 'active' | 'passive';

export function interruptionFor(kind: PlannedNotification['kind']): Interruption {
  return kind === 'at' ? 'timeSensitive' : kind === 'before' ? 'active' : 'passive';
}

export interface PlannedNotification {
  id: string;
  at: Date;
  title: string;
  body: string;
  sound: PrayerSound;
  kind: 'at' | 'before' | 'keep-going';
  prayer?: PrayerName;
}

/** prayer-2026-10-28-asr, prayer-2026-10-28-asr-before. */
export function prayerNotificationId(day: string, prayer: PrayerName, before = false): string {
  return `${PRAYER_ID_PREFIX}${day}-${prayer}${before ? '-before' : ''}`;
}

/** Room for prayer notifications beside `others` of the app's own. */
export function prayerBudget(others: number): number {
  return Math.max(0, IOS_PENDING_LIMIT - Math.max(others, RESERVED_FOR_OTHERS));
}

export function planPrayerNotifications({
  now,
  days,
  alerts,
  budget,
  place,
  format = formatTime,
}: {
  now: Date;
  /** The days' times, in order. */
  days: DayTimes[];
  alerts: Record<PrayerName, PrayerAlert>;
  budget: number;
  /** "London", for the reminder's line. */
  place: string | null;
  format?: (d: Date) => string;
}): PlannedNotification[] {
  const all: PlannedNotification[] = [];
  for (const day of days) {
    for (const prayer of PRAYERS) {
      const alert = alerts[prayer];
      const at = day[prayer];
      if (!alert.on || !at) continue;
      const name = TIME_LABELS[prayer].en;
      const time = format(at);
      if (at.getTime() > now.getTime()) {
        all.push({
          id: prayerNotificationId(day.day, prayer),
          at,
          title: name,
          body: `It’s time for ${name} · ${time}`,
          sound: alert.sound,
          kind: 'at',
          prayer,
        });
      }
      if (alert.before > 0) {
        const early = new Date(at.getTime() - alert.before * 60_000);
        if (early.getTime() > now.getTime()) {
          all.push({
            id: prayerNotificationId(day.day, prayer, true),
            at: early,
            title: `${name} in ${alert.before} minutes`,
            body: place ? `${time} · ${place}` : time,
            sound: alert.sound,
            kind: 'before',
            prayer,
          });
        }
      }
    }
  }
  if (all.length === 0 || budget < 2) return [];
  all.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  const kept = all.slice(0, budget - 1);
  const last = kept[kept.length - 1].at;
  return [
    ...kept,
    {
      id: KEEP_GOING_ID,
      at: new Date(last.getTime() + 60_000),
      title: 'Prayer notifications',
      body: 'Open Revisely to keep your prayer notifications going.',
      sound: 'silent',
      kind: 'keep-going',
    },
  ];
}

/** Days covered by a plan, counting today (for "the next 6 days"). */
export function planDays(plan: PlannedNotification[], now: Date): number {
  const prayers = plan.filter((p) => p.kind !== 'keep-going');
  if (prayers.length === 0) return 0;
  const last = prayers[prayers.length - 1].at;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** What a scheduled notification must match to be left as it is. */
export function signature(n: PlannedNotification): string {
  return `${n.at.getTime()}|${n.title}|${n.body}|${n.sound}`;
}
