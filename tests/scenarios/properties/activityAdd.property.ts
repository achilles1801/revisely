// Activity's add menu rules (ACT-5) and undoable deletes (ACT-6), from lib/activityAdd.

import fc from 'fast-check';
import { memorizeSuggestion, missedFromSession, UndoQueue } from '../../../src/lib/activityAdd';
import { runs } from './fixtures';

const pagesArb = fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { maxLength: 15 });

describe('the add menu (ACT-5)', () => {
  it('[ACT-5] “From your session” never offers a page the session revised, and only memorized missed pages', () => {
    fc.assert(
      fc.property(pagesArb, pagesArb, pagesArb, (revised, skipped, memo) => {
        const memorized = new Set(memo);
        const missed = missedFromSession({ pagesRevised: revised, pagesSkipped: skipped }, memorized);
        for (const p of missed) {
          expect(revised).not.toContain(p);
          expect(skipped).toContain(p);
          expect(memorized.has(p)).toBe(true);
        }
        expect(missed).toEqual([...missed].sort((a, b) => a - b));
      }),
      { numRuns: runs(200) },
    );
  });

  it('[ACT-5] the Memorized suggestion is read pages that are not memorized yet', () => {
    fc.assert(
      fc.property(pagesArb, pagesArb, (read, memo) => {
        const memorized = new Set(memo);
        const s = memorizeSuggestion(read, memorized);
        for (const p of s) expect(memorized.has(p)).toBe(false);
        for (const p of read) if (!memorized.has(p)) expect(s).toContain(p);
      }),
      { numRuns: runs(200) },
    );
  });
});

describe('undoable deletes (ACT-6)', () => {
  it('[ACT-6] a held delete is committed exactly once, or not at all when undone', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), (undoes) => {
        const jobs: { fn: () => void; cancelled: boolean }[] = [];
        const q = new UndoQueue({
          setTimeout: (fn) => {
            const j = { fn, cancelled: false };
            jobs.push(j);
            return j;
          },
          clearTimeout: (t) => {
            (t as { cancelled: boolean }).cancelled = true;
          },
        });
        const commits = undoes.map(() => jest.fn());
        undoes.forEach((_, i) => q.schedule(`n${i}`, commits[i]));
        undoes.forEach((u, i) => u && q.undo(`n${i}`));
        for (const j of jobs) if (!j.cancelled) j.fn();
        undoes.forEach((u, i) => expect(commits[i]).toHaveBeenCalledTimes(u ? 0 : 1));
      }),
      { numRuns: runs(150) },
    );
  });
});
