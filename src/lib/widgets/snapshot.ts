// What the Home and Lock Screen widgets show, worked out by the app and handed to
// the widget extension (targets/widget) through the App Group's shared defaults.
//
// The widget can't run the scheduler, so the app writes a week of days ahead:
// today with what's done, then each following revision day as it would start.
// The widget shows the day whose span holds "now", so it rolls over at fajr (or
// midnight) with the app closed. The app rewrites it whenever anything changes.

import { generateDailyAssignment } from '../algorithm';
import { CalcSettings, dayTimes } from '../prayer/times';
import { getNextRevisionDayStart, getRevisionDayForUser } from '../fajrBoundary';
import { describePageRuns, describeSurahRuns, pageRuns } from '../pageRanges';
import { paletteV2, type AccentName } from '../../theme/v2';
import type { QuranPage, RevisionLog, User, UserPage } from '../../types';
import { widgetQibla, type City, type Coords, type WidgetQibla } from './qibla';

/** Shared by the app and the extension (app.config.js, targets/widget). */
export const WIDGET_APP_GROUP = 'group.com.revisionbuddy.app';
/** The one key the snapshot is kept under, as a JSON string. */
export const WIDGET_SNAPSHOT_KEY = 'widget.snapshot';
/** Days written ahead, so a week without opening the app still rolls over right. */
export const WIDGET_DAYS_AHEAD = 7;

export interface WidgetDay {
  /** The revision day, 'YYYY-MM-DD'. */
  day: string;
  /** When the widget starts showing it (ms since 1970): now for today, else the boundary. */
  startsAt: number;
  /** When it ends: the next fajr, or midnight. */
  endsAt: number;
  /** "Pages 41–50". */
  title: string;
  /** "Juz 3 · Al-Baqarah to Aal-i-Imraan". */
  where: string;
  /** For the Lock Screen: "p. 41–50", or "12 pages" for several ranges. */
  short: string;
  total: number;
  /** Today's pages revised (only today can have any). */
  done: number;
  completed: boolean;
  /** Days in a row with a session, through this day or, before it's revised, the day before. */
  streak: number;
}

export interface WidgetColors {
  /** Text in the accent (≥ 4.5:1 on the ground). */
  accentText: string;
  /** The "done" fill, and the text on it. */
  done: string;
  onDone: string;
  /** The primary pill (Start revision), and the text on it. */
  primary: string;
  onPrimary: string;
}

export interface WidgetSnapshot {
  v: 1;
  /** signedOut / noPlan: the widget asks to open Revisely. */
  state: 'ready' | 'signedOut' | 'noPlan';
  accent: AccentName;
  colors: { light: WidgetColors; dark: WidgetColors };
  days: WidgetDay[];
  /** The Qibla widget's bearing and distance; null until the phone has a position. */
  qibla: WidgetQibla | null;
  /** Prayer times for the coming days (testers, with a place; for the prayer
   *  widgets of the native phase). Absent otherwise. */
  prayer?: WidgetPrayer;
}

/** A day's prayer times as epoch milliseconds (null: none that day). */
export interface WidgetPrayerDay {
  day: string;
  fajr: number | null;
  sunrise: number | null;
  dhuhr: number | null;
  asr: number | null;
  maghrib: number | null;
  isha: number | null;
}

export interface WidgetPrayer {
  /** "London", or null if no listed city is near. */
  place: string | null;
  days: WidgetPrayerDay[];
}

export const WIDGET_PRAYER_DAYS = 7;

/** The coming days' prayer times, worked out as the app does (lib/prayer/times). */
export function widgetPrayer(from: Coords, settings: CalcSettings, place: string | null, now: Date): WidgetPrayer {
  const ms = (d: Date | null) => (d ? d.getTime() : null);
  return {
    place,
    days: Array.from({ length: WIDGET_PRAYER_DAYS }, (_, i) => {
      const t = dayTimes(from, new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12), settings);
      return {
        day: t.day,
        fajr: ms(t.fajr),
        sunrise: ms(t.sunrise),
        dhuhr: ms(t.dhuhr),
        asr: ms(t.asr),
        maghrib: ms(t.maghrib),
        isha: ms(t.isha),
      };
    }),
  };
}

export interface WidgetInputs {
  signedIn: boolean;
  user: User | null;
  onboardingComplete: boolean;
  pages: UserPage[];
  logs: RevisionLog[];
  quranData: QuranPage[];
  accent: AccentName;
  now: Date;
  /** The phone's last known position (or the account's Fajr location). */
  qiblaFrom?: Coords | null;
  /** Cities for the Qibla widget's place line. */
  cities?: readonly City[];
  /** Prayer times to include (testers with a place); none otherwise. */
  prayer?: { from: Coords; settings: CalcSettings; place: string | null } | null;
}

