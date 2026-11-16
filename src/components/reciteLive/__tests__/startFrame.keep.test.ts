// Keep as test data asks the checker to keep a take only on Revisely Dev's checker: production's keeps nothing
// (recite-server-prod-plan.md, BUCKET empty), so the store app never asks, and its summary never says a take was kept.

let mockDev = false;
jest.mock('../../../lib/variant', () => ({ ...jest.requireActual('../../../lib/variant'), isDevVariant: () => mockDev }));

import { startFrameFor } from '../useLiveRecitation';
import { RECITE_CHECK_DEFAULTS } from '../../../lib/reciteCheck/settings';

describe('the start frame’s keep', () => {
  const settings = { ...RECITE_CHECK_DEFAULTS, keep: true };

  it('the store app never asks to keep a take', () => {
    mockDev = false;
    expect(startFrameFor(562, 'check', settings).keep).toBe(false);
  });

  it('Revisely Dev asks only when Keep as test data is on', () => {
    mockDev = true;
    expect(startFrameFor(562, 'check', settings).keep).toBe(true);
    expect(startFrameFor(562, 'check', { ...settings, keep: false }).keep).toBe(false);
  });
});
