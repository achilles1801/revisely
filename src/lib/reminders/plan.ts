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
//
// The plan is made again each time the app runs (RevisionRemindersSync), so
// only today's and tomorrow's are planned in full. The days after get one each
// (laterDays, REMIND-2; behind its own switch, lib/release/remindersWhileAway):
// someone who doesn't open the app would otherwise hear nothing after tomorrow. Nov 2026: of the accounts that never came back after
// their first day, almost none opened the app again, and those with reminders
// on came back no more often than those without.

import { generateDailyAssignment } from '../algorithm';
import { getNextRevisionDayStart, getRevisionDateForUser, getRevisionDayForUser } from '../fajrBoundary';
import type { Place } from '../prayer/prefs';
import { dayTimes, type CalcSettings } from '../prayer/times';
import { streakFromLogs } from '../streak';
import { dayProgress } from '../todaySnapshot';
import { streakReadingFromItems, type HistoryItem } from '../streakFromItems';
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
 * Revision days after tomorrow that still get one reminder (the morning one, or
 * the day's first): a week of them counting today, then none until the app is
 * opened again. Only someone who hasn't opened it since sees them (REMIND-2).
 */
export const LATER_DAYS = 6;

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
  /** The Activity items' history (C5): the streak is read from it once loaded; the logs until then. */
  history?: HistoryItem[] | null;
  quranData: QuranPage[];
  /** Where Asr is worked out (the prayer place), if the phone has one. */
  place: Place | null;
  settings: CalcSettings;
  /** Days after tomorrow with one reminder each (REMIND-2): LATER_DAYS, or 0 (the default) for none. */
  laterDays?: number;
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

/**
 * When the revision day holding `instant` began: the last time the day changed at or before it (Fajr or midnight, read
 * from where the phone is, DAY-8). Not "Fajr on its date": with the saved place far from the phone (a flight, USER-2)
 * that Fajr can be a day off, and the days' spans overlapped, so one 3 PM was planned for two days (the user-matrix
 * sweep, Nov 27 2026).
 */
function revisionDayStart(user: User, instant: Date): Date {
  let t = new Date(instant.getTime() - 36 * HOUR_MS);
  let start = t;
  for (let i = 0; i < 4; i++) {
    const next = getNextRevisionDayStart(user, t);
    if (next.getTime() <= t.getTime() || next.getTime() > instant.getTime()) break;
    start = next;
    t = next;
  }
  return start;
}

/** The revision day that holds `instant`, with its span: from `start` (when it began) to the next change. */
function revisionAt(user: User, instant: Date, start: Date = revisionDayStart(user, instant)): Revision {
  const day = getRevisionDayForUser(user, instant);
  const date = getRevisionDateForUser(user, instant);
  return { day, date, start, end: getNextRevisionDayStart(user, instant) };
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

  // One of each a day (REMIND-1), the first: a revision day can be longer than a day of the clock (with the saved place
  // far from the phone, a day with no Fajr there turns at midnight and the next at Fajr), and it planned two mornings
  // under one id, the second replacing the first (the user-matrix sweep, Nov 27 2026).
  const byTime = slots.sort((a, b) => a.at.getTime() - b.at.getTime());
  const sorted = byTime.filter((s, i) => byTime.findIndex((o) => o.kind === s.kind) === i);
  // Two due within 30 minutes become one: the earlier is dropped.
  return sorted.filter(
    (s, i) => !(i + 1 < sorted.length && sorted[i + 1].at.getTime() - s.at.getTime() <= MERGE_WITHIN_MS),
  );
}

export function planRevisionReminders(input: PlanReminderInput): PlannedReminder[] {
  const { user, now } = input;
  const today = revisionAt(user, now);
  // Each day begins where the one before it ends, so no two days' reminders overlap (DAY-8, USER-2).
  const tomorrow = revisionAt(user, today.end, today.end);
  const pagesOf = (rev: Revision) => generateDailyAssignment(input.pages, input.quranData, user, rev.date).pages;
  const todayPages = pagesOf(today);
  const tomorrowPages = pagesOf(tomorrow);

  // As Home and the widget count it (USER-2, lib/todaySnapshot dayProgress): a day is done once the pages that finish it
  // are, revised that day, ahead the day before (AHEAD-2) or logged by hand (ACT-15). A day done ahead gets no reminder
  // asking for it, and a page done ahead isn't named as one still to revise.
  const progressOf = (rev: Revision, pages: number[]) =>
    dayProgress({
      user,
      pages: input.pages,
      logs: input.logs,
      day: rev.day,
      assignment: pages,
      history: input.history ?? null,
    });
  const todayProgress = progressOf(today, todayPages);
  const todayRevised = todayProgress.done;
  const doneToday = todayProgress.status === 'completed';
  // The streak as Home and the widget count it (lib/streak).
  const streak = input.history
    ? streakReadingFromItems({ user, pages: input.pages, items: input.history, today: today.day }).streak
    : streakFromLogs({ user, pages: input.pages, logs: input.logs, today: today.day });
  const beforeNoon = morningTime(user).hour < 12;
  const juzPlan = user.scheduleMode === 'juz';

  const planned: PlannedReminder[] = [];
  const add = (
    rev: Revision,
    all: number[],
    revised: ReadonlySet<number>,
    kind: ReminderKind,
    at: Date,
    index: number,
  ) => {
    const overnight = dayKey(at) !== dayKey(rev.start);
    const left = all.filter((p) => !revised.has(p));
    // Every page done but the day not (a page done twice over, never both ways at once): it names the day from its start.
    const remaining = left.length > 0 ? left : all;
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

  // Tomorrow: what is left of it once the pages revised ahead are counted; none if they finished it.
  const tomorrowProgress = progressOf(tomorrow, tomorrowPages);
  if (tomorrowPages.length > 0 && tomorrowProgress.status !== 'completed') {
    slotsFor(tomorrow, input).forEach((slot, i) =>
      add(tomorrow, tomorrowPages, tomorrowProgress.done, slot.kind, slot.at, i + 1),
    );
  }

  // The days after (REMIND-2): one each, never more than one a day. A day with no pages, or already revised ahead, gets none.
  let later = tomorrow;
  for (let n = 0; n < (input.laterDays ?? 0); n++) {
    later = revisionAt(user, later.end, later.end);
    const pages = pagesOf(later);
    if (pages.length === 0) continue;
    // A day already revised ahead needs no reminder (USER-2).
    const progress = progressOf(later, pages);
    if (progress.status === 'completed') continue;
    const slots = slotsFor(later, input);
    const slot = slots.find((s) => s.kind === 'morning') ?? slots[0];
    // At the morning time, worded for a day away; the wording turns with the day (copy's variant).
    if (slot) add(later, pages, progress.done, 'away', slot.at, 0);
  }

  return planned;
}
