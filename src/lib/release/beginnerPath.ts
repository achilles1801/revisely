// The beginner path (Majd, Nov 28 2026: "yeah we should build C then A -- just make sure there's literally no regression
// anywhere and this whole new "path" is treated completely independent of the normal current existing path. essentially
// it SHOULD be beginner path, middle path (what we have now), and hafz path"). Boards:
// ~/Documents/revisely-onboarding-mocks/beginners-v1/ (C, then A). Setup's first question gains "None yet, or a few
// surahs", which leads to the beginner's own setup and Home (PATH-1, BEGIN-*); everything else is today's app.
//
// One switch, so it can reach App Store users on its own: turning it on is this one line (BEGINNER_PATH_RELEASED = true),
// with PATH-1's and BEGIN-*'s lines moving from Revo's Dev guide to the main guide, and the store app's onboarding E2E
// flows and baselines gaining the third answer.

import { isDevVariant } from '../variant';
import { homeRingEnabled } from './homeRing';

export const BEGINNER_PATH_RELEASED = false;

let forTests: boolean | undefined;

/** For tests: run as if the switch were on (or off); undefined: as the switch and the app say. */
export function setBeginnerPathForTests(on: boolean | undefined): void {
  forTests = on;
}

/**
 * Everyone's once released, Revisely Dev's until then; never without Home's ring, which the beginner's Home is drawn
 * with (BEGIN-2, BEGIN-3).
 */
export function beginnerPathEnabled(): boolean {
  if (forTests !== undefined) return forTests;
  // Under Jest only where a test turns it on, so every other test runs today's setup and Home unchanged.
  if (process.env.NODE_ENV === 'test') return BEGINNER_PATH_RELEASED;
  // E2E builds keep today's two answers (their flows and screenshots), until the beginner path has flows of its own.
  if (process.env.EXPO_PUBLIC_E2E === '1') return false;
  return (BEGINNER_PATH_RELEASED || isDevVariant()) && homeRingEnabled();
}
