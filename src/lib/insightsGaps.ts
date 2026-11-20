// Insights' Gaps (Majd, Nov 16 2026: "some metric in insights that give the user an idea on their gaps
// between sessions… the last time i revised was last week but other than looking at consistency there's
// no real metric"; BEHAVIOUR.md ACT-28; mocks ~/Documents/revisely-today-mocks/insights-gaps/).
//
// Nov 20 2026 (Majd, on a day-old account: "there's just a dot on that graph and literally it makes no sense"): a gap
// is the days you didn't revise, counted as you see them on the calendar, and the section lists the gaps themselves
// instead of drawing the range as a strip of dots.
//
// Everything here works on revision days ("2026-11-15"), as Activity's items are filed: the day turns at
// Fajr or midnight (DAY-2, DAY-9) and in the user's own zone before an item is written, so no time zone
// or boundary is read here. Recency only: nothing about strength, with Smart Tracking on or off (ACT-19).
//
//   revision day   a day with at least one page revised: a session, pages revised ahead (on the day they
//                  were done, not the day they count for), pages logged as revised elsewhere. Reading and
//                  memorizing don't count.
//   gap            2 days or more in a row without a revision day: Monday, then Thursday, is a 2-day gap
//                  (Tuesday and Wednesday). One day missed isn't a gap: the usual rhythm says it ("every 1–2 days").
//   open gap       the days since the last revision day, today included ("6 days so far", as the figure says "6 days
//                  since your last revision"), once 2 whole days have gone by without one.

import { dayMonth, t } from '../i18n';
import { isDevVariant } from './variant';
import { mistakeDetectionReleased } from './release/mistakeDetection';

/**
 * Who sees Gaps and Last revised: Revisely Dev (Majd, Nov 16 2026: build straight into Revisely Dev). Only Revisely
 * Dev's Revo carries their guide and figures (the Dev guide, context.app 'dev'), and "whatever app changes we make,
 * revo should get that update too": a TestFlight tester's Revo, on the store's prompt, wouldn't know them. E2E builds
 * show them for the screenshots (the variable is inlined; every other build drops it). A release opens them in one
 * line, once the main guide has them.
 */
