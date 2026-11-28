// Home's today section as a ring (Majd, Nov 27 2026, his pick of the Home revision boards: "home direction C"; boards
// ~/Documents/revisely-today-mocks/home-revision-v1/png/C-a-ring-*). A ring of today's pages, two short lines under it and
// one centred button (HOME-10). Built on Home v3, in Revisely Dev only.
//
// One switch, so it can reach App Store users on its own: turning it on is this one line (HOME_RING_RELEASED = true), with
// HOME-10's line moving from Revo's Dev guide to the main guide (and the re-record), and Home v3 released with it or before.

import { isDevVariant } from '../variant';
import { homeV3Enabled } from './homeV3';

export const HOME_RING_RELEASED = false;

let forTests: boolean | undefined;

/** For tests: run as if the switch were on (or off); undefined: as the switch and the app say. */
export function setHomeRingForTests(on: boolean | undefined): void {
  forTests = on;
}

/** Everyone's once released, Revisely Dev's until then; never without Home v3 (it is that Home's today section). */
export function homeRingEnabled(): boolean {
  if (forTests !== undefined) return forTests;
  // Under Jest only where a test turns it on, so the tests of today's post keep testing it.
  if (process.env.NODE_ENV === 'test') return HOME_RING_RELEASED;
  // E2E builds keep today's post (its flows and screenshots), until the ring's own flow and baselines exist.
  if (process.env.EXPO_PUBLIC_E2E === '1') return false;
  return (HOME_RING_RELEASED || isDevVariant()) && homeV3Enabled();
}
