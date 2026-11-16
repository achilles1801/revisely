// Recite's kill switch rides on What's new's read of config/app (recite-server-prod-plan.md): `reciteCheckOff` exactly
// true closes the reader's mic to Recite and Mark mistakes; anything else leaves it as it was.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockConfig: { data: Record<string, unknown> | null } = { data: null };
jest.mock('../../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: async () => ({ exists: () => mockConfig.data != null, get: (k: string) => mockConfig.data?.[k] }),
}));
jest.mock('../../variant', () => ({ ...jest.requireActual('../../variant'), isDevVariant: () => true }));
jest.mock('../../recite/micSource', () => ({ ...jest.requireActual('../../recite/micSource'), isMicStreamAvailable: () => true }));

import { RECITE_OFF_KEY, refreshWhatsNewOff } from '../killSwitch';
import { reciteCheckOff, setReciteCheckOff } from '../../reciteLive/off';
import { reciteLiveEnabled } from '../../reciteLive/availability';

const tester = { previewTester: true };

beforeEach(() => setReciteCheckOff(false));

describe("Recite's kill switch (config/app.reciteCheckOff)", () => {
  it('on: the reader’s mic closes to Recite (it records as before), and the phone keeps it', async () => {
    expect(reciteLiveEnabled(tester, 'madani1405')).toBe(true);
    mockConfig.data = { reciteCheckOff: true };
    await refreshWhatsNewOff(true);
    expect(reciteCheckOff()).toBe(true);
    expect(reciteLiveEnabled(tester, 'madani1405')).toBe(false);
    expect(await AsyncStorage.getItem(RECITE_OFF_KEY)).toBe('1');
  });

  it('anything but exactly true leaves Recite on', async () => {
    for (const value of [false, 'true', 1, undefined]) {
      mockConfig.data = { reciteCheckOff: value };
      await refreshWhatsNewOff(true);
      expect(reciteCheckOff()).toBe(false);
      expect(reciteLiveEnabled(tester, 'madani1405')).toBe(true);
    }
  });
});
