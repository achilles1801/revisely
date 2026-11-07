// What Revo is told about something the user attached with +: a surah, a juz, some pages or a day.
// Worked out on the phone from the sources Activity, Insights, Home and the streak read, the same
// way they read them, so Revo can say exactly what the app shows (Majd, Nov 7 2026: "how many
// times have I revised this juz?" must be answered from the user's own data, never a guess).
//
// - Revisions and credits: the Activity items Home's streak reads (lib/activityHistory, with the
//   phone's sessions over them), or the session logs the way the streak reads them until those
//   have loaded (lib/streak). A page revised on a day counts once that day.
// - The plan: the streak's own (`snapshot.streak.scheduled`): a logged day's assignment, else the
//   plan's pages for the day. Today is Home's (lib/todaySnapshot).
// - Strength: as Insights counts it, over memorized pages revised at least once (lastRevisedDate);
//   weak 1–2, moderate 3, strong 4–5, the average to one decimal.
// - A day: Activity's revision minutes (summarizeActivityDay), the timer's reading, the daily
//   log's notes, this phone's recordings.
// Every part of the Qur'an is named in words, surah and juz first (lib/passages).

import type { JournalEntry, ReadingSession, RevisionLog, User, UserPage } from '../../types';
import { isRevisionActivity, normalizeReadingSession } from '../activity';
import { withPhoneSessions } from '../activityHistory';
import { revisionDayOf } from '../fajrBoundary';
import { shiftDay } from '../journal';
import { describePassage, plainText } from '../passages';
import type { RecordingMeta } from '../recordings';
import type { HistoryItem } from '../streakFromItems';
import type { TodaySnapshot } from '../todaySnapshot';
import type { RevoDayFacts, RevoPassageFacts, RevoPlanTally, RevoTimes } from './types';

/** Everything the facts are read from: what Home's snapshot (and so Revo's context) was built from. */
export interface FactSources {
  user: User;
  pages: readonly UserPage[];
  logs: readonly RevisionLog[];
  /** The Activity items Home's streak read, or null until they have loaded. */
  history: readonly HistoryItem[] | null;
  /** Today as Home shows it; `snapshot.day` is today. */
  snapshot: TodaySnapshot;
  now: number;
}

/** What a day's facts read beyond the revision logs, each null when it couldn't be read. */
export interface DayExtras {
  readings?: readonly ReadingSession[] | null;
  journal?: readonly JournalEntry[] | null;
  recordings?: readonly RecordingMeta[] | null;
}

/** How far ahead "next on the plan" looks. */
export const NEXT_LOOKAHEAD_DAYS = 366;
export const MAX_WEAK_SPOTS = 6;
export const MAX_DAY_WEAK = 20;
export const MAX_NOTES = 10;
export const NOTE_CHARS = 1000;
/** A day's notes together, at most (the server's limit too). */
export const DAY_NOTE_CHARS = 3000;

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
/** Whole days from `from` to `to` (YYYY-MM-DD). */
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/** Words for the model: surah and juz first, with ordinary spaces and hyphens. */
const words = (pages: Iterable<number>, juz = true) => plainText(describePassage(pages, { juz }));

/** A revision credited to a day: pages revised on `day`, counting for `countsFor`. */
interface Credit {
  day: string;
  countsFor: string;
  pages: readonly number[];
}

/**
 * The revisions on record, as the streak reads them: the Activity items with the phone's sessions
 * over them once they've loaded; until then the logs as lib/streak credits them (a session's pages
 * count for its own day, its `ahead` pages for theirs).
 */
export function creditsOf(src: Pick<FactSources, 'logs' | 'history' | 'now'>): Credit[] {
  if (src.history) return withPhoneSessions(src.history, src.logs, src.now);
  return src.logs.flatMap((l) => [
    { day: l.date, countsFor: l.date, pages: l.pagesRevised },
    ...Object.entries(l.ahead ?? {}).map(([countsFor, pages]) => ({ day: l.date, countsFor, pages })),
  ]);
}

/** The revisions indexed: pages revised on each day, and for each day the days its pages were revised for it. */
export interface CreditIndex {
  revisedOn: Map<string, Set<number>>;
  /** countsFor → page → the days it was revised for it. */
  creditedBy: Map<string, Map<number, string[]>>;
}

export function indexCredits(credits: readonly Credit[], today: string): CreditIndex {
  const revisedOn = new Map<string, Set<number>>();
  const creditedBy = new Map<string, Map<number, string[]>>();
  for (const c of credits) {
    if (c.day > today) continue;
    const on = revisedOn.get(c.day) ?? new Set<number>();
    for (const p of c.pages) on.add(p);
    revisedOn.set(c.day, on);
    const by = creditedBy.get(c.countsFor) ?? new Map<number, string[]>();
    for (const p of c.pages) by.set(p, [...(by.get(p) ?? []), c.day]);
    creditedBy.set(c.countsFor, by);
  }
  return { revisedOn, creditedBy };
}

