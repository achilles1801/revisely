// Today on Home, worked out in one place from the account: the day's pages and how far they've got (lib/todaySnapshot),
// the next revision day, the catch-up offer, the Today post's lines, and what its button does.
//
// Home (DashboardScreen) draws exactly this, and the user-matrix property test
// (tests/scenarios/properties/userMatrix.property.ts) checks it for every kind of user, so what Home says can't drift
// from what is tested. Before (Nov 27 2026), Home put these together inline, and nothing checked them over many accounts:
// a rest day of a custom plan showed a new account's "Mark memorized pages" to someone with 14.7% memorized (HOME-9).

import { generateDailyAssignment } from './algorithm';
import { aheadLead, nextRevisionDayPlan, type RevisionDayPlan } from './aheadPlan';
import { leftoversFor, type Leftovers } from './carryOver';
import { handLogsOf } from './activityHistory';
import { computeMemorizationStats } from './memorizationStats';
import { partlyMemorizedAyahs, revisablePages } from './memorizedAyahs';
import { aheadLine, catchUpLine, todayLines, type PartialPages, type TodayLines } from './todayLines';
import { todaySnapshot, type TodaySnapshot } from './todaySnapshot';
import type { HistoryItem } from './streakFromItems';
import type { DailyAssignment, QuranPage, RevisionLog, User, UserPage } from '../types';
import { formatPercentage, t } from '../i18n';

/**
 * "17.9%": of the 604 pages, to one decimal ("0%", "100%" at the ends); «١٧٫٩٪» in Arabic. Something memorized never
 * rounds to 0%, nor anything short of the whole Qur'an to 100% (USER-1): a few ayahs read "0.1%", all but a few "99.9%".
 */
export function formatPercent(fraction: number): string {
  if (!(fraction > 0)) return formatPercentage(0);
  if (fraction >= 1) return formatPercentage(100);
  const percent = Math.min(99.9, Math.max(0.1, Math.round(fraction * 1000) / 10));
  return formatPercentage(percent, 1);
}

export interface MemorizedLine {
  /** "17.9% of the Quran memorized". */
  body: string;
  /** Of the 604 pages. */
  fraction: number;
  /** Each juz's memorized share, juz 1 first (the juz dots). */
  juz: number[];
}

/** How much is memorized: "17.9% of the Quran memorized", and each juz's share (the dots). */
export function memorizedText(pages: UserPage[]): MemorizedLine {
  const stats = computeMemorizationStats(pages);
  // A partly memorized page counts by its share of the page (MEM-2).
  const fraction = stats.share / 604;
  return {
    body: t('home.today.memorized', { percent: formatPercent(fraction) }),
    fraction,
    juz: stats.juzFractions,
  };
}

/** What the Today post's button does. */
export type HomeAction =
  /** Start revision, Continue revision: today's session (with the carried pages left, once today's own are done). */
  | { kind: 'session' }
  /** Revise ahead, on a rest day (HOME-9): the next revision day's session. */
  | { kind: 'ahead'; day: string; round: boolean }
  /** Review session: the day's done pages (SESS-4). */
  | { kind: 'review' }
  /** Mark memorized pages: an account with nothing memorized. */
  | { kind: 'memorization' };

export interface HomeToday {
  assignment: DailyAssignment;
  snapshot: TodaySnapshot;
  /** The next revision day with pages, once today is done or on a rest day; else null. */
  ahead: { plan: RevisionDayPlan; lead: string } | null;
  /** Pages left over from the last few days (CARRY-1). */
  leftovers: Leftovers;
  /** Partly memorized pages, named by their memorized ayahs (MEM-4). */
  partial: PartialPages;
  memorized: MemorizedLine;
  /** Where today starts and how much it is, and the button's words (lib/todayLines). */
  lines: TodayLines;
  /** The catch-up offer, or none. */
  catchUp: { title: string; label: string } | null;
  /** The quiet "Tomorrow starts at …" line under the button, once today is done (AHEAD-1); else null. */
  aheadLine: { text: string; label: string } | null;
  /** What the button does; null when there is no button (a rest day with no next revision day). */
  action: HomeAction | null;
}

