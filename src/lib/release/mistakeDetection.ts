// The mistake detection release (1.0.5; Majd, Nov 16 2026: "the main new feature is going to be mistake detection").
// One switch for what it opens to every account:
// - Recite: the reader's mic, Mark mistakes, Test me, Recite's memory and Insights' Recitation (reciteLiveForAccount);
// - Insights' Gaps and Last revised (gapsInsightsEnabled).
// Off, they stay Revisely Dev's (its testers'). The release PR turns it on, in the same change that appends What's new's
// NEXT_RELEASE to RELEASES with `live: true` (lib/help/whatsNew); releaseGates.test.ts holds each gate both ways.
// Production gets JavaScript only through Promote, so store users get it in the same update as its What's new.

export const MISTAKE_DETECTION_RELEASED = false;

let forTests: boolean | undefined;

export const mistakeDetectionReleased = (): boolean => forTests ?? MISTAKE_DETECTION_RELEASED;

/** For tests: run as if the release were switched on (or off); undefined: as the switch says. */
export function setMistakeDetectionReleasedForTests(on: boolean | undefined): void {
  forTests = on;
}

// Strict (tajweed marks: madd lengths, qalqalah, ghunnah, ikhfa, idgham, iqlab) has a switch of its own (Majd, Nov 17
// 2026: Strict is decided after the model sheets; the release is Recite and Words & harakat first). Off, Strict is
// Revisely Dev's alone: everyone else marks Words & harakat, Settings offers no choice of level or madd lengths, and
// What's new shows no tajweed mark. Turning the release on doesn't turn this on.

export const STRICT_RELEASED = false;

let strictForTests: boolean | undefined;

export const strictReleased = (): boolean => strictForTests ?? STRICT_RELEASED;

/** For tests: run as if Strict were released (or not); undefined: as the switch says. */
export function setStrictReleasedForTests(on: boolean | undefined): void {
  strictForTests = on;
}
