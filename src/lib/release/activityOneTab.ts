// One Activity tab (ACT-35; Majd's version A, Nov 25 2026): the calendar and the picked day first, the seven sections as
// quiet rows under them, each opening a page of its own. No Overview | Insights switch.
//
// One switch, so it can reach App Store users on its own: off, it is Revisely Dev's; on, everyone's. Turning it on is this one
// line (ACTIVITY_ONE_TAB_RELEASED = true), with ACT-35's lines moving from Revo's Dev guide to the main guide (and the
// re-record). An E2E build turns it on with a link (lib/e2e/insightsPages).

import { useEffect, useReducer } from 'react';
import { isDevVariant } from '../variant';

export const ACTIVITY_ONE_TAB_RELEASED = false;

let forTests: boolean | undefined;

/** For tests: run as if the tab were one (or two); undefined: as the switch and the app say. */
export function setActivityOneTabForTests(on: boolean | undefined): void {
  forTests = on;
}

/** Everyone's once released, Revisely Dev's until then. */
export function activityOneTabEnabled(): boolean {
  if (forTests !== undefined) return forTests;
  // Under Jest, only where a test turns it on: the tests that run as Revisely Dev (for Gaps, Recite) test the two tabs.
  if (process.env.NODE_ENV === 'test') return ACTIVITY_ONE_TAB_RELEASED;
  if (ACTIVITY_ONE_TAB_RELEASED || isDevVariant()) return true;
  return process.env.EXPO_PUBLIC_E2E === '1'
    ? (require('../e2e/insightsPages') as typeof import('../e2e/insightsPages')).e2eInsightsPagesOn()
    : false;
}

/** activityOneTabEnabled for Activity, mounted beside Home before an E2E build's link turns it on. */
export function useActivityOneTab(): boolean {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(
    () =>
      process.env.EXPO_PUBLIC_E2E === '1'
        ? (require('../e2e/insightsPages') as typeof import('../e2e/insightsPages')).onInsightsPagesChange(refresh)
        : undefined,
    [],
  );
  return activityOneTabEnabled();
}
