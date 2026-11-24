// Spot tests as their own kind of entry in Activity (ACT-34, Revisely Dev; Majd, Nov 23 2026: "spot tests or tests should be its own
// thing like recited or memorized when it's shown in journal or activity", stopped ones "marked as incomplete or stopped early").

import type { SpotTestRecord } from './reciteMemory/record';
import { t } from '../i18n';

/** A day's spot tests: how many, how many stopped early, and the pages they ran on. */
export interface SpotTestsDay {
  tests: number;
  stopped: number;
  pages: number[];
}

export const spotTestOutcome = (test: Pick<SpotTestRecord, 'finished'>): string =>
  t(test.finished ? 'reciteLive.test.finished' : 'reciteLive.test.stoppedEarly');

/** How a day's tests went, in a few words: "Finished", "Stopped early", "3 tests · 1 stopped early". */
export function spotTestsTail(day: SpotTestsDay): string {
  if (day.tests === 1) return spotTestOutcome({ finished: day.stopped === 0 });
  const tests = t('activity.day.spotTests', { count: day.tests });
  return day.stopped > 0 ? `${tests} · ${t('activity.day.spotStopped', { count: day.stopped })}` : tests;
}
