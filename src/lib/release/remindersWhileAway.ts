// Reminders while away (REMIND-2; Nov 21 2026). The revision reminders are planned on the phone while the app
// runs, for today and tomorrow. Someone who didn't open the app on their second day heard nothing more: 41 of
// 56 onboarded accounts were active on one day only (production counts, Nov 21 2026), and reminders on or off
// made no difference to who came back. With this on, each day after tomorrow gets one reminder, for a week
// from the last open (lib/reminders/plan LATER_DAYS).
//
// One switch, so it can reach App Store users on its own, before or with any release: off, it is Revisely
// Dev's; on, everyone's. Turning it on is this one line (REMINDERS_WHILE_AWAY_RELEASED = true), with REMIND-2's
// line moving from Revo's Dev guide to the main guide (and the re-record). releaseGates.test.ts holds both ways.

import { isDevVariant } from '../variant';

export const REMINDERS_WHILE_AWAY_RELEASED = false;

let forTests: boolean | undefined;

export const remindersWhileAwayReleased = (): boolean => forTests ?? REMINDERS_WHILE_AWAY_RELEASED;

/** For tests: run as if the switch were on (or off); undefined: as the switch says. */
export function setRemindersWhileAwayReleasedForTests(on: boolean | undefined): void {
  forTests = on;
}

/** Whether this phone plans the days after tomorrow: everyone once released, Revisely Dev until then. */
export const remindersWhileAwayEnabled = (): boolean => remindersWhileAwayReleased() || isDevVariant();
