import { CustomPlan, UserPage } from '../types';

export type PageStatus = 'memorized' | 'not_memorized';

/**
 * Apply a pendingChanges map to the canonical pages array. Returns the new
 * pages array plus the list of page numbers that actually changed. Callers
 * hand the changed-set to a batched Firestore write so we only sync deltas.
 */
export function applyPendingChanges(
  pages: UserPage[],
  pendingChanges: Map<number, PageStatus>,
): { updatedPages: UserPage[]; changedPageNumbers: number[] } {
  if (pendingChanges.size === 0) {
    return { updatedPages: pages, changedPageNumbers: [] };
  }
  const changedPageNumbers = Array.from(pendingChanges.keys());
  const updatedPages = pages.map((p) => {
    const override = pendingChanges.get(p.pageNumber);
    if (override === undefined) return p;
    return {
      ...p,
      status: override,
      dateMemorized:
        override === 'memorized'
          ? p.dateMemorized ?? new Date().toISOString()
          : null,
    };
  });
  return { updatedPages, changedPageNumbers };
}

/**
 * Apply a pendingSurahChanges map to the user's `memorizedSurahs` list and
 * return the resulting (sorted) array. Caller persists this on the user.
 */
export function applyPendingSurahChanges(
  baseMemorizedSurahs: number[],
  pendingSurahChanges: Map<number, PageStatus>,
): number[] {
  if (pendingSurahChanges.size === 0) return baseMemorizedSurahs;
  const next = new Set(baseMemorizedSurahs);
  pendingSurahChanges.forEach((status, num) => {
    if (status === 'memorized') next.add(num);
    else next.delete(num);
  });
  return Array.from(next).sort((a, b) => a - b);
}

/**
 * Builds a pendingChanges Map describing the deltas needed to bring `pages`
 * into the target onboarding journey stage. Used by onboarding to seed the
 * browser without touching global state.
 *
 *   'complete'    → mark every page as memorized
 *   'in_progress' → clear everything memorized, then mark page 1 as memorized
 *                   (so the user always has at least one page selected and
 *                    can build their selection from there)
 */
export function buildInitialPendingForJourney(
  pages: UserPage[],
  stage: 'in_progress' | 'complete',
): Map<number, PageStatus> {
  const m = new Map<number, PageStatus>();
  if (stage === 'complete') {
    for (const p of pages) {
      if (p.status !== 'memorized') m.set(p.pageNumber, 'memorized');
    }
  } else {
    for (const p of pages) {
      if (p.pageNumber === 1) {
        if (p.status !== 'memorized') m.set(1, 'memorized');
      } else if (p.status === 'memorized') {
        m.set(p.pageNumber, 'not_memorized');
      }
    }
  }
  return m;
}

/**
 * Strip pages from a custom plan that are no longer in the memorized set.
 *
 * Memorization edits can leave the saved plan stale — pages the user
 * un-memorized would otherwise still be scheduled. We auto-remove those.
 * We deliberately don't auto-add newly-memorized pages: the user picks
 * where to slot them via the plan editor.
 *
 * Also reports whether any newly-memorized pages exist that aren't in the
 * plan, so the caller can prompt the user to review their schedule.
 */
export function pruneCustomPlanForMemorized(
  customPlan: CustomPlan,
  memorizedPageNumbers: Iterable<number>,
): {
  plan: CustomPlan;
  removedPageCount: number;
  unscheduledMemorizedCount: number;
} {
  const memorizedSet = new Set(memorizedPageNumbers);
  const scheduledSet = new Set<number>();
  let removedPageCount = 0;

  const days = customPlan.days.map((day) => {
    const next: number[] = [];
    for (const p of day) {
      if (memorizedSet.has(p)) {
        next.push(p);
        scheduledSet.add(p);
      } else {
        removedPageCount++;
      }
    }
    return next;
  });

  let unscheduledMemorizedCount = 0;
  for (const p of memorizedSet) {
    if (!scheduledSet.has(p)) unscheduledMemorizedCount++;
  }

  return {
    plan: { ...customPlan, days },
    removedPageCount,
    unscheduledMemorizedCount,
  };
}

/**
 * Builds a fresh pendingSurahChanges Map that brings `baseMemorizedSurahs`
 * into the target onboarding stage. For 'complete', every surah (1–114) is
 * marked; for 'in_progress' the set is cleared so the user picks what they
 * actually know.
 */
export function buildInitialPendingSurahsForJourney(
  baseMemorizedSurahs: number[],
  stage: 'in_progress' | 'complete',
): Map<number, PageStatus> {
  const m = new Map<number, PageStatus>();
  const base = new Set(baseMemorizedSurahs);
  if (stage === 'complete') {
    for (let n = 1; n <= 114; n++) {
      if (!base.has(n)) m.set(n, 'memorized');
    }
  } else {
    for (const n of base) m.set(n, 'not_memorized');
  }
  return m;
}
