import { RevisionLog } from '../types';
import { removeAheadPages } from './aheadCredit';

/**
 * Pages that were saved as revised today but have since been unchecked on
 * the revision screen — they need taking back out of today's session.
 */
export function pagesToUnrevise(
  completedPages: ReadonlySet<number>,
  persistedPages: ReadonlySet<number>,
): number[] {
  return [...persistedPages].filter((p) => !completedPages.has(p)).sort((a, b) => a - b);
}

/**
 * The session log with `pages` no longer counted as revised. Ratings given
 * while revising are kept — they still describe how strong the page felt.
 */
export function removeRevisedPages(log: RevisionLog, pages: number[]): RevisionLog {
  const remove = new Set(pages);
  // A page unchecked here is no longer revised ahead for any day either.
  return {
    ...log,
    pagesRevised: log.pagesRevised.filter((p) => !remove.has(p)),
    ...(log.ahead ? { ahead: removeAheadPages(log.ahead, pages) } : {}),
  };
}

/**
 * A new round's pages unchecked (AHEAD-3: revising ahead past the cycle's end). Each comes off the later
 * day this round credited it to (`pageDays`). It stays revised on the session's own day when the day
 * still holds it otherwise: one of its own pages (revised before the round began), or credited to
 * another later day. Unchecking a page in the round never takes back the day's own revision of it.
 */
export function removeRoundPages(log: RevisionLog, pageDays: ReadonlyMap<number, string>, pages: readonly number[]): RevisionLog {
  const remove = new Set(pages);
  const ahead: Record<string, number[]> = {};
  for (const [day, list] of Object.entries(log.ahead ?? {})) {
    const kept = list.filter((p) => !(remove.has(p) && pageDays.get(p) === day));
    if (kept.length > 0) ahead[day] = kept;
  }
  const own = new Set(log.assignedPages ?? []);
  const creditedElsewhere = new Set(Object.values(ahead).flat());
  return {
    ...log,
    pagesRevised: log.pagesRevised.filter((p) => !remove.has(p) || own.has(p) || creditedElsewhere.has(p)),
    ...(log.ahead ? { ahead } : {}),
  };
}
