import {
  EMPTY_CONFIG,
  StoreInput,
  availableBuild,
  availableVersion,
  compareVersions,
  offerLabel,
  parseOfferLabel,
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

describe('Android: version codes and internal testing', () => {
  const testing = (version: string, code: number) => ({
    minSupported: {},
    latest: {},
    testing: { android: { version, code } },
  });

  it('parseAppConfig keeps a version code and the internal testing build, and drops odd ones', () => {
    expect(
      parseAppConfig({ latest: { android: '1.0.4', androidCode: 7 }, testing: { android: { version: '1.0.4', code: 9 } } }),
    ).toEqual({ minSupported: {}, latest: { android: '1.0.4', androidCode: 7 }, testing: { android: { version: '1.0.4', code: 9 } } });
    expect(parseAppConfig({ latest: { androidCode: 7 }, testing: { android: { version: '1.0.4', code: '9' } } })).toEqual(EMPTY_CONFIG);
    expect(parseAppConfig({ testing: { android: { version: 'x', code: 9 } } })).toEqual(EMPTY_CONFIG);
    expect(parseAppConfig({ testing: { android: { version: '1.0.4', code: 1.5 } } })).toEqual(EMPTY_CONFIG);
  });

  it('a tester is offered the internal testing build; anyone else is not', () => {
    const config = testing('1.0.4', 9);
    expect(storeDecision(android({ config, installedCode: 5, tester: true })).offer).toBe('1.0.4');
    expect(storeDecision(android({ config, installedCode: 5, tester: false })).offer).toBeNull();
    expect(storeDecision(android({ config, installedCode: 5 })).offer).toBeNull();
  });

  it('a new build of the installed version is offered by its code, named with it', () => {
    const config = testing('1.0.3', 6);
    expect(storeDecision(android({ config, installedCode: 5, tester: true })).offer).toBe('1.0.3 (6)');
    expect(storeDecision(android({ config, installedCode: 6, tester: true })).offer).toBeNull();
    expect(storeDecision(android({ config, installedCode: 7, tester: true })).offer).toBeNull();
    // Without the installed code (it can't be read), versions decide: the same version is nothing new.
    expect(storeDecision(android({ config, installedCode: null, tester: true })).offer).toBeNull();
  });

  it('takes the newer of production and internal testing', () => {
    const both = { minSupported: {}, latest: { android: '1.0.4', androidCode: 7 }, testing: { android: { version: '1.0.5', code: 9 } } };
    expect(availableBuild(android({ config: both, installedCode: 5, tester: true }))).toEqual({ version: '1.0.5', code: 9 });
    expect(availableBuild(android({ config: both, installedCode: 5, tester: false }))).toEqual({ version: '1.0.4', code: 7 });
    const behind = { ...both, testing: { android: { version: '1.0.3', code: 5 } } };
    expect(availableBuild(android({ config: behind, installedCode: 5, tester: true }))).toEqual({ version: '1.0.4', code: 7 });
  });

  it('once per build: a later build is offered again, the same or an older one is not', () => {
    const config = testing('1.0.3', 6);
    const base = { config, installedCode: 5, tester: true };
    expect(storeDecision(android({ ...base, offered: '1.0.3 (6)' })).offer).toBeNull();
    expect(storeDecision(android({ ...base, offered: '1.0.3 (5)' })).offer).toBe('1.0.3 (6)');
    expect(storeDecision(android({ ...base, offered: '1.0.4' })).offer).toBeNull();
    // 1.0.4 was offered while 1.0.3 was installed; with 1.0.4 (7) installed, its build 8 is new.
    const later = testing('1.0.4', 8);
    expect(storeDecision(android({ config: later, installed: '1.0.4', installedCode: 7, tester: true, offered: '1.0.4' })).offer).toBe('1.0.4 (8)');
    // A new version after a build was offered.
    expect(storeDecision(android({ config: testing('1.0.4', 7), installedCode: 6, tester: true, offered: '1.0.3 (6)' })).offer).toBe('1.0.4');
  });

  it('the minimum counts a tester build as what Play has', () => {
    const config = { minSupported: { android: '1.0.4' }, latest: {}, testing: { android: { version: '1.0.4', code: 7 } } };
    expect(storeDecision(android({ config, installedCode: 5, tester: true })).required).toEqual({ installed: '1.0.3', minimum: '1.0.4' });
    expect(storeDecision(android({ config, installedCode: 5, tester: false })).required).toBeNull();
  });

  it('offer labels round-trip', () => {
    expect(offerLabel({ version: '1.0.4', code: 7 }, '1.0.3')).toBe('1.0.4');
    expect(offerLabel({ version: '1.0.3', code: 6 }, '1.0.3')).toBe('1.0.3 (6)');
    expect(offerLabel({ version: '1.0.4', code: null }, '1.0.4')).toBe('1.0.4');
    expect(parseOfferLabel('1.0.3 (6)')).toEqual({ version: '1.0.3', code: 6 });
    expect(parseOfferLabel('1.0.4')).toEqual({ version: '1.0.4', code: null });
    expect(parseOfferLabel('nonsense (6)')).toBeNull();
    expect(parseOfferLabel(null)).toBeNull();
  });

  it('iOS ignores version codes and testing builds', () => {
    expect(storeDecision(ios({ config: testing('9.0', 99), installedCode: 1, tester: true })).offer).toBe('1.0.4');
  });

  it('availableVersion is the version of that build', () => {
    expect(availableVersion(android({ config: testing('1.0.3', 6), installedCode: 5, tester: true }))).toBe('1.0.3');
  });
});
