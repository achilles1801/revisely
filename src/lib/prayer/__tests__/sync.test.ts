// Scheduling with expo-notifications (kept in memory here, as iOS keeps them).
const mockPending = new Map<string, { identifier: string; content: { title: string; body: string; sound: boolean }; trigger: { date: Date; channelId?: string } }>();
const mockCalls = { schedule: 0, cancel: 0 };
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockPending.values()]),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    mockCalls.cancel++;
    mockPending.delete(id);
  }),
  scheduleNotificationAsync: jest.fn(async (req: { identifier: string; content: never; trigger: never }) => {
    mockCalls.schedule++;
    mockPending.set(req.identifier, req);
    return req.identifier;
  }),
}));

import { dayTimes, CalcSettings } from '../times';
import { clearPrayerNotifications, syncPrayerNotifications } from '../sync';
import { PLAN_DAYS } from '../schedule';
import type { PrayerAlert, PrayerName } from '../prefs';

const ZERO = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
const S: CalcSettings = { method: 'MoonsightingCommittee', highLatitude: 'recommended', madhab: 'standard', adjustments: ZERO };
const LONDON = { latitude: 51.51, longitude: -0.13 };
const OCT28 = new Date(2026, 9, 28, 12);
const days = (from: Date) =>
  Array.from({ length: PLAN_DAYS }, (_, i) => dayTimes(LONDON, new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12), S));
const on = (before: 0 | 10 = 10): Record<PrayerName, PrayerAlert> => ({
  fajr: { on: true, before, sound: 'standard' },
  dhuhr: { on: true, before, sound: 'standard' },
  asr: { on: true, before, sound: 'standard' },
  maghrib: { on: true, before, sound: 'standard' },
  isha: { on: true, before, sound: 'silent' },
});
const prayerIds = () => [...mockPending.keys()].filter((k) => k.startsWith('prayer-'));

beforeEach(() => {
  mockPending.clear();
  mockCalls.schedule = 0;
  mockCalls.cancel = 0;
  // The daily reminder and a running reading timer.
  mockPending.set('daily-reminder', { identifier: 'daily-reminder' } as never);
  mockPending.set('reading-timer-complete', { identifier: 'reading-timer-complete' } as never);
});

describe('syncPrayerNotifications', () => {
  // An hour after London's Dhuhr (an instant: any machine time zone).
  const now = new Date(dayTimes(LONDON, OCT28, S).dhuhr!.getTime() + 3600_000);

  it('fills the room beside the app’s own notifications, never past 64, and leaves those alone', async () => {
    const plan = await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(), place: 'London' });
    expect(mockPending.size).toBe(64);
    expect(prayerIds()).toHaveLength(62);
    expect(plan).toHaveLength(62);
    expect(mockPending.has('daily-reminder') && mockPending.has('reading-timer-complete')).toBe(true);
    // Silent stays silent.
    const isha = mockPending.get('prayer-2026-10-28-isha')!;
    expect(isha.content.sound).toBe(false);
    expect(isha.trigger.date.getTime()).toBe(dayTimes(LONDON, OCT28, S).isha!.getTime());
    // On Android the sound is the channel's: silent ones go to the silent channel.
    expect(isha.trigger.channelId).toBe('prayer-silent');
    expect(mockPending.get('prayer-2026-10-29-fajr')!.trigger.channelId).toBe('prayer');
  });

  it('again with nothing changed: nothing rescheduled', async () => {
    await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(), place: 'London' });
    mockCalls.schedule = 0;
    mockCalls.cancel = 0;
    await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(), place: 'London' });
    expect(mockCalls.schedule).toBe(0);
    expect(mockCalls.cancel).toBe(0);
  });

  it('a day later (opening the app): the window moves on, topped up to the full room', async () => {
    await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(), place: 'London' });
    const later = new Date(now.getTime() + 86_400_000);
    // What iOS delivered since is no longer pending.
    for (const [id, n] of mockPending) if (n.trigger?.date && n.trigger.date.getTime() <= later.getTime()) mockPending.delete(id);
    const before = prayerIds().length;
    await syncPrayerNotifications({ now: later, days: days(new Date(2026, 9, 29, 12)), alerts: on(), place: 'London' });
    expect(before).toBeLessThan(62);
    expect(prayerIds()).toHaveLength(62);
    expect(mockPending.size).toBe(64);
    // The newest day reaches further than before.
    expect(prayerIds().some((id) => id.startsWith('prayer-2026-11-04'))).toBe(true);
  });

  it('a setting changed (a reminder off): the reminders go, the rest stay as they were', async () => {
    await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(10), place: 'London' });
    mockCalls.schedule = 0;
    await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(0), place: 'London' });
    expect(prayerIds().some((id) => id.endsWith('-before'))).toBe(false);
    // Freed room: more days of prayers, only new ones scheduled.
    expect(prayerIds()).toHaveLength(62);
    expect(mockCalls.schedule).toBeLessThan(62);
  });

  it('a new time zone (times read differently): the changed ones are replaced under the same ids', async () => {
    await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(), place: 'London' });
    mockCalls.schedule = 0;
    await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(), place: 'London', format: (d) => `${d.getUTCHours()}:${d.getUTCMinutes()} UTC` });
    expect(mockCalls.schedule).toBeGreaterThan(30);
    expect(prayerIds()).toHaveLength(62);
    expect(mockPending.get('prayer-2026-10-28-asr')!.content.body).toMatch(/UTC$/);
  });

  it('turned off: every prayer notification cancelled, nothing else', async () => {
    await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(), place: 'London' });
    await clearPrayerNotifications();
    expect(prayerIds()).toHaveLength(0);
    expect([...mockPending.keys()].sort()).toEqual(['daily-reminder', 'reading-timer-complete']);
  });

  it('notifications cleared behind its back (iOS, a reinstall): scheduled again', async () => {
    await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(), place: 'London' });
    for (const id of prayerIds()) mockPending.delete(id);
    await syncPrayerNotifications({ now, days: days(OCT28), alerts: on(), place: 'London' });
    expect(prayerIds()).toHaveLength(62);
  });
});
