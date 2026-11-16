// Insights' Gaps (Majd, Nov 16 2026: "some metric in insights that give the user an idea on their gaps
// between sessions… the last time i revised was last week but other than looking at consistency there's
// no real metric"; BEHAVIOUR.md ACT-28; mocks ~/Documents/revisely-today-mocks/insights-gaps/).
//
// Everything here works on revision days ("2026-11-15"), as Activity's items are filed: the day turns at
// Fajr or midnight (DAY-2, DAY-9) and in the user's own zone before an item is written, so no time zone
// or boundary is read here. Recency only: nothing about strength, with Smart Tracking on or off (ACT-19).
//
//   revision day   a day with at least one page revised: a session, pages revised ahead (on the day they
//                  were done, not the day they count for), pages logged as revised elsewhere. Reading and
//                  memorizing don't count.
//   gap            the days from one revision day to the next: Monday, then Thursday, is a 3-day gap.
//                  Revising every day leaves none (a 1-day step is not a gap); one missed day is a 2-day gap.
//   open gap       the days since the last revision day, while today has none yet.
//   long           3 days or more.

import { dayMonth, t } from '../i18n';
import { isDevVariant } from './variant';

/**
 * Who sees Gaps: Revisely Dev and previewTester accounts (testers first; Majd, Nov 7 2026). A release
 * opens it to every account in one line, as the November 2026 release did its gates (lib/activityBlocks).
 */