/** The sources, read once for any number of facts: the credits indexed and the plan's days cached. */
export interface Prepared {
  src: FactSources;
  index: CreditIndex;
  scheduled: (day: string) => readonly number[];
}

export function prepare(src: FactSources): Prepared {
  const cache = new Map<string, readonly number[]>();
  const scheduled = (day: string) => {
    let pages = cache.get(day);
    if (!pages) {
      pages = [...new Set(src.snapshot.streak.scheduled(day))];
      cache.set(day, pages);
    }
    return pages;
  };
  return { src, index: indexCredits(creditsOf(src), src.snapshot.day), scheduled };
}

/** A page of a day's plan: revised on the day, ahead (on an earlier day), later, or not. */
type Outcome = 'onDay' | 'ahead' | 'late' | 'none';

function outcomeOf(index: CreditIndex, day: string, page: number): Outcome {
  const days = index.creditedBy.get(day)?.get(page) ?? [];
  if (days.includes(day)) return 'onDay';
  if (days.some((d) => d < day)) return 'ahead';
  if (days.some((d) => d > day)) return 'late';
  return 'none';
}

const bucketOf = (rating: number) => (rating <= 2 ? 'weak' : rating === 3 ? 'moderate' : 'strong');

/** Runs of consecutive pages, in order. */
function runs(pages: readonly number[]): number[][] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && p === last[last.length - 1] + 1) last.push(p);
    else out.push([p]);
  }
  return out;
}

function timesIn(index: CreditIndex, set: ReadonlySet<number>, memorized: readonly number[], today: string, window: number | null): RevoTimes {
  const count = new Map<number, number>();
  let days = 0;
  for (const [day, pages] of index.revisedOn) {
    const ago = daysBetween(day, today);
    if (ago < 0 || (window != null && ago >= window)) continue;
    let any = false;
    for (const p of pages) {
      if (!set.has(p)) continue;
      any = true;
      count.set(p, (count.get(p) ?? 0) + 1);
    }
    if (any) days++;
  }
  const each = memorized.map((p) => count.get(p) ?? 0);
  return { days, minEach: each.length ? Math.min(...each) : 0, maxEach: each.length ? Math.max(...each) : 0 };
}

function tally(index: CreditIndex, set: ReadonlySet<number>, scheduled: (day: string) => readonly number[], today: string, window: number): RevoPlanTally {
  const t: RevoPlanTally = { days: 0, pages: 0, onDay: 0, late: 0, ahead: 0, skipped: 0, skippedDays: 0 };
  for (let k = 1; k <= window; k++) {
    const day = shiftDay(today, -k);
    const mine = scheduled(day).filter((p) => set.has(p));
    if (mine.length === 0) continue;
    t.days++;
    t.pages += mine.length;
    let skipped = false;
    for (const p of mine) {
      const o = outcomeOf(index, day, p);
      if (o === 'onDay') t.onDay++;
      else if (o === 'ahead') t.ahead++;
      else if (o === 'late') t.late++;
      else {
        t.skipped++;
        skipped = true;
      }
    }
    if (skipped) t.skippedDays++;
  }
  return t;
}

/** The last day (≤ today) each page was revised on record. */
function lastRevisedOf(index: CreditIndex, set: ReadonlySet<number>): Map<number, string> {
  const last = new Map<number, string>();
  for (const [day, pages] of index.revisedOn) {
    for (const p of pages) {
      if (!set.has(p)) continue;
      const prev = last.get(p);
      if (prev == null || day > prev) last.set(p, day);
    }
  }
  return last;
}

/**
 * What the app shows for these pages (a surah's, a juz's, or the user's own pick). `name`: what it
 * is called when its pages alone don't say it (a surah whose first page ends the one before).
 */
