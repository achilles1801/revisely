/**
 * Whether people stay: active accounts and retention by sign-up week, as counts only. Shared by the
 * metrics console (adminMetrics) and functions/scripts/retention.js, so both say the same thing.
 *
 * Active on a day = revised, memorized, read, recited or logged something that day: a revision session
 * with pages or minutes, an Activity item (revisions, memorizations, reads), a recited take, or a daily
 * log. Days are the account's own revision days (local dates the app writes). A sign-up's moment is UTC,
 * so an account starts on its first local day the app recorded (its first session, created at
 * onboarding) when that is within a day of the UTC date; otherwise on the UTC date.
 *
 * Nothing about one account leaves this module: rows come in without ids, numbers go out.
 */

export const RETENTION_SINCE = '2026-10-01';
export const RETENTION_DAYS = [1, 7, 30] as const;
export type RetentionDay = (typeof RETENTION_DAYS)[number];

/** One account, without its id: when it signed up and the days it was active. */
export interface AccountActivity {
  signedUp: string; // YYYY-MM-DD (UTC)
  /** The first local day the app recorded for the account (its first session), if any. */
  firstDay?: string | null;
  onboarded: boolean;
  days: Iterable<string>; // YYYY-MM-DD
}

/** n of `of` accounts came back; null when no account of the cohort has reached that day yet. */
export interface Cell { n: number; of: number }

export interface Cohort {
  week: string; // the Monday it starts
  signedUp: number;
  onboarded: number;
  /** Active on exactly day N after signing up. */
  day: Record<RetentionDay, Cell | null>;
  /** Active on day N or any day after it (kinder to small cohorts: "still around"). */
  rolling: Record<RetentionDay, Cell | null>;
}

export interface ActivePoint { end: string; wau: number; mau: number }

export interface Retention {
  asOf: string; // the last full day counted
  accounts: number; // signed up since RETENTION_SINCE
  onboarded: number;
  active: { day: number; week: number; month: number }; // all accounts, ending asOf
  series: ActivePoint[]; // weekly, ending each Sunday since RETENTION_SINCE, and asOf
  cohorts: Cohort[];
}

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

export function dayString(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of a day's week. */
export function weekOf(day: string): string {
  const n = dayNumber(day);
  const weekday = (new Date(n * DAY_MS).getUTCDay() + 6) % 7; // Monday 0
  return dayString(n - weekday);
}

export function isDay(v: unknown): v is string {
  return typeof v === 'string' && ISO_DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

function countActive(accounts: number[][], from: number, to: number): number {
  let n = 0;
  for (const days of accounts) if (days.some((d) => d >= from && d <= to)) n += 1;
  return n;
}

/**
 * `asOf` is the last full day to count (yesterday, UTC): a day still running would read as a drop.
 * Activity before an account's sign-up (a restored backup, a clock) counts from its sign-up day on.
 */
export function retention(rows: AccountActivity[], asOf: string, since = RETENTION_SINCE): Retention {
  const end = dayNumber(asOf);
  const start = dayNumber(since);
  const all: number[][] = [];
  const cohorts = new Map<string, { signedUp: number; onboarded: number; members: { from: number; days: Set<number> }[] }>();
  let accounts = 0;
  let onboarded = 0;
  for (const row of rows) {
    const days = new Set<number>();
    for (const d of row.days) if (isDay(d)) days.add(dayNumber(d));
    const active = [...days].filter((d) => d <= end);
    all.push(active);
    if (!isDay(row.signedUp)) continue;
    const utc = dayNumber(row.signedUp);
    const local = isDay(row.firstDay) ? dayNumber(row.firstDay) : NaN;
    const from = Math.abs(local - utc) <= 1 ? local : utc;
    if (from < start || from > end) continue;
    accounts += 1;
    if (row.onboarded) onboarded += 1;
    const week = weekOf(dayString(from));
    const c = cohorts.get(week) ?? { signedUp: 0, onboarded: 0, members: [] };
    c.signedUp += 1;
    if (row.onboarded) c.onboarded += 1;
    c.members.push({ from, days: new Set(active) });
    cohorts.set(week, c);
  }

  const series: ActivePoint[] = [];
  const firstSunday = start + ((7 - ((new Date(start * DAY_MS).getUTCDay()) % 7)) % 7);
  for (let e = firstSunday; e < end; e += 7) series.push({ end: dayString(e), wau: countActive(all, e - 6, e), mau: countActive(all, e - 29, e) });
  series.push({ end: asOf, wau: countActive(all, end - 6, end), mau: countActive(all, end - 29, end) });

  const cell = (members: { from: number; days: Set<number> }[], n: number, rolling: boolean): Cell | null => {
    const reached = members.filter((m) => m.from + n <= end);
    if (!reached.length) return null;
    const back = reached.filter((m) => (rolling ? [...m.days].some((d) => d >= m.from + n) : m.days.has(m.from + n)));
    return { n: back.length, of: reached.length };
  };

  return {
    asOf,
    accounts,
    onboarded,
    active: { day: countActive(all, end, end), week: countActive(all, end - 6, end), month: countActive(all, end - 29, end) },
    series,
    cohorts: [...cohorts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, c]) => ({
        week,
        signedUp: c.signedUp,
        onboarded: c.onboarded,
        day: Object.fromEntries(RETENTION_DAYS.map((n) => [n, cell(c.members, n, false)])) as Cohort['day'],
        rolling: Object.fromEntries(RETENTION_DAYS.map((n) => [n, cell(c.members, n, true)])) as Cohort['rolling'],
      })),
  };
}

/** Yesterday (UTC) for a moment: the last full day. */
export function lastFullDay(now: number): string {
  return dayString(Math.floor(now / DAY_MS) - 1);
}
