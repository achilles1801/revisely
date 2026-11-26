// The tour (What's new 1.0.6): each slide shows only where its feature is open (the orchestrator's pick, Nov 26 2026: "a
// slide whose feature isn't released drops out by itself"). Revisely Dev has every one; the store app, none yet.

jest.mock('../../../lib/recite/micSource', () => ({ isMicStreamAvailable: () => true }));
let mockDev = true;
jest.mock('../../../lib/variant', () => ({ ...jest.requireActual('../../../lib/variant'), isDevVariant: () => mockDev }));

import { NEXT_RELEASE, cardsFor } from '../../../lib/help/whatsNew';
import { needOpen } from '../needs';
import { setActivityOneTabForTests } from '../../../lib/release/activityOneTab';
import { setHomeV3ForTests } from '../../../lib/release/homeV3';

const tester = { previewTester: true };

afterEach(() => {
  mockDev = true;
  setActivityOneTabForTests(undefined);
  setHomeV3ForTests(undefined);
});

describe("the tour's slides and their features", () => {
  it('Revisely Dev, Revo on for testers: all nine slides', () => {
    // Under Jest the Activity and Home switches read their release line; in the Dev app they are on.
    setActivityOneTabForTests(true);
    setHomeV3ForTests(true);
    const shown = cardsFor(NEXT_RELEASE!, (n) => needOpen(n, tester, 'testers'));
    expect(shown.map((c) => c.id)).toEqual(NEXT_RELEASE!.cards.map((c) => c.id));
  });

  it('the store app: none until each feature is released', () => {
    mockDev = false;
    const shown = cardsFor(NEXT_RELEASE!, (n) => needOpen(n, { previewTester: false }, 'everyone'));
    expect(shown).toEqual([]);
  });

  it('Revo not open to the account: the three Revo slides drop out, the rest stay', () => {
    setActivityOneTabForTests(true);
    setHomeV3ForTests(true);
    const shown = cardsFor(NEXT_RELEASE!, (n) => needOpen(n, { previewTester: false }, 'testers')).map((c) => c.id);
    expect(shown).not.toContain('ask');
    expect(shown).not.toContain('books');
    expect(shown).not.toContain('revo');
    expect(shown).toContain('ramadan');
  });
});
