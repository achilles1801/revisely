import { dayTimes, CalcSettings } from '../times';
import {
  interruptionFor,
  KEEP_GOING_ID,
  planDays,
  planPrayerNotifications,
  prayerBudget,
  prayerNotificationId,
  PLAN_DAYS,
} from '../schedule';
import type { PrayerAlert, PrayerName } from '../prefs';

const ZERO = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
const S: CalcSettings = { method: 'MoonsightingCommittee', highLatitude: 'recommended', madhab: 'standard', adjustments: ZERO };
const LONDON = { latitude: 51.51, longitude: -0.13 };
const OCT28 = new Date(2026, 9, 28, 12);
// An hour after London's Dhuhr (an instant, so the test doesn't depend on the
// machine's time zone; days are named by the date asked for).
const now = new Date(dayTimes(LONDON, OCT28, S).dhuhr!.getTime() + 3600_000);
const days = (from = OCT28, n = PLAN_DAYS) =>
  Array.from({ length: n }, (_, i) => dayTimes(LONDON, new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12), S));
const alerts = (on: Partial<Record<PrayerName, Partial<PrayerAlert>>>) => {
  const off: PrayerAlert = { on: false, before: 0, sound: 'standard' };
  return {
    fajr: { ...off, ...on.fajr },
    dhuhr: { ...off, ...on.dhuhr },
    asr: { ...off, ...on.asr },
    maghrib: { ...off, ...on.maghrib },
    isha: { ...off, ...on.isha },
  };
};
const ALL_WITH_REMINDERS = alerts({
  fajr: { on: true, before: 10 },
  dhuhr: { on: true, before: 10 },
  asr: { on: true, before: 15 },
  maghrib: { on: true, before: 15 },
  isha: { on: true, before: 10 },
});

describe('prayer notification plan', () => {
  it('the budget: 64 less the others, never less than the room kept for them', () => {
    expect(prayerBudget(0)).toBe(62);
    expect(prayerBudget(1)).toBe(62);
    expect(prayerBudget(5)).toBe(59);
    expect(prayerBudget(70)).toBe(0);
  });

  it('every prayer with a reminder: the soonest that fit, then "keep going" last; about 6 days', () => {
    const plan = planPrayerNotifications({ now, days: days(), alerts: ALL_WITH_REMINDERS, budget: prayerBudget(1), place: 'London' });
    expect(plan).toHaveLength(62);
    expect(plan[plan.length - 1].id).toBe(KEEP_GOING_ID);
    const prayers = plan.slice(0, -1);
    // In order, all in the future, ids unique.
    for (let i = 1; i < prayers.length; i++) expect(prayers[i].at.getTime()).toBeGreaterThanOrEqual(prayers[i - 1].at.getTime());
    expect(prayers.every((p) => p.at.getTime() > now.getTime())).toBe(true);
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
    expect(plan[plan.length - 1].at.getTime()).toBeGreaterThan(prayers[prayers.length - 1].at.getTime());
    // About six days: the last prayer is on the 3rd or 4th of November.
    expect(prayers[prayers.length - 1].id).toMatch(/^prayer-2026-11-0[34]-/);
    expect(planDays(plan, now)).toBeGreaterThanOrEqual(6);
    expect(planDays(plan, now)).toBeLessThanOrEqual(8);
    // Today: Dhuhr has gone, Asr's reminder and Asr come first.
    expect(prayers[0].id).toBe(prayerNotificationId('2026-10-28', 'asr', true));
    expect(prayers[1].id).toBe(prayerNotificationId('2026-10-28', 'asr'));
  });

  it('what they say: at the time, and before', () => {
    const plan = planPrayerNotifications({ now, days: days(OCT28, 1), alerts: ALL_WITH_REMINDERS, budget: 62, place: 'London', format: () => '4:44 PM' });
    const before = plan.find((p) => p.id === 'prayer-2026-10-28-maghrib-before')!;
    expect(before).toMatchObject({ title: 'Maghrib in 15 minutes', body: '4:44 PM · London', kind: 'before' });
    const at = plan.find((p) => p.id === 'prayer-2026-10-28-asr')!;
    expect(at).toMatchObject({ title: 'Asr', body: 'It’s time for Asr · 4:44 PM', kind: 'at' });
  });

  it('fewer on: more days, up to the days worked out', () => {
    // Today's Fajr has gone: the next 13, then "keep going".
    const plan = planPrayerNotifications({ now, days: days(), alerts: alerts({ fajr: { on: true } }), budget: 62, place: null });
    expect(plan).toHaveLength(PLAN_DAYS);
    expect(plan[plan.length - 2].id).toBe('prayer-2026-11-10-fajr');
  });

  it('a silent prayer stays silent; off prayers are left out', () => {
    const plan = planPrayerNotifications({ now, days: days(OCT28, 3), alerts: alerts({ isha: { on: true, sound: 'silent' } }), budget: 62, place: null });
    expect(plan.filter((p) => p.kind !== 'keep-going').every((p) => p.prayer === 'isha' && p.sound === 'silent')).toBe(true);
  });

  it('the athan is for the time itself: its reminder before has the standard tone', () => {
    const plan = planPrayerNotifications({ now, days: days(OCT28, 2), alerts: alerts({ maghrib: { on: true, before: 15, sound: 'athan' } }), budget: 62, place: null });
    const at = plan.filter((p) => p.kind === 'at');
    const before = plan.filter((p) => p.kind === 'before');
    expect(at.length).toBeGreaterThan(0);
    expect(at.every((p) => p.sound === 'athan')).toBe(true);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((p) => p.sound === 'standard')).toBe(true);
  });

  it('a prayer’s time is Time Sensitive; its reminder ordinary; "keep going" passive', () => {
    expect(interruptionFor('at')).toBe('timeSensitive');
    expect(interruptionFor('before')).toBe('active');
    expect(interruptionFor('keep-going')).toBe('passive');
  });

  it('nothing on, or no room: nothing at all (no lone "keep going")', () => {
    expect(planPrayerNotifications({ now, days: days(), alerts: alerts({}), budget: 62, place: null })).toEqual([]);
    expect(planPrayerNotifications({ now, days: days(), alerts: ALL_WITH_REMINDERS, budget: 1, place: null })).toEqual([]);
  });

  it('a reminder whose time has passed is left out, the prayer itself kept', () => {
    // Asr's reminder (15 min before) has gone, Asr hasn't.
    const asr = days(OCT28, 1)[0].asr!;
    const plan = planPrayerNotifications({ now: new Date(asr.getTime() - 5 * 60_000), days: days(OCT28, 1), alerts: ALL_WITH_REMINDERS, budget: 62, place: null });
    expect(plan.map((p) => p.id)).toContain('prayer-2026-10-28-asr');
    expect(plan.map((p) => p.id)).not.toContain('prayer-2026-10-28-asr-before');
  });
});
