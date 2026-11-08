// The rules behind Activity's add menu and its edits (Activity spec sections 2–3, C4).
// Pure: the screens pass pages and get the suggestion; the undo queue takes its timers.

/**
 * "From your session" (default): what the session missed, i.e. its skipped pages not
 * revised, among the memorized ones. The session's revised pages are already there, and so are
 * pages already added to the day by hand (`alreadyRevised`): offered again, a second tap added them
 * twice ("22 of 20", Nov 2026).
 */
export function missedFromSession(
  log: { pagesRevised: number[]; pagesSkipped: number[] },
  memorized: Set<number>,
  alreadyRevised: Iterable<number> = [],
): number[] {
  const revised = new Set([...log.pagesRevised, ...alreadyRevised]);
  return [...new Set(log.pagesSkipped)].filter((p) => !revised.has(p) && memorized.has(p)).sort((a, b) => a - b);
}

/** The Memorized suggestion: pages read today that aren't memorized yet. */
export function memorizeSuggestion(readPages: number[], memorized: Set<number>): number[] {
  return [...new Set(readPages)].filter((p) => !memorized.has(p)).sort((a, b) => a - b);
}

/**
 * A Memorized item's minutes after an add (ACT-5): the add's minutes join the day's. An add is
 * counted once: the item keeps the time of the last add it took (`updatedAt`, ms), and an add at or
 * before it (the same change sent again, or an older one) adds nothing.
 */
export function memorizedMinutesAfter(
  prev: { minutes?: number | null; updatedAt?: unknown } | null,
  add: { minutes?: number | null; at: number },
): { minutes: number | null; updatedAt: number } {
  const last = typeof prev?.updatedAt === 'number' ? prev.updatedAt : 0;
  const had = typeof prev?.minutes === 'number' ? prev.minutes : null;
  const fresh = add.at > last;
  const adding = fresh && typeof add.minutes === 'number' && add.minutes > 0 ? add.minutes : 0;
  return {
    minutes: adding > 0 ? (had ?? 0) + adding : had,
    updatedAt: Math.max(last, add.at),
  };
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

/**
 * The pages "Revised elsewhere" offers for `day` (ACT-5): the day's scheduled pages, as its session
 * holds them (or the plan, with no session), that are memorized and not revised for it yet, in
 * their order. `revised`: the pages credited to the day already, by sessions or logged by hand.
 */
export function revisedElsewhereChoices(input: {
  due: readonly number[];
  revised: Iterable<number>;
  memorized: ReadonlySet<number>;
}): number[] {
  const done = new Set(input.revised);
  return [...new Set(input.due)].filter((p) => input.memorized.has(p) && !done.has(p));
}
