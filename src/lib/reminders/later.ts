// REMIND-2's release gate: the reminders on the days after tomorrow (lib/reminders/plan
// LATER_DAYS) are Revisely Dev's until the release opens them for everyone, in this one line.
// Their cadence (one a day for a week from the last open, then none) is Majd's to judge in Dev.

import { isDevVariant } from '../variant';
import { LATER_DAYS } from './plan';

/** How many days after tomorrow get one reminder each: LATER_DAYS in Revisely Dev, none in the store app. */
export function laterReminderDays(): number {
  return isDevVariant() ? LATER_DAYS : 0;
}
