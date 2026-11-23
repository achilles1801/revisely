// Revo's view of Insights' Gaps and Last revised (ACT-28, ACT-30; Majd, Nov 16 2026: "whatever app changes we make,
// revo should get that update too"). The same figures the section and the screen show, over the last 30 days, as
// numbers the server checks and writes out in words (functions/src/revo: gaps): how long since the last revision,
// the longest gap (days without revising, as the section counts them), the usual rhythm, how far gaps pushed the full revision back, and when each memorized surah was
// last revised. Days only (never dates); surahs in words, as every part of the Qur'an the app sends (lib/revo/words).
// Revisely Dev only, as the section.

import type { User, UserPage } from '../../types';
import { gapsView } from '../insightsGaps';
import { pushBack } from '../gapsCycle';
import { lastRevisedRows } from '../lastRevised';
import { revisablePages } from '../memorizedAyahs';
import { coverageSince, daysSince, lastRevisedDay } from '../recency';
import { plainText, surahName } from '../passages';
import type { RevoGaps } from './types';

export type { RevoGaps };

/** Revo's window for the gaps, whatever range Insights shows. */
export const REVO_GAPS_WINDOW = 30;

export function revoGaps(input: {
  user: User;
  pages: readonly UserPage[];
  /** Activity's revision items (lib/activityHistory), null until loaded. */
  history: readonly { day: string; pages: number[] }[] | null | undefined;
  today: string;
  firstDay?: string | null;
}): RevoGaps | null {
  const { user, today } = input;
  const memorized = revisablePages([...input.pages]);
  const last = new Map(memorized.filter((p) => p.lastRevisedDate).map((p) => [p.pageNumber, lastRevisedDay(user, p.lastRevisedDate as string)]));
  const since = new Map(memorized.map((p) => [p.pageNumber, coverageSince(p.dateMemorized, input.firstDay ?? null)]));
  const view = gapsView({
    revised: [...(input.history ?? [])],
    today,
    window: REVO_GAPS_WINDOW,
    firstDay: input.firstDay,
    lastRevisedOn: last,
  });
  if (!view) return null;
  const pb = pushBack({ user, memorized, today, lastRevised: (p) => last.get(p) ?? null, since: (p) => since.get(p) ?? null });
  const surahs = lastRevisedRows('surah', {
    memorized: memorized.map((p) => p.pageNumber),
    last: (p) => last.get(p) ?? null,
    since: (p) => since.get(p) ?? null,
    today,
  }).map((r) => {
    const name = plainText(surahName(r.number));
    return r.oldest.state === 'dated'
      ? { name, daysAgo: r.oldest.wait }
      : r.oldest.state === 'notYet'
        ? { name, daysAgo: null, notYet: true as const }
        : { name, daysAgo: null };
  });
  return {
    lastRevisedDaysAgo: view.sinceLast,
    longestGap: view.longest
      ? { days: view.longest.days, endedDaysAgo: view.longest.to ? Math.max(0, daysSince(view.longest.to, today)) : null }
      : null,
    usualStepDays: view.usual,
    longGaps: view.gaps.length,
    fullRevision: pb ? { latePages: pb.late.length, pushedBackDays: pb.days, cycleDays: pb.cycleDays } : null,
    surahs,
  };
}
