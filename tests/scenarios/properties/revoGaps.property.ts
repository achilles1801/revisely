// Revo and Insights' Gaps (ACT-28, ACT-29; REVO-30): what the app sends from Revisely Dev (lib/revo/gaps) is always
// what the server takes (validateGaps), only beside `app: 'dev'`, and the context says it in words.

import fc from 'fast-check';
import { revoGaps } from '../../../src/lib/revo/gaps';
import { gapsText } from '../../../functions/src/revo/gaps';
import { validateGaps } from '../../../functions/src/revo/validate';
import type { User, UserPage } from '../../../src/types';
import { runs } from './fixtures';

const TODAY = '2026-11-15';
const T = Date.parse(`${TODAY}T00:00:00Z`) / 86_400_000;
const dayOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const user = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  dailyPageCapacity: 5,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  customPlan: null,
  fajrBoundaryEnabled: false,
  locationCoords: null,
  scheduleAnchorDate: '2026-01-01T12:00:00Z',
} as unknown as User;

describe('Revo and Gaps', () => {
  it('[ACT-28] [ACT-29] what Revisely Dev sends, the server takes; it names when each memorized surah was last revised', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { minLength: 1, maxLength: 40 }),
        fc.array(fc.integer({ min: 0, max: 200 }), { minLength: 1, maxLength: 30 }),
        (memorized, backs) => {
          const pages = memorized.map(
            (p, i) =>
              ({
                pageNumber: p,
                status: 'memorized',
                dateMemorized: '2025-06-01T00:00:00.000Z',
                weaknessRating: 4,
                lastRevisedDate: i % 3 === 0 ? null : `${dayOf(T - backs[i % backs.length])}T00:00:00.000Z`,
                totalRevisionCount: 1,
                skipCount: 0,
              }) as UserPage,
          );
          const history = backs.map((b) => ({ day: dayOf(T - b), pages: [memorized[0]] }));
          const g = revoGaps({ user, pages, history, today: TODAY, firstDay: '2025-06-01' });
          if (!g) return;
          const checked = validateGaps(JSON.parse(JSON.stringify(g)), 'context.gaps');
          expect(checked).toEqual(g);
          const text = gapsText(checked);
          expect(text).toMatch(/^Gaps, the last 30 days/);
          for (const s of g.surahs) expect(text).toContain(s.name);
        },
      ),
      { numRuns: runs(150) },
    );
  });

  it('[ACT-28] the server refuses a malformed gaps', () => {
    const good = { lastRevisedDaysAgo: 6, longestGap: { days: 9, endedDaysAgo: 6 }, usualStepDays: 1, longGaps: 2, fullRevision: { latePages: 18, pushedBackDays: 5, cycleDays: 5 }, surahs: [{ name: 'Al-Kahf', daysAgo: 9 }] };
    expect(validateGaps(good, 'g')).toEqual(good);
    for (const bad of [
      { ...good, extra: 1 },
      { ...good, longestGap: { days: 1, endedDaysAgo: 0 } },
      { ...good, usualStepDays: 1.3 },
      { ...good, fullRevision: { latePages: 0, pushedBackDays: 5, cycleDays: 5 } },
      { ...good, surahs: [{ name: 'Al-Kahf', daysAgo: 3, notYet: true }] },
      { ...good, surahs: [{ name: '<script>', daysAgo: 3 }] },
    ]) {
      expect(() => validateGaps(bad, 'g')).toThrow();
    }
  });
});
