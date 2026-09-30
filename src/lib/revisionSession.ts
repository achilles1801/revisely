import { RevisionLog } from '../types';

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
  return { ...log, pagesRevised: log.pagesRevised.filter((p) => !remove.has(p)) };
}
