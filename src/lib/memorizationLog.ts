// What saving the memorization manager writes to the log (Majd, Nov 2026): pages newly marked
// become a dated memorization item for the day the user says (Today), or nothing (Before, which
// does not log); pages unmarked are removed from the items that hold them.

export type PageMark = 'memorized' | 'not_memorized';

/** The pages that changed: newly memorized, and unmemorized (only those that were memorized). */
export function memorizationChangeSet(
  pages: { pageNumber: number; status: string }[],
  pending: Map<number, PageMark>,
): { marked: number[]; unmarked: number[] } {
  const was = new Map(pages.map((p) => [p.pageNumber, p.status]));
  const marked: number[] = [];
  const unmarked: number[] = [];
  for (const [page, status] of pending) {
    const before = was.get(page);
    if (status === 'memorized' && before !== 'memorized') marked.push(page);
    if (status === 'not_memorized' && before === 'memorized') unmarked.push(page);
  }
  return { marked: marked.sort((a, b) => a - b), unmarked: unmarked.sort((a, b) => a - b) };
}

/** Above this many newly marked pages, "Before" is the sensible default (Majd's rule of thumb). */
export const BEFORE_DEFAULT_ABOVE = 5;

export type WhenMemorized = 'today' | 'before';

export function defaultWhen(marked: number[]): WhenMemorized {
  return marked.length > BEFORE_DEFAULT_ABOVE ? 'before' : 'today';
}
