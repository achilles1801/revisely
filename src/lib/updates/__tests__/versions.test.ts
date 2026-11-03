import {
  EMPTY_CONFIG,
  StoreInput,
  availableVersion,
  compareVersions,
  isVersion,
  minimumAwaitsListing,
  parseAppConfig,
  parseListing,
  parseLookup,
  storeDecision,
} from '../versions';

const BUNDLE = 'com.revisionbuddy.app';

function ios(over: Partial<StoreInput> = {}): StoreInput {
  return {
    platform: 'ios',
    installed: '1.0.3',
    osVersion: '18.2',
    exempt: false,
    config: EMPTY_CONFIG,
    listing: { version: '1.0.4', minimumOsVersion: '15.1' },
    offered: null,
    ...over,
  };
}

function android(over: Partial<StoreInput> = {}): StoreInput {
  return {
    platform: 'android',
    installed: '1.0.3',
    osVersion: null,
    exempt: false,
    config: { minSupported: {}, latest: { android: '1.0.4' } },
    listing: null,
    offered: null,
    ...over,
  };
}

describe('compareVersions', () => {
  it('compares number by number', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.0.3', '1.0.4')).toBe(-1);
    expect(compareVersions('1.1', '1.0.9')).toBe(1);
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
  });

  it('treats missing parts as 0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1', '1.0.1')).toBe(-1);
  });
});

describe('isVersion', () => {
  it('takes one to four numbers', () => {
    expect(['1', '1.0', '1.0.3', '18.2.1.4'].every(isVersion)).toBe(true);
    expect([undefined, null, 3, '', 'v1.0', '1.0.', '1..0', '1.0.3-beta', '1.0.0.0.0', ' 1.0'].some(isVersion)).toBe(false);
  });
});

describe('parseAppConfig', () => {
  it('keeps the versions', () => {
    expect(
      parseAppConfig({ minSupported: { ios: '1.0.3', android: '1.0.2' }, latest: { android: '1.0.4' }, updatedAt: {} }),
    ).toEqual({ minSupported: { ios: '1.0.3', android: '1.0.2' }, latest: { android: '1.0.4' } });
  });

  it('drops anything that is not a version, so a typo blocks nobody', () => {
    expect(parseAppConfig({ minSupported: { ios: '1.0.4 ', android: 104 }, latest: 'x' })).toEqual(EMPTY_CONFIG);
    expect(parseAppConfig(null)).toEqual(EMPTY_CONFIG);
    expect(parseAppConfig('nope')).toEqual(EMPTY_CONFIG);
  });
});

describe('parseLookup', () => {
  it("finds this app's entry", () => {
    const json = {
      resultCount: 2,
      results: [
        { bundleId: 'other.app', version: '9.9' },
        { bundleId: BUNDLE, version: '1.0.4', minimumOsVersion: '15.1', releaseNotes: '…' },
      ],
    };
    expect(parseLookup(json, BUNDLE)).toEqual({ version: '1.0.4', minimumOsVersion: '15.1' });
  });

  it('is null when the app is not listed or the answer is odd', () => {
    expect(parseLookup({ resultCount: 0, results: [] }, BUNDLE)).toBeNull();
    expect(parseLookup({ results: [{ bundleId: BUNDLE, version: 'soon' }] }, BUNDLE)).toBeNull();
    expect(parseLookup('<html>', BUNDLE)).toBeNull();
    expect(parseLookup(null, BUNDLE)).toBeNull();
  });

  it('a listing without a readable minimum iOS keeps its version', () => {
    expect(parseListing({ version: '1.0.4', minimumOsVersion: 'any' })).toEqual({ version: '1.0.4', minimumOsVersion: null });
  });
});