export function gapsInsightsEnabled(user: { previewTester?: boolean } | null | undefined): boolean {
  return user != null && (user.previewTester === true || isDevVariant());
}

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.round(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const dayOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** A gap this long or longer is drawn in red and counted as long. */
export const LONG_GAP_DAYS = 3;
/** The strip draws at most this many days (half a year, as Consistency's weeks grid). */
export const STRIP_MAX_DAYS = 182;

export interface Gap {
  /** The revision day before it; null when it isn't known (before the days read). */
  from: string | null;
  /** The revision day that ended it; null while it is open (no revision since). */
  to: string | null;
  /** Days from `from` to `to` (or to today, open): a lower bound when `from` is null. */
  days: number;
  /** `from` is unknown: the gap is at least `days` long ("60+ days"). */
  atLeast: boolean;
  open: boolean;
  long: boolean;
}

/** One stretch of the strip, between two of its days (indexes into `strip.days`). */
export type StripPart =
  /** Consecutive revision days: a solid line in the accent. */
  | { kind: 'run'; from: number; to: number }
  /** A gap: a line, red when long, with its length. `cut` when it began before the strip. */
  | { kind: 'gap'; from: number; to: number; days: number; long: boolean; cut: boolean; atLeast: boolean }
  /** The gap still open, up to today: dashed, red when long. */
  | { kind: 'open'; from: number; to: number; days: number; long: boolean; cut: boolean };

export interface GapsView {
  /** The last revision day on record, and whole days since (0 = today). */
  lastDay: string;
  sinceLast: number;
  /** Today is a revision day and the gap it ended was long: its length ("after 6 days"). */
  closedToday: number | null;
  /** The longest gap with a missed day in the range, the open one included (the latest of equals). */
  longest: Gap | null;
  /** The usual step from one revision day to the next in the range (the median; 1 = every day). */
  usual: number | null;
  /** Long gaps with a missed day in the range, the open one included. */
  longCount: number;
  /** Every gap with a missed day in the range, oldest first, the open one last. */
  gaps: Gap[];
  /** Revision days in the range. */
  revisedDays: number;
  /** The strip: its days (oldest first, up to STRIP_MAX_DAYS, ending today), each revised or not. */
  strip: { days: string[]; revised: boolean[]; parts: StripPart[] };
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
  // Every gap, closed and open. A gap counts in the range when one of its missed days is in it.
  const gaps: Gap[] = [];
  const known = input.knownSince ? dayNumber(input.knownSince) : null;
  if (days.length > 0 && known != null && first != null && first < known) {
    // Days before the first revision read, in an account older than what was read: a gap of unknown start.
    const d0 = dayNumber(days[0]);
    const lower = d0 - known + 1;
    if (lower >= 2) gaps.push({ from: null, to: days[0], days: lower, atLeast: true, open: false, long: lower >= LONG_GAP_DAYS });
  }
  const steps: { to: number; step: number }[] = [];
  for (let i = 1; i < days.length; i++) {
    const a = dayNumber(days[i - 1]);
    const b = dayNumber(days[i]);
    steps.push({ to: b, step: b - a });
    if (b - a >= 2) gaps.push({ from: days[i - 1], to: days[i], days: b - a, atLeast: false, open: false, long: b - a >= LONG_GAP_DAYS });
  }
  if (sinceLast >= 2) gaps.push({ from: lastDay, to: null, days: sinceLast, atLeast: false, open: true, long: sinceLast >= LONG_GAP_DAYS });

  // A gap's missed days run from the day after `from` to the day before `to` (an open gap: to yesterday).
  const inRange = (g: Gap) => {
    const end = g.to ? dayNumber(g.to) - 1 : t - 1;
    return end >= rangeStart;
  };
  const counted = gaps.filter(inRange);
  let longest: Gap | null = null;
  for (const g of counted) if (!longest || g.days >= longest.days) longest = g;
  const longCount = counted.filter((g) => g.long).length;

  // The usual step: the median of the steps that end in the range, from at least two of them.
  const rangeSteps = steps.filter((s) => s.to >= rangeStart).map((s) => s.step);
  const usual = rangeSteps.length >= 2 ? median(rangeSteps) : null;

  const lastStep = steps.length ? steps[steps.length - 1] : null;
  const closedToday = sinceLast === 0 && lastStep && lastStep.to === t && lastStep.step >= LONG_GAP_DAYS ? lastStep.step : null;
  const revisedDays = days.filter((d) => dayNumber(d) >= rangeStart).length;

  return { lastDay, sinceLast, closedToday, longest, usual, longCount, gaps: counted, revisedDays, strip: stripOf(days, gaps, today, rangeStart) };
}

/** The strip's days and parts, from the range's first day (at most STRIP_MAX_DAYS) to today. */
function stripOf(days: string[], gaps: Gap[], today: string, rangeStart: number): GapsView['strip'] {
  const t = dayNumber(today);
  const start = Math.max(rangeStart, t - STRIP_MAX_DAYS + 1);
  const stripDays: string[] = [];
  for (let n = start; n <= t; n++) stripDays.push(dayOf(n));
  const set = new Set(days);
  const revised = stripDays.map((d) => set.has(d));
  const index = (n: number) => n - start;
  const parts: StripPart[] = [];
  // Runs of consecutive revision days (the strip's part of them).
  let runFrom: number | null = null;
  for (let i = 0; i < stripDays.length; i++) {
    if (revised[i] && runFrom == null) runFrom = i;
    if (runFrom != null && (!revised[i] || i === stripDays.length - 1)) {
      const end = revised[i] ? i : i - 1;
      if (end > runFrom) parts.push({ kind: 'run', from: runFrom, to: end });
      runFrom = null;
    }
  }
  // Gaps that reach into the strip, cut at its left end when they began before it.
  for (const g of gaps) {
    const end = g.to ? dayNumber(g.to) : t;
    if (end <= start) continue;
    const begin = g.from ? dayNumber(g.from) : end - g.days + 1;
    const cut = begin < start;
    const from = Math.max(0, index(begin));
    if (g.open) parts.push({ kind: 'open', from, to: index(t), days: g.days, long: g.long, cut });
    else parts.push({ kind: 'gap', from, to: index(end), days: g.days, long: g.long, cut, atLeast: g.atLeast });
  }
  // Yesterday revised, today not yet: a quiet open step to today (no gap, nothing missed).
  if (revised.length >= 2 && revised[revised.length - 2] && !revised[revised.length - 1]) {
    parts.push({ kind: 'open', from: revised.length - 2, to: revised.length - 1, days: 1, long: false, cut: false });
  }
  return { days: stripDays, revised, parts };
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

/** "Over 3 weeks" from "over 3 weeks": a figure starts with a capital. */
const capital = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

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
 * revised, after 6 days" when it ended a long gap, "you're back, after over 3 weeks" after an absence.
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
    return { value: t('insights.gaps.days', { count: v.sinceLast }), text: t('insights.gaps.sinceLast'), red: v.sinceLast >= LONG_GAP_DAYS };
  }
  return {
    value: capital(durationWords(v.sinceLast, inDays)),
    text: t('insights.gaps.sinceLastOn', { date: gapDate(v.lastDay) }),
    red: false,
  };
}

