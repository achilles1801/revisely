// Revision reminders (issue #174): three a day while today's revision isn't
// done, planned from what the app knows now. Pure: lib/reminders/sync schedules
// the result, and the copy comes from lib/reminders/copy.
//
// - Morning: 8:00 AM, each revision day (an account that picked another time
//   when Settings still offered one keeps it; see morningTime).
// - Midday: 20 minutes after Asr (the prayer place), or 3:00 PM without one.
// - Evening: an hour before the revision day ends (midnight, or fajr when
//   "Start day at fajr" is on). Between midnight and fajr it is passive: no
//   sound, no light.
// Done for today: the rest of today's reminders go, and the next one becomes a
// single silent congratulation (none if it would land overnight).
// Two within 30 minutes become one (the later one stays).

import { generateDailyAssignment } from '../algorithm';
import { getFajrTimeFor, getNextRevisionDayStart, getRevisionDateForUser, getRevisionDayForUser } from '../fajrBoundary';
import type { Place } from '../prayer/prefs';
import { dayTimes, type CalcSettings } from '../prayer/times';
import { aliveStreak } from '../widgets/snapshot';
import type { QuranPage, RevisionLog, User, UserPage } from '../../types';
import { reminderCopy, type ReminderKind } from './copy';

/** Every revision reminder's identifier starts with this; nothing else's does. */
export const REVISION_REMINDER_PREFIX = 'revision-reminder-';
const MIDDAY_AFTER_ASR_MS = 20 * 60_000;
const NO_PLACE_MIDDAY = { hour: 15, minute: 0 };
const HOUR_MS = 3_600_000;
const MERGE_WITHIN_MS = 30 * 60_000;
const DEFAULT_MORNING = { hour: 8, minute: 0 };

/**
 * The morning reminder's clock time: 8:00 AM, or the time the account picked
 * before Settings stopped offering one (kept, with no way to change it).
 */
export function morningTime(user: { reminderTime?: string | null }): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(user.reminderTime ?? '');
  if (!m) return DEFAULT_MORNING;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : DEFAULT_MORNING;
}

export interface PlannedReminder {
  id: string;
  at: Date;
  title: string;
  body: string;
  /** Passive: no sound and no light (overnight, and every congratulation). */
  interruption: 'active' | 'passive';
  kind: ReminderKind;
  /** The revision day it belongs to, 'YYYY-MM-DD'. */
  day: string;
}

export interface PlanReminderInput {
  now: Date;
  /** The account, with onboarding done and notifications on. */
  user: User;
  /** The name to greet by. */
  name: string;
  pages: UserPage[];
  logs: RevisionLog[];
  quranData: QuranPage[];
  /** Where Asr is worked out (the prayer place), if the phone has one. */
  place: Place | null;
  settings: CalcSettings;
}

interface Revision {
  day: string;
  /** Local midnight of the revision day. */
  date: Date;
  start: Date;
  end: Date;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The revision day that holds `instant`, with its span (fajr or midnight to the next). */
function revisionAt(user: User, instant: Date): Revision {
  const day = getRevisionDayForUser(user, instant);
  const date = getRevisionDateForUser(user, instant);
  const fajr = user.fajrBoundaryEnabled && user.locationCoords ? getFajrTimeFor(date, user) : null;
  return { day, date, start: fajr ?? date, end: getNextRevisionDayStart(user, instant) };
}

function dayOrdinal(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

interface Slot {
  kind: 'morning' | 'midday' | 'evening';
  at: Date;
}

/** The reminders that fall inside the revision day, after now, merged when close. */
function slotsFor(rev: Revision, input: PlanReminderInput): Slot[] {
  const { hour, minute } = morningTime(input.user);
  const inDay = (at: Date) =>
    at.getTime() > input.now.getTime() && at.getTime() >= rev.start.getTime() && at.getTime() < rev.end.getTime();
  const slots: Slot[] = [];
  const first = startOfDay(rev.start);
  // The day's clock times can fall on the next calendar date (a fajr day).
  for (const offset of [0, 1]) {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset);
    const morning = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
    if (inDay(morning)) slots.push({ kind: 'morning', at: morning });

    const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
    const asr = input.place ? dayTimes(input.place, noon, input.settings).asr : null;
    const midday = asr
      ? new Date(asr.getTime() + MIDDAY_AFTER_ASR_MS)
      : new Date(d.getFullYear(), d.getMonth(), d.getDate(), NO_PLACE_MIDDAY.hour, NO_PLACE_MIDDAY.minute);
    if (inDay(midday)) slots.push({ kind: 'midday', at: midday });
  }
  const evening = new Date(rev.end.getTime() - HOUR_MS);
  if (inDay(evening)) slots.push({ kind: 'evening', at: evening });

  // Two due within 30 minutes become one: the earlier is dropped.
  const sorted = slots.sort((a, b) => a.at.getTime() - b.at.getTime());
  return sorted.filter((s, i) => !(i + 1 < sorted.length && sorted[i + 1].at.getTime() - s.at.getTime() <= MERGE_WITHIN_MS));
}

export function planRevisionReminders(input: PlanReminderInput): PlannedReminder[] {
  const { user, now } = input;
  const today = revisionAt(user, now);
  const tomorrow = revisionAt(user, today.end);
  const pagesOf = (rev: Revision) => generateDailyAssignment(input.pages, input.quranData, user, rev.date).pages;
  const todayPages = pagesOf(today);
  const tomorrowPages = pagesOf(tomorrow);

  const todayRevised = new Set(input.logs.filter((l) => l.date === today.day).flatMap((l) => l.pagesRevised));
  // As Home and the widget: done once as many pages were revised as are assigned.
  const doneToday = todayRevised.size > 0 && todayRevised.size >= todayPages.length;
  const streak = aliveStreak(new Set(input.logs.map((l) => l.date)), today.day);
  const beforeNoon = morningTime(user).hour < 12;
  const juzPlan = user.scheduleMode === 'juz';

  const planned: PlannedReminder[] = [];
  const add = (rev: Revision, all: number[], revised: Set<number>, kind: ReminderKind, at: Date, index: number) => {
    const overnight = dayKey(at) !== dayKey(rev.start);
    const remaining = all.filter((p) => !revised.has(p));
    const copy = reminderCopy({
      kind,
      juzPlan,
      name: input.name,
      beforeNoon,
      all,
      remaining: kind === 'congrat' ? [] : remaining,
      overnight,
      streak,
      tomorrow: tomorrowPages,
      variant: dayOrdinal(rev.day) + index,
    });
    planned.push({
      id: `${REVISION_REMINDER_PREFIX}${rev.day}-${kind}`,
      at,
      title: copy.title,
      body: copy.body,
      interruption: kind === 'congrat' || overnight ? 'passive' : 'active',
      kind,
      day: rev.day,
    });
  };

  // Today: when done, only the next reminder remains, as the congratulation.
  const todaySlots = todayPages.length > 0 ? slotsFor(today, input) : [];
  if (doneToday) {
    const next = todaySlots[0];
    if (next && dayKey(next.at) === dayKey(today.start)) add(today, todayPages, todayRevised, 'congrat', next.at, 0);
  } else {
    todaySlots.forEach((slot, i) => add(today, todayPages, todayRevised, slot.kind, slot.at, i));
  }

  // Tomorrow: nothing revised yet.
  if (tomorrowPages.length > 0) {
    slotsFor(tomorrow, input).forEach((slot, i) => add(tomorrow, tomorrowPages, new Set(), slot.kind, slot.at, i + 1));
  }

  return planned;
}
