// Revisely Dev beside the store app (CLAUDE.md "Dev stack"): which app the JavaScript is running in,
// and that the ids it uses are the ones app.config.js gives each app.

const mockConstants: { expoConfig: { extra: Record<string, unknown> } | null } = { expoConfig: { extra: {} } };
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return mockConstants;
  },
}));

import { apiBase, appBundleId, isDevVariant, widgetAppGroup, DEV_APP_GROUP, DEV_BUNDLE_ID, STORE_APP_GROUP, STORE_BUNDLE_ID } from '../variant';

beforeEach(() => {
  mockConstants.expoConfig = { extra: {} };
});

describe('which app', () => {
  it('is the store app unless the config says dev', () => {
    expect(isDevVariant()).toBe(false);
    expect(appBundleId()).toBe('com.revisionbuddy.app');
    expect(widgetAppGroup()).toBe('group.com.revisionbuddy.app');
    expect(apiBase()).toBe('https://revisely.app');
    mockConstants.expoConfig = null;
    expect(isDevVariant()).toBe(false);
    mockConstants.expoConfig = { extra: { variant: 'store' } };
    expect(isDevVariant()).toBe(false);
  });

  it('is Revisely Dev with its own bundle id, App Group and API', () => {
    mockConstants.expoConfig = { extra: { variant: 'dev', apiBase: 'https://dev.revisely.app/' } };
    expect(isDevVariant()).toBe(true);
    expect(appBundleId()).toBe('com.revisionbuddy.app.dev');
    expect(widgetAppGroup()).toBe('group.com.revisionbuddy.app.dev');
    expect(apiBase()).toBe('https://dev.revisely.app');
  });

  it('takes only an https address on revisely.app for the API', () => {
    for (const bad of ['http://dev.revisely.app', 'https://revisely.app.evil.com', 'https://example.com', 42, '']) {
      mockConstants.expoConfig = { extra: { variant: 'dev', apiBase: bad } };
      expect(apiBase()).toBe('https://revisely.app');
    }
  });
});

describe('app.config.js gives each app the same ids', () => {
  const load = (variant?: string) => {
    const saved = process.env.APP_VARIANT;
    if (variant) process.env.APP_VARIANT = variant;
    else delete process.env.APP_VARIANT;
    try {
      let config: { expo: Record<string, any> } | undefined;
      jest.isolateModules(() => {
        config = require('../../../app.config.js').default;
      });
      return config!.expo;
    } finally {
      if (saved === undefined) delete process.env.APP_VARIANT;
      else process.env.APP_VARIANT = saved;
    }
  };

  it('the store app: its ids, scheme and no dev plugin', () => {
    const expo = load();
    expect(expo.name).toBe('Revisely');
    expect(expo.scheme).toBe('revisely');
    expect(expo.ios.bundleIdentifier).toBe(STORE_BUNDLE_ID);
    expect(expo.android.package).toBe(STORE_BUNDLE_ID);
    expect(expo.ios.entitlements['com.apple.security.application-groups']).toEqual([STORE_APP_GROUP]);
    expect(expo.ios.infoPlist.CFBundleURLTypes[1].CFBundleURLSchemes).toEqual(['revisely']);
    expect(expo.icon).toBe('./assets/icon.png');
    expect(expo.android.adaptiveIcon.backgroundColor).toBe('#000000');
    expect(JSON.stringify(expo.plugins)).not.toContain('withDevVariant');
    expect(expo.extra.variant).toBe('store');
  });

  it('Revisely Dev: its own ids, scheme, icon and the widget plugin', () => {
    const expo = load('dev');
    expect(expo.name).toBe('Revisely Dev');
    expect(expo.scheme).toBe('revisely-dev');
    expect(expo.ios.bundleIdentifier).toBe(DEV_BUNDLE_ID);
    expect(expo.android.package).toBe(DEV_BUNDLE_ID);
    expect(expo.ios.entitlements['com.apple.security.application-groups']).toEqual([DEV_APP_GROUP]);
    expect(expo.ios.infoPlist.CFBundleURLTypes[1].CFBundleURLSchemes).toEqual(['revisely-dev']);
    expect(expo.icon).toBe('./assets/dev/icon.png');
    expect(expo.plugins).toContain('./plugins/withDevVariant');
    expect(expo.extra.variant).toBe('dev');
    // Same EAS project and updates URL: the dev channel lives beside preview and production.
    const store = load();
    expect(expo.updates).toEqual(store.updates);
    expect(expo.extra.eas).toEqual(store.extra.eas);
  });
});
