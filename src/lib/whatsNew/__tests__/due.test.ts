// When "What's new" opens before Home (NEW-1, NEW-2, NEW-3).

import { walkthroughDue, replayOffered, type DueInput } from '../due';
import type { WhatsNewRelease } from '../../help/whatsNew';

const release: WhatsNewRelease = { id: 'r1', live: true, cards: [] };
const base: DueInput = { onboarded: true, mark: undefined, off: false, savedLoaded: true, tester: false, forced: undefined, release };

describe('walkthroughDue', () => {
  it('[NEW-1] an account from before the release, once it is on: required', () => {
    expect(walkthroughDue(base)).toBe('required');
  });

  it('[NEW-1] not before onboarding is done, not once seen, not while the release is off', () => {
    expect(walkthroughDue({ ...base, onboarded: false })).toBeNull();
    expect(walkthroughDue({ ...base, mark: 'r1' })).toBeNull();
    expect(walkthroughDue({ ...base, release: { ...release, live: false } })).toBeNull();
    expect(walkthroughDue({ ...base, live: false })).toBeNull();
  });

  it('[NEW-1] the kill switch stops it; it waits for the phone’s copy of the switch and of the card', () => {
    expect(walkthroughDue({ ...base, off: true })).toBeNull();
    expect(walkthroughDue({ ...base, off: undefined })).toBe('wait');
    expect(walkthroughDue({ ...base, savedLoaded: false })).toBe('wait');
  });

  it('[NEW-3] a tester’s run at launch, whatever the release says; it waits to read the switch', () => {
    const tester = { ...base, tester: true, mark: 'r1' };
    expect(walkthroughDue({ ...tester, forced: true })).toBe('forced');
    expect(walkthroughDue({ ...tester, forced: false })).toBeNull();
    expect(walkthroughDue({ ...tester, forced: undefined })).toBe('wait');
    expect(walkthroughDue({ ...tester, forced: true, release: { ...release, live: false } })).toBe('forced');
    expect(walkthroughDue({ ...tester, forced: true, off: true })).toBe('forced');
  });

  it('[NEW-3] a tester who hasn’t seen a live release gets the real one (marked at Done), not a test run', () => {
    expect(walkthroughDue({ ...base, tester: true, forced: true })).toBe('required');
  });

  it('a non-tester never waits for the run at launch', () => {
    expect(walkthroughDue({ ...base, mark: 'r1', forced: undefined })).toBeNull();
  });
});

describe('replayOffered', () => {
  it('[NEW-3] testers before the release is on, everyone after; nobody signed out', () => {
    expect(replayOffered({ previewTester: true }, { ...release, live: false })).toBe(true);
    expect(replayOffered({ previewTester: false }, { ...release, live: false })).toBe(false);
    expect(replayOffered({ previewTester: false }, release)).toBe(true);
    expect(replayOffered(null, release)).toBe(false);
  });
});
