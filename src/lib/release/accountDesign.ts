// The Account page's new look (Majd approved the boards on Nov 26 2026: "account board stuff looks good let's build
// it"): the picture or first letter in Premium's ring, pages revised, the longest streak and badges for pages revised
// (ACCOUNT-4 to ACCOUNT-7), Name and email with Delete account at its foot, and no early-access words (PREM-1).
//
// One switch, so it can reach App Store users on its own: off, it is Revisely Dev's; on, everyone's. Turning it on is
// this one line (ACCOUNT_DESIGN_RELEASED = true), with the rules' lines moving from Revo's Dev guide to the main guide.
// releaseGates.test.ts holds both ways.

import { isDevVariant } from '../variant';

export const ACCOUNT_DESIGN_RELEASED = false;

let forTests: boolean | undefined;

export const accountDesignReleased = (): boolean => forTests ?? ACCOUNT_DESIGN_RELEASED;

/** For tests: run as if the switch were on (or off); undefined: as the switch says. */
export function setAccountDesignReleasedForTests(on: boolean | undefined): void {
  forTests = on;
}

let enabledForTests: boolean | undefined;

/** For tests: the look on (or off) whatever the switch and the app; undefined: as they say. */
export function setAccountDesignEnabledForTests(on: boolean | undefined): void {
  enabledForTests = on;
}

/** Everyone's once released, Revisely Dev's until then. */
export function accountDesignEnabled(): boolean {
  return enabledForTests ?? (accountDesignReleased() || isDevVariant());
}
