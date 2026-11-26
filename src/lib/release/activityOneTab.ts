// One Activity tab (ACT-35; Majd's version A, Nov 25 2026): the calendar and the picked day first, the seven sections as
// quiet rows under them, each opening a page of its own. No Overview | Insights switch.
//
// One switch, so it can reach App Store users on its own: off, it is Revisely Dev's; on, everyone's. Turning it on is this one
// line (ACTIVITY_ONE_TAB_RELEASED = true), with ACT-35's lines moving from Revo's Dev guide to the main guide (and the
// re-record).

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
  return ACTIVITY_ONE_TAB_RELEASED || isDevVariant();
}