export function gapsInsightsEnabled(user: { previewTester?: boolean } | null | undefined): boolean {
  return user != null && (mistakeDetectionReleased() || isDevVariant() || process.env.EXPO_PUBLIC_E2E === '1');
}

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.round(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const dayOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** A gap is this many days in a row without revising, or more. */
export const MIN_GAP_DAYS = 2;
/**
 * The figure is red from this many days since the last revision (2 whole days missed, today not over), and the gap
 * still open is listed from then.
 */
export const RED_FROM_DAYS = MIN_GAP_DAYS + 1;
/** Gaps listed before "Show all". */
export const GAPS_SHOWN = 3;

export interface Gap {
  /** The revision day before it; null when it isn't known (before the days read). */
  from: string | null;
  /** The revision day that ended it; null while it is open (no revision since). */
  to: string | null;
  /** Its first and last day without a revision (open: today); `first` is as far back as is known when `from` is null. */
  first: string;
  last: string;
  /**
   * Days in a row without revising: closed, the days from `first` to `last`; open, the days since the last revision,
   * today included; a lower bound when `from` is null.
   */
  days: number;
  /** `from` is unknown: the gap is at least `days` long ("60+ days"). */
  atLeast: boolean;
  open: boolean;
}

export interface GapsView {
  /** The last revision day on record, and whole days since (0 = today). */
  lastDay: string;
  sinceLast: number;
  /** Today is a revision day and it ended a gap: its days ("after a 5-day gap"). */
  closedToday: number | null;
  /** The longest gap in the range, the open one included (the latest of equals). */
  longest: Gap | null;
  /** The usual step from one revision day to the next in the range (the median; 1 = every day). */
  usual: number | null;
  /** Every gap with a day in the range, oldest first, the open one last. */
  gaps: Gap[];
  /** Revision days in the range. */
  revisedDays: number;
  /** The range's first day: `window` days ending today, never before the account's first day. */
  rangeStart: string;
}

export interface GapsInput {
  /** Activity's revision items (`day` = the revision day it was done on). */
  revised: { day: string; pages: number[] }[];
  /** The revision day it is now. */
  today: string;
  /** The range's days, today included (rangeSpan(...).window). */
  window: number;
  /** The account's first day: no gap before it, and the range starts there when it is later. */
  firstDay?: string | null;
  /**
   * The first day the items were read from. A gap before the first revision read, when the account is
   * known to be older than that, began on an unknown day: it is shown as "N+ days".
   */
  knownSince?: string | null;
  /**
   * Each page's last revision on record (ACT-16), for "since your last revision" when no item was read
   * that far back. Days or timestamps (the day is their first ten characters).
   */
  lastRevisedOn?: ReadonlyMap<number, string>;
}

/** The revision days in the items, oldest first: days with a page revised, up to today. */
export function revisionDays(revised: { day: string; pages: number[] }[], today: string): string[] {
  const days = new Set<string>();
  for (const r of revised) if (r.pages.length > 0 && r.day <= today) days.add(r.day.slice(0, 10));
  return [...days].sort();
}

/** The median of numbers (0 for none). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The Gaps section's figures (ACT-28), or null with no revision on record at all (the section hides).
 */
export function gapsView(input: GapsInput): GapsView | null {
  const { today, window } = input;
  const t = dayNumber(today);
  const days = revisionDays(input.revised, today);
  const first = input.firstDay ? dayNumber(input.firstDay) : null;
  // The last revision: the items', or a page's own record when no item reaches back that far.
  let lastDay = days.length ? days[days.length - 1] : null;
  if (!lastDay && input.lastRevisedOn) {
    for (const d of input.lastRevisedOn.values()) {
      const day = d.slice(0, 10);
      if (day <= today && (!lastDay || day > lastDay)) lastDay = day;
    }
  }
  if (!lastDay) return null;
  const sinceLast = t - dayNumber(lastDay);

  // The range's first day: `window` days ending today, never before the account.
  const rangeStart = Math.max(t - window + 1, first ?? -Infinity);
  // Every gap, closed and open. A gap counts in the range when one of its days is in it.
  const gaps: Gap[] = [];
  const known = input.knownSince ? dayNumber(input.knownSince) : null;
  if (days.length > 0 && known != null && first != null && first < known) {
    // Days before the first revision read, in an account older than what was read: a gap of unknown start.
    const d0 = dayNumber(days[0]);
    const lower = d0 - known;
    if (lower >= MIN_GAP_DAYS) gaps.push({ from: null, to: days[0], first: dayOf(known), last: dayOf(d0 - 1), days: lower, atLeast: true, open: false });
  }
  const steps: { to: number; step: number }[] = [];
  for (let i = 1; i < days.length; i++) {
    const a = dayNumber(days[i - 1]);
    const b = dayNumber(days[i]);
    steps.push({ to: b, step: b - a });
    if (b - a - 1 >= MIN_GAP_DAYS) gaps.push({ from: days[i - 1], to: days[i], first: dayOf(a + 1), last: dayOf(b - 1), days: b - a - 1, atLeast: false, open: false });
  }
  if (sinceLast >= RED_FROM_DAYS) {
    gaps.push({ from: lastDay, to: null, first: dayOf(dayNumber(lastDay) + 1), last: today, days: sinceLast, atLeast: false, open: true });
  }

  const counted = gaps.filter((g) => dayNumber(g.last) >= rangeStart);
  let longest: Gap | null = null;
  for (const g of counted) if (!longest || g.days >= longest.days) longest = g;

  // The usual step: the median of the steps that end in the range, from at least two of them.
  const rangeSteps = steps.filter((s) => s.to >= rangeStart).map((s) => s.step);
  const usual = rangeSteps.length >= 2 ? median(rangeSteps) : null;

  const lastStep = steps.length ? steps[steps.length - 1] : null;
  const closedToday = sinceLast === 0 && lastStep && lastStep.to === t && lastStep.step - 1 >= MIN_GAP_DAYS ? lastStep.step - 1 : null;
  const revisedDays = days.filter((d) => dayNumber(d) >= rangeStart).length;

  return { lastDay, sinceLast, closedToday, longest, usual, gaps: counted, revisedDays, rangeStart: dayOf(rangeStart) };
}

/** The gaps as the section lists them: the one still open first, then the latest first. */
export function gapsNewestFirst(gaps: readonly Gap[]): Gap[] {
  return [...gaps].sort((a, b) => (a.open !== b.open ? (a.open ? -1 : 1) : b.last.localeCompare(a.last)));
}

/** The usual step in words' terms: 1 → "every day", 2 → "every 2 days", 1.5 → "every 1–2 days". */
export function usualSteps(usual: number): { low: number; high: number } {
  const low = Math.floor(usual);
  return { low, high: usual === low ? low : low + 1 };
}

// ── Words (src/i18n/en/insights.ts, `gaps`) ─────────────────────────────

/** A revision day as a date: "28 Oct" (short) or "28 October". */
export function gapDate(day: string, month: 'short' | 'long' = 'short'): string {
  // Local noon: the day is a calendar day, whatever the phone's zone.
  return dayMonth(new Date(`${day.slice(0, 10)}T12:00:00`), { month });
}

/** From this many days a length is said in weeks, months or years, unless the user asked for days. */
export const NATURAL_FROM_DAYS = 14;
const WEEKS_UNTIL = 42;
const MONTH_DAYS = 30.44;

/** "Over 3 weeks" from "over 3 weeks": a figure, or a gap's row, starts with a capital. */
export const capital = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/**
 * A length of days as a person says it (Majd, Nov 16 2026: "if someone last revised 25 days ago … saying 25
 * days gap is kinda pointless"): days under 2 weeks; then weeks ("2 weeks", "over 3 weeks"); from 6 weeks,
 * months ("over a month", "about 2 months"); from a year, years. `inDays` (the section's Days switch) says
 * exact days whatever the length.
 */
export function durationWords(days: number, inDays = false): string {
  if (inDays || days < NATURAL_FROM_DAYS) return t('insights.gaps.days', { count: days });
  if (days < WEEKS_UNTIL) {
    const weeks = Math.floor(days / 7);
    return days % 7 === 0 ? t('insights.gaps.weeks', { count: weeks }) : t('insights.gaps.overWeeks', { count: weeks });
  }
  const long = days >= 365;
  const units = days / (long ? 365 : MONTH_DAYS);
  const n = Math.max(1, Math.floor(units));
  const about = units - n < 0.25;
  if (long) return about ? t('insights.gaps.aboutYears', { count: n }) : t('insights.gaps.overYears', { count: n });
  return about ? t('insights.gaps.aboutMonths', { count: n }) : t('insights.gaps.overMonths', { count: n });
}

/** Whether a length reads differently in days: the Days switch shows only when one does. */
export const naturalDiffers = (days: number) => days >= NATURAL_FROM_DAYS;

/**
 * The figure. Under 2 weeks a number ("6 days" "since your last revision"; red from 3 days, a nudge while it is
 * still a short gap). From 2 weeks, words and the date, never red: someone who has been away is welcomed back,
 * not alarmed ("Over 3 weeks" "since your last revision, on 24 Oct"). Revised today: "Today" "you revised", "you
 * revised, after a 5-day gap" when it ended a gap, "you're back, after over 3 weeks" after an absence.
 */
export function gapsFigure(v: Pick<GapsView, 'sinceLast' | 'closedToday' | 'lastDay'>, inDays = false): { value: string; text: string; red: boolean } {
  if (v.sinceLast <= 0) {
    const after = v.closedToday;
    const text = !after
      ? t('insights.gaps.revisedToday')
      : naturalDiffers(after)
        ? t('insights.gaps.back', { duration: durationWords(after, inDays) })
        : t('insights.gaps.revisedTodayAfter', { count: after });
    return { value: t('insights.gaps.today'), text, red: false };
  }
  if (!naturalDiffers(v.sinceLast)) {
    return { value: t('insights.gaps.days', { count: v.sinceLast }), text: t('insights.gaps.sinceLast'), red: v.sinceLast >= RED_FROM_DAYS };
  }
  return {
    value: capital(durationWords(v.sinceLast, inDays)),
    text: t('insights.gaps.sinceLastOn', { date: gapDate(v.lastDay) }),
    red: false,
  };
}

/** A gap's length: "5 days", "60+ days", "6 days so far", "over 3 weeks", "over 3 weeks so far" (`capital` starts a row). */
export function gapLabel(g: Pick<Gap, 'days'> & { open?: boolean; atLeast?: boolean }, inDays = false): string {
  const natural = naturalDiffers(g.days) && !inDays;
  if (g.open) return natural ? t('insights.gaps.soFar', { duration: durationWords(g.days) }) : t('insights.gaps.openLabel', { count: g.days });
  // A gap of unknown start stays in days ("60+ days"): "at least about 2 months" reads badly.
  if (g.atLeast) return t('insights.gaps.gapLabelAtLeast', { count: g.days });
  return natural ? durationWords(g.days) : t('insights.gaps.gapLabel', { count: g.days });
}

/** A gap's days: "29 Oct – 2 Nov", "9–10 Oct", "14 Nov – today", "until 2 Nov" (begun before the days read). */
export function gapDates(g: Pick<Gap, 'first' | 'last' | 'open' | 'atLeast'>, month: 'short' | 'long' = 'short'): string {
  if (g.atLeast) return t('insights.gaps.datesUntil', { to: gapDate(g.last, month) });
  if (g.open) return t('insights.gaps.datesOpen', { from: gapDate(g.first, month) });
  if (g.first.slice(0, 7) === g.last.slice(0, 7)) return t('insights.gaps.datesSameMonth', { fromDay: String(Number(g.first.slice(8, 10))), to: gapDate(g.last, month) });
  return t('insights.gaps.dates', { from: gapDate(g.first, month), to: gapDate(g.last, month) });
}

/** A gap's row for VoiceOver: "5 days without revising, 29 October – 2 November". */
export function gapSpoken(g: Gap): string {
  return t('insights.gaps.rowLabel', { length: gapLabel(g, true), dates: gapDates(g, 'long') });
}

/**
 * A gap on Overview's calendar (ACT-28): the band over its days without a revision (open: up to today; begun before
 * the days read: from as far back as is known), and the words above the grid: "Gap, 29 Oct – 2 Nov · 5 days".
 */
export function gapOnCalendar(g: Gap, inDays = false): { from: string; to: string; cue: string } {
  return { from: g.first, to: g.last, cue: t('insights.gaps.cue', { dates: gapDates(g), length: gapLabel(g, inDays) }) };
}

/**
 * The line under the figure: how many gaps in the range and the usual rhythm. "3 gaps in 30 days · you usually revise
 * every day", "No gaps since 19 November · you usually revise every 1–2 days", "No gaps yet" (one revision day so far:
 * nothing to compare).
 */
export function gapsSummary(v: Pick<GapsView, 'gaps' | 'usual' | 'revisedDays'>, inWords: string, inDays = false): string {
  const count =
    v.gaps.length > 0
      ? t('insights.gaps.count', { count: v.gaps.length, range: inWords })
      : v.revisedDays >= 2
        ? t('insights.gaps.noGapsIn', { range: inWords })
        : t('insights.gaps.noGapsYet');
  return v.usual == null ? count : `${count} · ${usualWords(v.usual, inDays)}`;
}

/** The usual rhythm: "you usually revise every day", "… every 1–2 days", from 2 weeks "… about every 2 weeks". */
export function usualWords(usual: number, inDays = false): string {
  if (!inDays && usual >= NATURAL_FROM_DAYS) {
    return usual < WEEKS_UNTIL
      ? t('insights.gaps.usuallyWeeks', { count: Math.round(usual / 7) })
      : t('insights.gaps.usuallyMonths', { count: Math.max(1, Math.round(usual / MONTH_DAYS)) });
  }
  const { low, high } = usualSteps(usual);
  return low === high ? t('insights.gaps.usually', { count: low }) : t('insights.gaps.usuallyBetween', { low, high });
}

/** Whether anything the section shows reads differently in days (the Days switch shows only then). */
export function gapsHaveNatural(v: GapsView): boolean {
  return (
    naturalDiffers(v.sinceLast) ||
    (v.closedToday != null && naturalDiffers(v.closedToday)) ||
    (v.usual != null && naturalDiffers(v.usual)) ||
    v.gaps.some((g) => naturalDiffers(g.days))
  );
}