export function passageFacts(of: readonly number[], prepared: Prepared, name?: string): RevoPassageFacts {
  const { src, index, scheduled } = prepared;
  const today = src.snapshot.day;
  const list = [...new Set(of)].filter((p) => Number.isInteger(p) && p >= 1 && p <= 604).sort((a, b) => a - b);
  const set = new Set(list);
  const byNumber = new Map(src.pages.map((p) => [p.pageNumber, p]));
  const memorizedPages = list.map((p) => byNumber.get(p)).filter((p): p is UserPage => p?.status === 'memorized');
  const memorized = memorizedPages.map((p) => p.pageNumber);
  const memorizedSet = new Set(memorized);

  const last = lastRevisedOf(index, memorizedSet);
  const lastDay = [...last.values()].sort().pop() ?? null;
  const never = memorized.filter((p) => !last.has(p));
  let oldest: RevoPassageFacts['oldest'] = null;
  if (memorized.length > 1) {
    const page = never[0] ?? [...memorized].sort((a, b) => last.get(a)!.localeCompare(last.get(b)!) || a - b)[0];
    oldest = { name: words([page]), page, daysAgo: last.has(page) ? daysBetween(last.get(page)!, today) : null };
  }

  // Strength as Insights counts it: memorized pages revised at least once.
  const rated = memorizedPages.filter((p) => p.lastRevisedDate);
  const strength = { weak: 0, moderate: 0, strong: 0, unrated: memorized.length - rated.length, average: null as number | null };
  for (const p of rated) strength[bucketOf(p.weaknessRating)]++;
  if (rated.length > 0) strength.average = Math.round((rated.reduce((n, p) => n + p.weaknessRating, 0) / rated.length) * 10) / 10;

  const weakSpots = runs(rated.filter((p) => p.weaknessRating <= 2).map((p) => p.pageNumber))
    .map((run) => ({ name: words(run, false), pages: run, rating: Math.min(...run.map((p) => byNumber.get(p)!.weaknessRating)) }))
    .sort((a, b) => a.rating - b.rating || a.pages[0] - b.pages[0])
    .slice(0, MAX_WEAK_SPOTS);

  const inToday = src.snapshot.pages.filter((p) => set.has(p));
  let next: RevoPassageFacts['next'] = null;
  for (let k = 1; k <= NEXT_LOOKAHEAD_DAYS && memorized.length > 0; k++) {
    const n = scheduled(shiftDay(today, k)).filter((p) => set.has(p)).length;
    if (n > 0) {
      next = { inDays: k, pages: n };
      break;
    }
  }

  return {
    name: name ?? words(list),
    pages: list.length,
    memorized: memorized.length,
    revised: {
      last7: timesIn(index, set, memorized, today, 7),
      last30: timesIn(index, set, memorized, today, 30),
      all: timesIn(index, set, memorized, today, null),
    },
    lastRevisedDaysAgo: lastDay == null ? null : daysBetween(lastDay, today),
    oldest,
    neverRevised: never.length,
    plan: { last7: tally(index, set, scheduled, today, 7), last30: tally(index, set, scheduled, today, 30) },
    strength,
    weakSpots,
    today: inToday.length > 0 ? { pages: inToday.length, done: inToday.filter((p) => src.snapshot.done.has(p)).length } : null,
    next,
  };
}

/** The day's notes in the daily log, oldest first, as written: at most MAX_NOTES, each NOTE_CHARS, DAY_NOTE_CHARS in all. */
export function notesOf(journal: readonly JournalEntry[], day: string): string[] {
  const entry = journal.find((e) => e.date === day);
  const out: string[] = [];
  let left = DAY_NOTE_CHARS;
  for (const n of [...(entry?.entries ?? [])].sort((a, b) => a.at - b.at)) {
    const t = n.text.trim().slice(0, Math.min(NOTE_CHARS, left)).trim();
    if (t.length === 0) continue;
    if (out.length === MAX_NOTES || left <= 0) break;
    out.push(t);
    left -= t.length;
  }
  return out;
}

