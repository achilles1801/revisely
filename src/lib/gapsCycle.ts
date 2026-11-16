// Insights' Gaps: how far gaps pushed the full revision back (Majd, Nov 16 2026: "seeing ur full revision getting
// pushed back"; BEHAVIOUR.md ACT-28).
//
// The plan follows the calendar (lib/algorithm): a missed day doesn't move it; its pages wait until the plan comes
// round to them again, unless they're caught up ("Add to today", which with Keep daily amount slides the rest of the
// plan back). Nothing records what an older plan scheduled, and the schedule can't be read backwards once a catch-up
// has shifted it. So this reads the plan only forwards, from today, as it is now:
//
//   spacing   how often the plan brings a page round: the days between its next two slots (or the larger of its
//             next two such gaps), off days, custom plans, juz mode and carried pages included.
//   due       the page's last revision (or, never revised, the day it was memorized) plus its spacing: when the plan
//             would have brought it round had nothing been missed.
//   late      its next slot is after its due day: it missed a slot in a gap, or a catch-up slid it back.
//   pushed back   from the latest due day of a late page to the latest day one comes round: "14 Nov → 30 Nov".
//
// A plan changed mid-cycle is judged by the new plan alone; pages the plan doesn't hold are left out.

import { t } from '../i18n';
import { getPagesForDay, juzModeCycle } from './algorithm';
import { durationWords, gapDate } from './insightsGaps';
import type { User, UserPage } from '../types';

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.round(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const dayOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
/** A revision day as the scheduler takes it: that day's local midnight. */
const localDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The longest plan this looks ahead for (a page a day over the whole Qur'an is 604 days: capped). */
const MAX_CYCLE = 200;

export interface LatePage {
  page: number;
  /** When the plan would have brought it round. */
  due: string;
  /** When the plan brings it round now (today when it is in today's pages). */
  next: string;
}

export interface PushBack {
  /** How often the plan brings a page round, the usual spacing (days). */
  cycleDays: number;
  /** Pages whose next slot is after their due day, oldest due first. */
  late: LatePage[];
  /** The latest due day and the latest next day of the late pages; null when none is late. */
  due: string | null;
  next: string | null;
  /** Days from `due` to `next` (0 when none is late). */
  days: number;
  /** Every late page was due before today: they were missed (in a gap), not only slid back. */
  missed: boolean;
}

export interface PushBackInput {
  user: User;
  /** The pages the plan revises (lib/memorizedAyahs revisablePages). */
  memorized: UserPage[];
  /** The revision day it is now. */
  today: string;
  /** A page's last revision day (lib/recency lastRevisedDay), null when never revised. */
  lastRevised: (page: number) => string | null;
  /** A never-revised page's first day on record (lib/recency coverageSince), null when unknown. */
  since: (page: number) => string | null;
}

/** About how many days the plan takes to come round, to know how far ahead to read it. */
function cycleEstimate(user: User, memorized: UserPage[]): number {
  if (user.customPlan && user.customPlan.days.length > 0) return user.customPlan.days.length;
  if (user.scheduleMode === 'juz' && (user.dailyJuzCount ?? 0) > 0) return juzModeCycle(user, memorized)?.cycle.length ?? 1;
  const perDay = Math.min(user.dailyPageCapacity, memorized.length);
  return perDay > 0 ? Math.ceil(memorized.length / perDay) + 1 : 1;
}

/** The median of numbers (0 for none). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** How far gaps have pushed the full revision back, by the plan as it is now. Null with nothing to measure. */
export function pushBack(input: PushBackInput): PushBack | null {
  const { user, memorized, today } = input;
  if (memorized.length === 0) return null;
  const t = dayNumber(today);
  const cycle = Math.min(MAX_CYCLE, Math.max(1, cycleEstimate(user, memorized)));
  // Three slots of every page: the next one and two spacings.
  const horizon = 3 * cycle + 2;
  const slots = new Map<number, number[]>();
  for (let d = 0; d <= horizon; d++) {
    for (const page of getPagesForDay(user, localDate(dayOf(t + d)), memorized)) {
      const at = slots.get(page) ?? [];
      if (at.length < 3 && at[at.length - 1] !== d) at.push(d);
      slots.set(page, at);
    }
  }

  const spacings: number[] = [];
  const late: { page: number; due: number; next: number }[] = [];
  for (const p of memorized) {
    const at = slots.get(p.pageNumber);
    if (!at || at.length < 2) continue;
    const spacing = Math.max(at[1] - at[0], at.length > 2 ? at[2] - at[1] : 0);
    spacings.push(spacing);
    const last = input.lastRevised(p.pageNumber) ?? input.since(p.pageNumber);
    if (!last) continue;
    const due = dayNumber(last) - t + spacing;
    if (at[0] > due) late.push({ page: p.pageNumber, due, next: at[0] });
  }
  if (spacings.length === 0) return null;
  late.sort((a, b) => a.due - b.due || a.page - b.page);
  const due = late.length ? Math.max(...late.map((l) => l.due)) : null;
  const next = late.length ? Math.max(...late.map((l) => l.next)) : null;
  return {
    cycleDays: Math.round(median(spacings)),
    late: late.map((l) => ({ page: l.page, due: dayOf(t + l.due), next: dayOf(t + l.next) })),
    due: due == null ? null : dayOf(t + due),
    next: next == null ? null : dayOf(t + next),
    days: due == null || next == null ? 0 : next - due,
    missed: late.length > 0 && late.every((l) => l.due < 0),
  };
}

// ── Words (src/i18n/en/insights.ts, `gaps`) ─────────────────────────────

/**
 * The section's line: "Full revision pushed back over 2 weeks" "60 pages from your gaps come round by 30 Nov
 * instead of 14 Nov. Your plan goes round every 16 days.", or "Full revision on schedule". The plan's own cycle is
 * always in days ("every 16 days": "every over 2 weeks" doesn't read).
 */
export function pushBackLine(pb: PushBack, inDays = false): { title: string; detail: string; late: boolean } {
  const plan = t('insights.gaps.planEvery', { count: pb.cycleDays });
  if (pb.late.length === 0 || !pb.due || !pb.next) {
    return { title: t('insights.gaps.onSchedule'), detail: t('insights.gaps.onScheduleText', { count: pb.cycleDays }), late: false };
  }
  const values = { count: pb.late.length, next: gapDate(pb.next), due: gapDate(pb.due) };
  const what = pb.missed ? t('insights.gaps.pushedMissed', values) : t('insights.gaps.pushedLate', values);
  return { title: t('insights.gaps.pushedBack', { duration: durationWords(pb.days, inDays) }), detail: `${what} ${plan}`, late: true };
}