describe('storeDecision: the offer', () => {
  it('offers a newer App Store version', () => {
    expect(storeDecision(ios())).toEqual({ required: null, offer: '1.0.4' });
  });

  it('once per version: not again once offered, but again for a later one', () => {
    expect(storeDecision(ios({ offered: '1.0.4' })).offer).toBeNull();
    expect(storeDecision(ios({ offered: '1.0.4', listing: { version: '1.0.5', minimumOsVersion: null } })).offer).toBe('1.0.5');
    // A stale listing (older than what was offered) offers nothing.
    expect(storeDecision(ios({ offered: '1.0.5' })).offer).toBeNull();
  });

  it('nothing when the store has the same or an older version', () => {
    expect(storeDecision(ios({ listing: { version: '1.0.3', minimumOsVersion: null } })).offer).toBeNull();
    expect(storeDecision(ios({ installed: '1.0.5' })).offer).toBeNull();
    expect(storeDecision(ios({ listing: null })).offer).toBeNull();
  });

  it('nothing when the new version needs a newer iOS than the phone has', () => {
    expect(storeDecision(ios({ osVersion: '15.0', listing: { version: '1.0.4', minimumOsVersion: '16.0' } })).offer).toBeNull();
    expect(storeDecision(ios({ osVersion: '16.0', listing: { version: '1.0.4', minimumOsVersion: '16.0' } })).offer).toBe('1.0.4');
  });

  it('never in development, TestFlight or App Review', () => {
    expect(storeDecision(ios({ exempt: true }))).toEqual({ required: null, offer: null });
    expect(storeDecision(android({ exempt: true }))).toEqual({ required: null, offer: null });
  });

  it("Android offers config/app's latest.android", () => {
    expect(storeDecision(android()).offer).toBe('1.0.4');
    expect(storeDecision(android({ config: EMPTY_CONFIG })).offer).toBeNull();
    // The iOS listing means nothing on Android.
    expect(storeDecision(android({ config: EMPTY_CONFIG, listing: { version: '2.0', minimumOsVersion: null } })).offer).toBeNull();
  });

  it('nothing without a readable installed version', () => {
    expect(storeDecision(ios({ installed: null }))).toEqual({ required: null, offer: null });
  });
});

describe('storeDecision: the minimum', () => {
  it('blocks below the minimum once the App Store has it', () => {
    const config = { minSupported: { ios: '1.0.4' }, latest: {} };
    expect(storeDecision(ios({ config }))).toEqual({ required: { installed: '1.0.3', minimum: '1.0.4' }, offer: null });
  });

  it('does not block before the store has it: an offer at most', () => {
    const config = { minSupported: { ios: '1.0.5' }, latest: {} };
    expect(storeDecision(ios({ config }))).toEqual({ required: null, offer: '1.0.4' });
    expect(storeDecision(ios({ config, listing: null }))).toEqual({ required: null, offer: null });
  });

  it('does not block at or above the minimum', () => {
    const config = { minSupported: { ios: '1.0.3' }, latest: {} };
    expect(storeDecision(ios({ config })).required).toBeNull();
  });

  it('does not block where the new version cannot be installed (iOS too old)', () => {
    const config = { minSupported: { ios: '1.0.4' }, latest: {} };
    expect(
      storeDecision(ios({ config, osVersion: '15.0', listing: { version: '1.0.4', minimumOsVersion: '16.0' } })).required,
    ).toBeNull();
  });

  it('blocks even after the offer was seen', () => {
    const config = { minSupported: { ios: '1.0.4' }, latest: {} };
    expect(storeDecision(ios({ config, offered: '1.0.4' })).required).not.toBeNull();
  });

  it('never blocks TestFlight or App Review', () => {
    const config = { minSupported: { ios: '1.0.4' }, latest: {} };
    expect(storeDecision(ios({ config, exempt: true })).required).toBeNull();
  });

  it("Android blocks only when latest.android meets the minimum, and uses Android's minimum", () => {
    expect(storeDecision(android({ config: { minSupported: { android: '1.0.4' }, latest: { android: '1.0.4' } } })).required).toEqual({
      installed: '1.0.3',
      minimum: '1.0.4',
    });
    expect(storeDecision(android({ config: { minSupported: { android: '1.0.5' }, latest: { android: '1.0.4' } } })).required).toBeNull();
    expect(storeDecision(android({ config: { minSupported: { ios: '1.0.4' }, latest: { android: '1.0.4' } } })).required).toBeNull();
  });
});

describe('availableVersion and minimumAwaitsListing', () => {
  it('available is the store version only when newer', () => {
    expect(availableVersion(ios())).toBe('1.0.4');
    expect(availableVersion(ios({ installed: '1.0.4' }))).toBeNull();
  });

  it('a minimum the listing does not show yet waits on it', () => {
    const config = { minSupported: { ios: '1.0.5' }, latest: {} };
    expect(minimumAwaitsListing(ios({ config }))).toBe(true);
    expect(minimumAwaitsListing(ios({ config, listing: { version: '1.0.5', minimumOsVersion: null } }))).toBe(false);
    expect(minimumAwaitsListing(ios())).toBe(false);
    expect(minimumAwaitsListing(ios({ config, installed: '1.0.5' }))).toBe(false);
    expect(minimumAwaitsListing(ios({ config, exempt: true }))).toBe(false);
    expect(minimumAwaitsListing(android({ config: { minSupported: { android: '1.0.9' }, latest: {} } }))).toBe(false);
  });
});
