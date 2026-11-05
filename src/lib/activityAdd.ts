// The rules behind Activity's add menu and its edits (Activity spec sections 2–3, C4).
// Pure: the screens pass pages and get the suggestion; the undo queue takes its timers.

/**
 * "From your session" (default): what the session missed, i.e. its skipped pages not
 * revised, among the memorized ones. The session's revised pages are already there.
 */
export function missedFromSession(log: { pagesRevised: number[]; pagesSkipped: number[] }, memorized: Set<number>): number[] {
  const revised = new Set(log.pagesRevised);
  return [...new Set(log.pagesSkipped)].filter((p) => !revised.has(p) && memorized.has(p)).sort((a, b) => a - b);
}

/** The Memorized suggestion: pages read today that aren't memorized yet. */
export function memorizeSuggestion(readPages: number[], memorized: Set<number>): number[] {
  return [...new Set(readPages)].filter((p) => !memorized.has(p)).sort((a, b) => a - b);
}

/** Removing a memorization un-marks its pages (only those still marked memorized). */
export function pagesToUnmark(entryPages: number[], memorized: Set<number>): number[] {
  return [...new Set(entryPages)].filter((p) => memorized.has(p)).sort((a, b) => a - b);
}

/**
 * Deletes that can be undone: each is held for `ms`, then committed. Undo cancels
 * it; a second delete of the same key replaces the first. `flush` commits all now
 * (sign-out, leaving the screen).
 */
export class UndoQueue {
  private held = new Map<string, { commit: () => void; timer: unknown }>();
  constructor(
    private readonly timers: {
      setTimeout: (fn: () => void, ms: number) => unknown;
      clearTimeout: (t: unknown) => void;
    } = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) },
  ) {}

  schedule(key: string, commit: () => void, ms = 5000): void {
    this.cancel(key);
    const timer = this.timers.setTimeout(() => {
      this.held.delete(key);
      commit();
    }, ms);
    this.held.set(key, { commit, timer });
  }

  /** Cancels the delete; true when there was one to cancel. */
  undo(key: string): boolean {
    const h = this.held.get(key);
    if (!h) return false;
    this.timers.clearTimeout(h.timer);
    this.held.delete(key);
    return true;
  }

  pending(key: string): boolean {
    return this.held.has(key);
  }

  flush(): void {
    const all = [...this.held.values()];
    this.held.clear();
    for (const h of all) {
      this.timers.clearTimeout(h.timer);
      h.commit();
    }
  }

  private cancel(key: string): void {
    const h = this.held.get(key);
    if (h) this.timers.clearTimeout(h.timer);
    this.held.delete(key);
  }
}
