// Whether "What's new" opens before Home (NEW-1, NEW-2), as a pure function of what the phone knows.

import { CURRENT_RELEASE, hasSeen, type WhatsNewRelease } from '../help/whatsNew';

/** `required`: the release's walkthrough, marked seen on the account at Done. `forced`: a tester's run at launch. */
export type WalkthroughMode = 'required' | 'forced';

export interface DueInput {
  /** Signed in with onboarding done. */
  onboarded: boolean;
  /** The account's `whatsNewSeen`. */
  mark: string | null | undefined;
  /** The kill switch (config/app.whatsNewOff); undefined until the phone's copy is read. */
  off: boolean | undefined;
  /** What's kept on the phone has been read (the card to resume on). */
  savedLoaded: boolean;
  /** A previewTester account. */
  tester: boolean;
  /** Show What's new at launch was on when this run started; undefined until read. */
  forced: boolean | undefined;
  release?: WhatsNewRelease;
  /** For tests: the release as switched on (or off), whatever its entry says. */
  live?: boolean;
}

/** The mode it opens in, null for Home, or `wait` while what decides it is still being read. */
export function walkthroughDue(i: DueInput): WalkthroughMode | 'wait' | null {
  if (!i.onboarded) return null;
  const release = i.release ?? CURRENT_RELEASE;
  const live = i.live ?? release.live;
  if (live && !hasSeen(i.mark, release)) {
    if (i.off === undefined || !i.savedLoaded) return 'wait';
    if (!i.off) return 'required';
  }
  if (!i.tester) return null;
  if (i.forced === undefined) return 'wait';
  return i.forced ? 'forced' : null;
}

let liveForTests: boolean | undefined;

/** For scenario tests: run as if the release were switched on (undefined: as its entry says). */
export function setWhatsNewLiveForTests(live: boolean | undefined): void {
  liveForTests = live;
}

export const whatsNewLiveForTests = (): boolean | undefined => liveForTests;

/** Settings → About → What's new (NEW-3): everyone once the release is on, testers before. */
export function replayOffered(user: { previewTester?: boolean } | null | undefined, release: WhatsNewRelease = CURRENT_RELEASE): boolean {
  if (!user) return false;
  return (liveForTests ?? release.live) || user.previewTester === true;
}
