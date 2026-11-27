// What the Home and Lock Screen widgets show, worked out by the app and handed to
// the widget extension (targets/widget) through the App Group's shared defaults, and
// on Android to the home-screen widgets (modules/android-widgets), which read the same JSON.
//
// The widget can't run the scheduler, so the app writes a week of days ahead:
// today with what's done, then each following revision day as it would start.
// The widget shows the day whose span holds "now", so it rolls over at fajr (or
// midnight) with the app closed. The app rewrites it whenever anything changes.

import { generateDailyAssignment } from '../algorithm';
import { catchUpIndex, creditIndex } from '../aheadCredit';
import { planDuePages } from '../carryOver';
import { dayProgress } from '../todaySnapshot';
import { aheadLead, nextRevisionDayPlan } from '../aheadPlan';
import { aheadLine } from '../todayLines';
import { aliveStreak, completedDays } from '../streak';
import { streakReadingFromItems, type HistoryItem } from '../streakFromItems';
import { CalcSettings, dayTimes } from '../prayer/times';
import { getNextRevisionDayStart, getRevisionDayForUser } from '../fajrBoundary';
import { describePagesToRevise, placeOfPageToRevise, type PartialPages } from '../passages';
import { paletteV2, type AccentName } from '../../theme/v2';
import type { QuranPage, RevisionLog, User, UserPage } from '../../types';
import { widgetQibla, type City, type Coords, type WidgetQibla } from './qibla';
import { partlyMemorizedAyahs, revisablePages } from '../memorizedAyahs';
import { t } from '../../i18n';

/** Shared by the app and the extension (app.config.js, targets/widget). */
export { widgetAppGroup } from '../variant';
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
  /** What the day revises, by surah (never page numbers; lib/passages, short): "Al-Mujadila to At-Tahrim". */
  title: string;
  /** Its juz: "Juz 28", "Juz 27–28". */
  where: string;
  /** For the Lock Screen (one short line): the title when it fits, else where the day starts ("Al-Baqarah 142"). */
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
  /** The accent's tint (the next prayer's cell in Android's 4×1 prayer widget), and text on it. */
  accentSubtle: string;
  subtleText: string;
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
  /** The Activity items' history (C5): the streak is read from it once loaded; the logs until then. */
  history?: HistoryItem[] | null;
}

function colorsFor(accent: AccentName): WidgetSnapshot['colors'] {
  const pick = (isDark: boolean): WidgetColors => {
    const p = paletteV2(isDark, accent);
    return {
      accentText: p.accentText,
      done: p.done,
      onDone: p.onDone,
      primary: p.primary,
      onPrimary: p.onPrimary,
      accentSubtle: p.accentSubtle,
      subtleText: p.subtleText,
    };
  };
  return { light: pick(false), dark: pick(true) };
}

/** "Juz 26", "Juz 26–27", "Juz 3, 7", or "5 juz" (as on Home's Today post). */
export function juzLabel(juzBreakdown: { juz: number }[]): string {
  const js = [...new Set(juzBreakdown.map((j) => j.juz))].sort((a, b) => a - b);
  if (js.length === 0) return '';
  if (js.length === 1) return t('common.juzN', { n: js[0] });
  if (js.every((j, i) => i === 0 || j === js[i - 1] + 1))
    return t('common.juzRange', { from: js[0], to: js[js.length - 1] });
  return js.length <= 3 ? t('common.juzList', { list: js.join(', ') }) : t('common.juzCount', { count: js.length });
}

/** The Lock Screen's rectangular widget fits about this many characters on its line. */
const SHORT_FITS = 20;

function shortLabel(pages: number[], title: string, partial: PartialPages): string {
  if (pages.length === 0) return '';
  return title.length <= SHORT_FITS ? title : placeOfPageToRevise(pages[0], partial, { form: 'short' });
}

function localDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export { aliveStreak };

/**
 * A rest day's words, as Home's Today post says them (lib/todayLines, HOME-9): "Rest day", and where the next revision
 * day starts ("Tomorrow starts at Al-Kahf"), or "Nothing is scheduled today." with none.
 */
function restDayWords(
  user: User,
  pages: UserPage[],
  logs: RevisionLog[],
  day: string,
  partial: PartialPages,
): { title: string; where: string } {
  const plan = nextRevisionDayPlan(user, pages, day, new Set(), logs);
  const where =
    plan && plan.pages.length > 0
      ? aheadLine(aheadLead(user, pages, day, plan), plan.pages[0], partial).text
      : t('lib.today.restDetail');
  return { title: t('lib.today.restTitle'), where };
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
  const memorized = revisablePages(input.pages);
  // A partly memorized page is named by its memorized ayahs (MEM-4).
  const partial = partlyMemorizedAyahs(input.pages);
  const memorizedCount = memorized.length;
  if (!input.onboardingComplete || memorizedCount === 0) return { ...base, state: 'noPlan', days: [] };

  // A day with a session, or whose pages were all revised ahead, is a day done.
  const logOf = new Map(input.logs.map((l) => [l.date, l]));
  const done = completedDays(
    creditIndex(input.logs),
    (d) => logOf.get(d)?.assignedPages ?? planDuePages(user, d, memorized),
    catchUpIndex(input.logs),
  );
  const days: WidgetDay[] = [];
  let startsAt = input.now;
  for (let i = 0; i < WIDGET_DAYS_AHEAD; i++) {
    const day = getRevisionDayForUser(user, startsAt);
    const endsAt = getNextRevisionDayStart(user, startsAt);
    const assignment = generateDailyAssignment(input.pages, input.quranData, user, localDay(day));
    // The day's pages in the order it reads them, by surah (CLAUDE.md: surahs and juz first).
    const title = describePagesToRevise(assignment.pages, partial, {
      form: 'short',
      order: 'given',
      wholeJuz: false,
      max: 2,
    });

    // As Home counts it (USER-2, lib/todaySnapshot dayProgress): done once the pages that finish the day are, revised
    // that day, ahead, caught up or logged by hand. Those pages are its own; or the carried pages, when Keep daily amount
    // filled the day with them (SESS-7); or, on a day with none of its own (pages from Insights on an off day), all of it.
    const progress = dayProgress({
      user,
      pages: input.pages,
      logs: input.logs,
      day,
      assignment: assignment.pages,
      history: input.history ?? null,
    });
    const total = progress.finishing.length;
    const completed = progress.status === 'completed';
    const doneHere = progress.finishingDone;
    // A rest day (no pages; something memorized, or the widget would ask to set up): named as Home names it (HOME-9,
    // USER-2), "Rest day", then where the next revision day starts, never an empty title.
    const rest = assignment.pages.length === 0 ? restDayWords(user, input.pages, input.logs, day, partial) : null;

    days.push({
      day,
      startsAt: startsAt.getTime(),
      endsAt: endsAt.getTime(),
      title: rest?.title ?? title,
      where: rest?.where ?? juzLabel(assignment.juzBreakdown),
      short: rest?.title ?? shortLabel(assignment.pages, title, partial),
      total,
      done: completed ? total : doneHere,
      completed,
      streak: input.history
        ? streakReadingFromItems({ user, pages: input.pages, items: input.history, today: day }).streak
        : aliveStreak(done, day),
    });
    // Never stall: a boundary that isn't later (an odd clock) moves on a day.
    startsAt = endsAt.getTime() > startsAt.getTime() ? endsAt : new Date(startsAt.getTime() + 86_400_000);
  }
  return { ...base, state: 'ready', days };
}
