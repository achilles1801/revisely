// "Help improve mistake detection" (RECITE-26) asks the checker to keep a take: on Revisely Dev, and in the store app
// only once its release switch is on (lib/release/trainingTakes) and the user has turned it on.

let mockDev = false;
jest.mock('../../../lib/variant', () => ({ ...jest.requireActual('../../../lib/variant'), isDevVariant: () => mockDev }));

import { startFrameFor } from '../useLiveRecitation';
import { RECITE_CHECK_DEFAULTS } from '../../../lib/reciteCheck/settings';
import { setTrainingTakesReleasedForTests } from '../../../lib/release/trainingTakes';
import { checkQuery } from '../../../lib/reciteCheck/service';

describe('the start frame’s keep (RECITE-26)', () => {
  const settings = { ...RECITE_CHECK_DEFAULTS, keep: true };
  afterEach(() => setTrainingTakesReleasedForTests(undefined));

  it('the store app, before the release switch: never asks to keep a take, even switched on', () => {
    mockDev = false;
    expect(startFrameFor(562, 'check', { ...settings, keepSet: true }).keep).toBe(false);
    expect(checkQuery({ sura: 67, ayah: 1 }, null, { ...settings, keepSet: true })).toContain('keep=0');
  });

  it('the store app, released: asks only when the user turned it on; a saved default never counts', () => {
    mockDev = false;
    setTrainingTakesReleasedForTests(true);
    expect(startFrameFor(562, 'check', { ...settings, keepSet: true }).keep).toBe(true);
    expect(startFrameFor(562, 'check', settings).keep).toBe(false);
    expect(startFrameFor(562, 'check', { ...settings, keep: false, keepSet: true }).keep).toBe(false);
  });

  it('Revisely Dev asks only when Help improve mistake detection is on (on by default)', () => {
    mockDev = true;
    expect(startFrameFor(562, 'check', settings).keep).toBe(true);
    expect(startFrameFor(562, 'check', { ...settings, keep: false }).keep).toBe(false);
  });
});

describe('the start frame’s namesAfter (contract draft 8)', () => {
  it('Mark mistakes asks for the summary at once and the names after it; Recite names nothing, so it doesn’t', () => {
    expect(startFrameFor(562, 'check', RECITE_CHECK_DEFAULTS).namesAfter).toBe(true);
    expect(startFrameFor(562, 'recite', RECITE_CHECK_DEFAULTS).namesAfter).toBeUndefined();
  });
});