/** A gap's label on the strip: "9 days", "60+ days", "6 days so far", "over 3 weeks so far". */
export function gapLabel(g: { days: number; open?: boolean; atLeast?: boolean }, inDays = false): string {
  const natural = naturalDiffers(g.days) && !inDays;
  if (g.open) return natural ? t('insights.gaps.soFar', { duration: durationWords(g.days) }) : t('insights.gaps.openLabel', { count: g.days });
  // A gap of unknown start stays in days ("60+ days"): "at least about 2 months" reads badly.
  if (g.atLeast) return t('insights.gaps.gapLabelAtLeast', { count: g.days });
  return natural ? durationWords(g.days) : t('insights.gaps.gapLabel', { count: g.days });
}

/**
 * The longest gap's tile: its length ("9" "days", or "Over 3 weeks" with no unit) and "Longest gap, 28 Oct – 6
 * Nov" (or "None" "No gaps in 30 days").
 */
export function longestTile(longest: Gap | null, inWords: string, inDays = false): { value: string; unit: string | null; text: string } {
  if (!longest) return { value: t('insights.gaps.noGaps'), unit: null, text: t('insights.gaps.noGapsText', { range: inWords }) };
  const natural = naturalDiffers(longest.days) && !inDays && !longest.atLeast;
  const value = natural
    ? capital(durationWords(longest.days))
    : longest.atLeast
      ? `${longest.days}+`
      : String(longest.days);
  const unit = natural ? null : t('insights.gaps.unit', { count: longest.days });
  const text = longest.open
    ? t('insights.gaps.longestOpen', { from: gapDate(longest.from!) })
    : !longest.from
      ? t('insights.gaps.longestUnknown', { to: gapDate(longest.to!) })
      : t('insights.gaps.longest', { from: gapDate(longest.from), to: gapDate(longest.to!) });
  return { value, unit, text };
}

/**
 * The usual rhythm's tile: "Every day", "Every 2 days", "Every 1–2 days" (from 2 weeks, "About every 2 weeks",
 * "About every month"), and how many long gaps.
 */
export function rhythmTile(usual: number, longCount: number, inDays = false): { value: string; text: string } {
  const { low, high } = usualSteps(usual);
  let value: string;
  if (!inDays && usual >= NATURAL_FROM_DAYS) {
    value =
      usual < WEEKS_UNTIL
        ? t('insights.gaps.aboutEveryWeeks', { count: Math.round(usual / 7) })
        : t('insights.gaps.aboutEveryMonths', { count: Math.max(1, Math.round(usual / MONTH_DAYS)) });
  } else value = low === high ? t('insights.gaps.every', { count: low }) : t('insights.gaps.everyBetween', { low, high });
  const text = longCount > 0 ? t('insights.gaps.rhythm', { count: longCount }) : t('insights.gaps.rhythmNone');
  return { value, text };
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

/** The strip for VoiceOver: the range, the days revised, then each long gap with its dates. */
export function stripLabel(v: Pick<GapsView, 'revisedDays' | 'gaps'>, rangeWords: string): string {
  const range = rangeWords.charAt(0).toUpperCase() + rangeWords.slice(1);
  const head = t('insights.gaps.stripLabel', { range, count: v.revisedDays });
  const long = v.gaps.filter((g) => g.long);
  if (long.length === 0) return `${head} ${t('insights.gaps.stripNoLongGaps')}`;
  const each = long.map((g) => {
    const days = t('insights.gaps.gapLabel', { count: g.days });
    if (g.open) return t('insights.gaps.stripGapOpen', { days, from: gapDate(g.from!, 'long') });
    if (!g.from) return t('insights.gaps.stripGapUnknown', { days: t('insights.gaps.gapLabelAtLeast', { count: g.days }), to: gapDate(g.to!, 'long') });
    return t('insights.gaps.stripGap', { days, from: gapDate(g.from, 'long'), to: gapDate(g.to!, 'long') });
  });
  return `${head} ${t('insights.gaps.stripLongGaps', { gaps: each.join('; ') })}`;
}