/** What the app shows for a revision day up to today: Activity's day, and for today Home's. */
export function dayFacts(day: string, prepared: Prepared, extras: DayExtras = {}): RevoDayFacts {
  const { src, index, scheduled } = prepared;
  const today = src.snapshot.day;
  const snap = src.snapshot;

  let plan: RevoDayFacts['plan'] = null;
  if (day === today) {
    const revisedHere = index.revisedOn.get(day) ?? new Set<number>();
    // Home's: today's pages with the carried ones, done when its own are (lib/todaySnapshot).
    const list = snap.pages;
    if (list.length > 0) {
      const onDay = list.filter((p) => snap.done.has(p) && revisedHere.has(p)).length;
      plan = {
        pages: list.length,
        name: words(list),
        carried: snap.carried.length,
        onDay,
        ahead: snap.pagesDone - onDay,
        late: 0,
        notDone: list.length - snap.pagesDone,
        done: snap.status === 'completed',
      };
    }
  } else {
    const list = scheduled(day);
    if (list.length > 0) {
      const n = { onDay: 0, ahead: 0, late: 0, none: 0 };
      for (const p of list) n[outcomeOf(index, day, p)]++;
      plan = { pages: list.length, name: words(list), carried: 0, onDay: n.onDay, ahead: n.ahead, late: n.late, notDone: n.none, done: snap.streak.done.has(day) };
    }
  }

  // Every page its sessions revised; and of them, those credited to another day.
  const revised = index.revisedOn.get(day) ?? new Set<number>();
  const forLater = new Set<number>();
  const forEarlier = new Set<number>();
  for (const [countsFor, byPage] of index.creditedBy) {
    if (countsFor === day) continue;
    for (const [p, days] of byPage) if (days.includes(day)) (countsFor > day ? forLater : forEarlier).add(p);
  }

  // Activity's revision minutes: its sessions with a page revised; null when none recorded a length.
  const sessions = src.logs.filter((l) => l.date === day && isRevisionActivity(l));
  const timed = sessions.filter((l) => l.durationMinutes != null);
  const minutes = timed.length > 0 ? Math.round(timed.reduce((n, l) => n + (l.durationMinutes ?? 0), 0)) : null;

  const ratings = new Map<number, number>();
  for (const l of src.logs.filter((x) => x.date === day)) for (const w of l.weaknessUpdates) ratings.set(w.page, Math.max(1, Math.min(5, Math.round(w.rating))));
  const counts = { weak: 0, moderate: 0, strong: 0 };
  for (const r of ratings.values()) counts[bucketOf(r)]++;
  const weakPages = [...ratings].filter(([, r]) => r <= 2).map(([p]) => p).sort((a, b) => a - b).slice(0, MAX_DAY_WEAK);

  const memorized = src.pages
    .filter((p) => p.status === 'memorized' && p.dateMemorized != null && revisionDayOf(new Date(p.dateMemorized), src.user) === day)
    .map((p) => p.pageNumber);

  let readMinutes: number | null = null;
  if (extras.readings) {
    const seconds = extras.readings
      .map((r) => normalizeReadingSession(r as ReadingSession, src.user))
      .filter((r): r is ReadingSession => r != null && r.date === day)
      .reduce((n, r) => n + r.durationSeconds, 0);
    readMinutes = Math.round(seconds / 60);
  }
  let recordings: RevoDayFacts['recordings'] = null;
  if (extras.recordings) {
    const mine = extras.recordings.filter((r) => r.day === day);
    recordings = { count: mine.length, minutes: Math.round(mine.reduce((n, r) => n + r.durationMs, 0) / 60_000) };
  }

  return {
    daysAgo: daysBetween(day, today),
    plan,
    revised: { pages: revised.size, ...(revised.size > 0 ? { name: words(revised) } : {}), forLater: forLater.size, forEarlier: forEarlier.size },
    minutes,
    readMinutes,
    memorized: { pages: memorized.length, ...(memorized.length > 0 ? { name: words(memorized) } : {}) },
    ratings: { ...counts, ...(weakPages.length > 0 ? { weakName: words(weakPages) } : {}), weakPages },
    recordings,
    notes: extras.journal ? notesOf(extras.journal, day) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// One line each, for a row in the picker: what the user's data says before they add it.
// ---------------------------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Revised 6× in 30 days · 2 weak spots", "Not memorized", "Not revised in 30 days". */
export function passagePreview(f: RevoPassageFacts): string {
  if (f.memorized === 0) return 'Not memorized';
  const parts: string[] = [];
  const t = f.revised.last30;
  if (t.days === 0) parts.push('Not revised in 30 days');
  else if (f.memorized === 1) parts.push(`Revised ${t.maxEach}× in 30 days`);
  else parts.push(t.minEach > 0 ? `Revised in full ${t.minEach}× in 30 days` : `Revised on ${plural(t.days, 'day')} in 30`);
  if (f.weakSpots.length > 0) parts.push(plural(f.weakSpots.length, 'weak spot'));
  if (f.memorized < f.pages) parts.push(`${f.memorized} of ${f.pages} pages memorized`);
  return parts.join(' · ');
}

/** "12 of 20 pages · 25 min · includes 2 notes", "Nothing revised". */
export function dayPreview(f: RevoDayFacts): string {
  const parts: string[] = [];
  if (f.plan) parts.push(`${f.plan.pages - f.plan.notDone} of ${plural(f.plan.pages, 'page')}`);
  else if (f.revised.pages > 0) parts.push(`${plural(f.revised.pages, 'page')} revised`);
  else parts.push('Nothing revised');
  if (f.minutes) parts.push(`${f.minutes} min`);
  if (f.recordings?.count) parts.push(plural(f.recordings.count, 'recording'));
  if (f.notes?.length) parts.push(`includes ${plural(f.notes.length, 'note')}`);
  return parts.join(' · ');
}
