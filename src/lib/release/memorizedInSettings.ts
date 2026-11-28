// Memorized pages off Home (MEM-9, MEM-10; Majd's option B with D's Activity card, Nov 27 2026: "not on home page but
// available in settings under its own thing (but id put it under the revision tab not above it) with the new memorized
// editor screen"). Home loses the memorized line and the juz dots, Settings' first level has Memorized pages under
// Revision, the editor is Settings-style, and Activity's Memorization section opens it, with its chart by month or by day.
//
// One switch, so it can reach App Store users on its own: off, it is Revisely Dev's; on, everyone's. Turning it on is this
// one line (MEMORIZED_IN_SETTINGS_RELEASED = true), with MEM-9's and MEM-10's lines moving from Revo's Dev guide to the main
// guide (and Home's line in the main guide going).

import { isDevVariant } from '../variant';

export const MEMORIZED_IN_SETTINGS_RELEASED = false;

let forTests: boolean | undefined;

/** For tests: run as if it were on (or off); undefined: as the switch and the app say. */
export function setMemorizedInSettingsForTests(on: boolean | undefined): void {
  forTests = on;
}

/** Everyone's once released, Revisely Dev's until then. */
export function memorizedInSettingsEnabled(): boolean {
  if (forTests !== undefined) return forTests;
  // Under Jest, only where a test turns it on: the tests that run as Revisely Dev test the store app's Home and editor.
  if (process.env.NODE_ENV === 'test') return MEMORIZED_IN_SETTINGS_RELEASED;
  return MEMORIZED_IN_SETTINGS_RELEASED || isDevVariant();
}