function colorsFor(accent: AccentName): WidgetSnapshot['colors'] {
  const pick = (isDark: boolean): WidgetColors => {
    const p = paletteV2(isDark, accent);
    return { accentText: p.accentText, done: p.done, onDone: p.onDone, primary: p.primary, onPrimary: p.onPrimary };
  };
  return { light: pick(false), dark: pick(true) };
}

/** "Juz 26", "Juz 26–27", "Juz 3, 7", or "5 juz" (as on Home's Today post). */
export function juzLabel(juzBreakdown: { juz: number }[]): string {
  const js = [...new Set(juzBreakdown.map((j) => j.juz))].sort((a, b) => a - b);
  if (js.length === 0) return '';
  if (js.length === 1) return `Juz ${js[0]}`;
  if (js.every((j, i) => i === 0 || j === js[i - 1] + 1)) return `Juz ${js[0]}–${js[js.length - 1]}`;
  return js.length <= 3 ? `Juz ${js.join(', ')}` : `${js.length} juz`;
}

function shortLabel(pages: number[]): string {
  const runs = pageRuns(pages);
  if (runs.length === 1) {
    const r = runs[0];
    return r.first === r.last ? `p. ${r.first}` : `p. ${r.first}–${r.last}`;
  }
  const n = runs.reduce((sum, r) => sum + r.last - r.first + 1, 0);
  return `${n} page${n === 1 ? '' : 's'}`;
}

function localDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function previousDay(s: string): string {
  const d = localDay(s);
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Days in a row with a session, ending at `day` if it has one, or else at the day
 * before: a streak stays alive until the day is over. (Home counts the same days,
 * from the first session of the day.)
 */
export function aliveStreak(logDays: ReadonlySet<string>, day: string): number {
  let cursor = logDays.has(day) ? day : previousDay(day);
  let streak = 0;
  while (logDays.has(cursor)) {
    streak++;
    cursor = previousDay(cursor);
  }
  return streak;
}

export function buildWidgetSnapshot(input: WidgetInputs): WidgetSnapshot {
  const base = {
    v: 1 as const,
    accent: input.accent,
    colors: colorsFor(input.accent),
    qibla: widgetQibla(input.qiblaFrom ?? null, input.cities),
    ...(input.prayer
      ? { prayer: widgetPrayer(input.prayer.from, input.prayer.settings, input.prayer.place, input.now) }
      : {}),
  };
  if (!input.signedIn || !input.user) return { ...base, state: 'signedOut', days: [] };
  const user = input.user;
  const memorizedCount = input.pages.filter((p) => p.status === 'memorized').length;
  if (!input.onboardingComplete || memorizedCount === 0) return { ...base, state: 'noPlan', days: [] };

  const logDays = new Set(input.logs.map((l) => l.date));
  const days: WidgetDay[] = [];
  let startsAt = input.now;
  for (let i = 0; i < WIDGET_DAYS_AHEAD; i++) {
    const day = getRevisionDayForUser(user, startsAt);
    const endsAt = getNextRevisionDayStart(user, startsAt);
    const assignment = generateDailyAssignment(input.pages, input.quranData, user, localDay(day));
    const runs = pageRuns(assignment.pages);

    // As Home: done once as many pages were revised today as were assigned.
    const revised = new Set<number>();
    for (const log of input.logs) if (log.date === day) log.pagesRevised.forEach((p) => revised.add(p));
    const total = assignment.totalPages;
    const completed = revised.size > 0 && revised.size >= total;
    const doneHere = assignment.pages.filter((p) => revised.has(p)).length;

    days.push({
      day,
      startsAt: startsAt.getTime(),
      endsAt: endsAt.getTime(),
      title: describePageRuns(runs),
      where: [juzLabel(assignment.juzBreakdown), describeSurahRuns(runs)].filter(Boolean).join(' · '),
      short: shortLabel(assignment.pages),
      total,
      done: completed ? total : doneHere,
      completed,
      streak: aliveStreak(logDays, day),
    });
    // Never stall: a boundary that isn't later (an odd clock) moves on a day.
    startsAt = endsAt.getTime() > startsAt.getTime() ? endsAt : new Date(startsAt.getTime() + 86_400_000);
  }
  return { ...base, state: 'ready', days };
}
