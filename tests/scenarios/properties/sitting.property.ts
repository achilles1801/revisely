// A sitting in the reader (REC-1, lib/readingTimer): the pages it held are those on screen a minute
// or more while it ran, over any order of page turns, pauses and resumes.

import fc from 'fast-check';
import { HELD_MS, notePageOnScreen, pagesHeld, pageTimesAt, pauseTimer, resumeTimer, startTimer } from '../../../src/lib/readingTimer';
import { runs } from './fixtures';

type Step = { kind: 'page'; page: number; after: number } | { kind: 'pause'; after: number } | { kind: 'resume'; after: number };

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant('page' as const), page: fc.integer({ min: 560, max: 566 }), after: fc.integer({ min: 0, max: 5 * 60_000 }) }),
  fc.record({ kind: fc.constant('pause' as const), after: fc.integer({ min: 0, max: 5 * 60_000 }) }),
  fc.record({ kind: fc.constant('resume' as const), after: fc.integer({ min: 0, max: 5 * 60_000 }) }),
);

describe('a sitting in the reader (REC-1)', () => {
  it('[REC-1] names the pages on screen a minute or more, never one glanced at, and counts no paused time', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), fc.integer({ min: 0, max: 3 * 60_000 }), (steps, tail) => {
        let now = 0;
        let t = startTimer('stopwatch', null, '2026-11-03', now);
        // What the test itself counts: each page's time on screen while running.
        const mine = new Map<number, number>();
        let on: number | null = null;
        let running = true;
        const bank = (ms: number) => {
          if (running && on != null) mine.set(on, (mine.get(on) ?? 0) + ms);
        };
        for (const s of steps) {
          bank(s.after);
          now += s.after;
          if (s.kind === 'page') {
            if (running) {
              t = notePageOnScreen({ ...t, pagesVisited: t.pagesVisited.includes(s.page) ? t.pagesVisited : [...t.pagesVisited, s.page] }, s.page, now);
              on = s.page;
            }
          } else if (s.kind === 'pause') {
            t = pauseTimer(t, now);
            running = false;
          } else {
            t = resumeTimer(t, now);
            running = true;
          }
        }
        bank(tail);
        now += tail;
        const times = pageTimesAt(t, now);
        for (const [p, ms] of mine) expect(times[String(p)] ?? 0).toBe(ms);
        const held = pagesHeld(t, now);
        if (Object.keys(times).length > 0) {
          expect(held).toEqual(t.pagesVisited.filter((p) => (mine.get(p) ?? 0) >= HELD_MS));
        }
      }),
      { numRuns: runs(300) },
    );
  });
});