export function homeToday(input: {
  user: User;
  pages: UserPage[];
  logs: RevisionLog[];
  quranData: QuranPage[];
  /** The revision day, and its date (local midnight). */
  day: string;
  date: Date;
  /** The Activity items Home reads, with the hand-logged pages still on the phone (withPendingHandLogs); null until loaded. */
  history: HistoryItem[] | null;
  now: number;
  /** Home v3 (Revisely Dev, HOME-5): the catch-up is a quiet line under the button. */
  quiet: boolean;
  /** Today's assignment, when the caller already has it (Home keeps it apart, so its prefetch runs once a day). */
  assignment?: DailyAssignment;
}): HomeToday {
  const { user, pages, logs, day, history } = input;
  const assignment = input.assignment ?? generateDailyAssignment(pages, input.quranData, user, input.date);
  const snapshot = todaySnapshot({ user, pages, logs, day, assignment: assignment.pages, history, now: input.now });
  const revisable = revisablePages(pages);
  const partial = partlyMemorizedAyahs(pages);
  const memorized = memorizedText(pages);

  // Done today: the next revision day, which Home's quiet line opens (#168). It goes on past the cycle's end
  // (AHEAD-3): a day that repeats today's pages opens as a new round, and one that begins the plan again reads
  // "Next cycle starts at …". A rest day (no pages today, pages memorized; HOME-9) names it too, and its
  // "Revise ahead" opens it.
  const restDay = assignment.pages.length === 0 && revisable.length > 0;
  let ahead: HomeToday['ahead'] = null;
  if (restDay || (snapshot.status === 'completed' && assignment.pages.length > 0)) {
    const plan = nextRevisionDayPlan(user, pages, day, new Set(assignment.pages), logs);
    if (plan && plan.pages.length > 0) ahead = { plan, lead: aheadLead(user, pages, day, plan) };
  }

  // Pages from the last few revision days that were never revised (a day with no session at all counts as missed),
  // offered as "Add to today". Empty once they are in today's assignment. Pages logged by hand for a day aren't left
  // over from it (ACT-15).
  const counted = history ? [...logs, ...handLogsOf(history)] : logs;
  const leftovers = leftoversFor(user, counted, day, assignment.pages, revisable);

  // With pages memorized, a day with no pages is a rest day (HOME-9): never "Mark memorized pages".
  const lines = todayLines(
    snapshot.status,
    assignment.pages,
    snapshot.done,
    snapshot.carried.length,
    snapshot.carriedLeft,
    partial,
    snapshot.carriedInsights,
    { memorized: memorized.fraction > 0, next: ahead ? { lead: ahead.lead, first: ahead.plan.pages[0] } : null },
  );

  let action: HomeAction | null;
  if (!lines.cta) action = null;
  else if (restDay && ahead) action = { kind: 'ahead', day: ahead.plan.day, round: ahead.plan.round === true };
  // Today is done, and pages added from earlier days are left: the session holds them.
  else if (snapshot.status === 'completed' && snapshot.carriedLeft > 0) action = { kind: 'session' };
  else if (snapshot.status === 'completed') action = { kind: 'review' };
  else if (assignment.pages.length === 0) action = { kind: 'memorization' };
  else action = { kind: 'session' };

  return {
    assignment,
    snapshot,
    ahead,
    leftovers,
    partial,
    memorized,
    lines,
    catchUp: catchUpLine(leftovers, partial, { quiet: input.quiet }),
    aheadLine: ahead && snapshot.status === 'completed' && !lines.rest ? aheadLine(ahead.lead, ahead.plan.pages[0], partial) : null,
    action,
  };
}

/**
 * Every line the Today post shows for `home`, as Home draws it (components/home/feed/TodayPost): where today starts,
 * how much or how far, the button, the catch-up offer, the revise-ahead line and the memorized line.
 */
export function homeTodayTexts(home: HomeToday): string[] {
  const { lines } = home;
  const detail = lines.detail.kind === 'progress' ? t('common.nOfTotal', { n: lines.detail.done, total: lines.detail.total }) : lines.detail.text;
  return [
    lines.title.text,
    detail,
    lines.label,
    ...(lines.cta ? [lines.cta] : []),
    ...(home.catchUp ? [home.catchUp.title, home.catchUp.label] : []),
    ...(home.aheadLine ? [home.aheadLine.text, home.aheadLine.label] : []),
    home.memorized.body,
  ];
}
