// Home, version 3 (Majd's Nov 26 2026 boards, "perfect build it"): Home is today alone, with no Recent sessions (HOME-4),
// and has one solid button: Al-Kahf's Read is an outline and the catch-up's "Add to today" ends a grey line under the
// Today post's button (HOME-5, CARRY-1). Boards: ~/Documents/revisely-today-mocks/home-v3/png/v2.
//
// One switch, so it can reach App Store users on its own: off, it is Revisely Dev's; on, everyone's. Turning it on is this one
// line (HOME_V3_RELEASED = true), with HOME-4 and HOME-5's lines moving from Revo's Dev guide to the main guide (and the
// re-record). Past sessions then live in the Activity tab only (TAB-2: a day's page, All activity and its search). An E2E
// build turns it on with a link (lib/e2e/homeV3).

import { useEffect, useReducer } from 'react';
import { isDevVariant } from '../variant';

export const HOME_V3_RELEASED = false;

let forTests: boolean | undefined;

/** For tests: run as if the switch were on (or off); undefined: as the switch and the app say. */
export function setHomeV3ForTests(on: boolean | undefined): void {
  forTests = on;
}

/** Everyone's once released, Revisely Dev's until then. */
export function homeV3Enabled(): boolean {
  if (forTests !== undefined) return forTests;
  // Under Jest, only where a test turns it on: the tests that run as Revisely Dev (for Gaps, Recite) test today's Home.
  if (process.env.NODE_ENV === 'test') return HOME_V3_RELEASED;
  if (HOME_V3_RELEASED || isDevVariant()) return true;
  return process.env.EXPO_PUBLIC_E2E === '1'
    ? (require('../e2e/homeV3') as typeof import('../e2e/homeV3')).e2eHomeV3On()
    : false;
}

/** homeV3Enabled for Home, already on show when an E2E build's link turns it on. */
export function useHomeV3(): boolean {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(
    () =>
      process.env.EXPO_PUBLIC_E2E === '1'
        ? (require('../e2e/homeV3') as typeof import('../e2e/homeV3')).onHomeV3Change(refresh)
        : undefined,
    [],
  );
  return homeV3Enabled();
}
