let mockInstallSource: { isTestFlight: () => boolean } | null = { isTestFlight: () => false };
jest.mock('../../../../modules/install-source', () => ({
  get __esModule() {
    return true;
  },
  get default() {
    return mockInstallSource;
  },
}));

import { Platform } from 'react-native';
import { showsUpdateTools } from '../testerTools';

const g = globalThis as { __DEV__?: boolean };

beforeEach(() => {
  g.__DEV__ = false;
  mockInstallSource = { isTestFlight: () => false };
  jest.replaceProperty(Platform, 'OS', 'ios');
});
afterAll(() => {
  g.__DEV__ = true;
});

describe('showsUpdateTools', () => {
  it('not for regular users, on either platform', () => {
    expect(showsUpdateTools({ previewTester: false })).toBe(false);
    expect(showsUpdateTools(null)).toBe(false);
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(showsUpdateTools({})).toBe(false);
  });

  it('for previewTester accounts, on either platform', () => {
    expect(showsUpdateTools({ previewTester: true })).toBe(true);
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(showsUpdateTools({ previewTester: true })).toBe(true);
  });

  it('for TestFlight installs (iOS), whoever signs in', () => {
    mockInstallSource = { isTestFlight: () => true };
    expect(showsUpdateTools(null)).toBe(true);
    // Android has no such module: Play can't tell testing from production.
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(showsUpdateTools(null)).toBe(false);
  });

  it('for development builds', () => {
    g.__DEV__ = true;
    expect(showsUpdateTools(null)).toBe(true);
  });

  it('a binary that cannot tell, or a module that throws: not a tester', () => {
    mockInstallSource = null;
    expect(showsUpdateTools(null)).toBe(false);
    mockInstallSource = {
      isTestFlight: () => {
        throw new Error('no');
      },
    };
    expect(showsUpdateTools(null)).toBe(false);
  });
});
