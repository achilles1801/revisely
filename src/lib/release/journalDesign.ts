// The journal's new look (Majd's picks, Nov 23 2026): Revised elsewhere picks from a search and the 30 juz (ACT-33), the day
// under Overview's calendar is one entry (ACT-34), and Home has one quiet row into today's journal (HOME-2).
//
// One switch, so it can reach App Store users on its own: off, it is Revisely Dev's; on, everyone's. Turning it on is this one
// line (JOURNAL_DESIGN_RELEASED = true), with the three rules' lines moving from Revo's Dev guide to the main guide (and the
// re-record). releaseGates.test.ts holds both ways. An E2E build turns it on with a link (lib/e2e/journalDesign).

import { isDevVariant } from '../variant';

export const JOURNAL_DESIGN_RELEASED = false;

let forTests: boolean | undefined;

export const journalDesignReleased = (): boolean => forTests ?? JOURNAL_DESIGN_RELEASED;

/** For tests: run as if the switch were on (or off); undefined: as the switch says. */
export function setJournalDesignReleasedForTests(on: boolean | undefined): void {
  forTests = on;
}

/** Everyone's once released, Revisely Dev's until then. */
export function journalDesignEnabled(): boolean {
  if (journalDesignReleased() || isDevVariant()) return true;
  return process.env.EXPO_PUBLIC_E2E === '1'
    ? (require('../e2e/journalDesign') as typeof import('../e2e/journalDesign')).e2eJournalDesignOn()
    : false;
}
