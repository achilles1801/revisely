// The account an E2E flow asks for at launch (src/lib/e2e/account.ts, E2EAccount.tsx): the request,
// and the onboarding calls made in the screens' order, each once what its screen waits for is here.

import React from 'react';
import { Platform } from 'react-native';
import { act, render } from '@testing-library/react-native';
import type { UserPage } from '../../../types';

// The launch's arguments as iOS hands them to the app's defaults (Settings), and the platform.
const mockLaunch: { os: string; args: Record<string, unknown> } = { os: 'ios', args: {} };
const realOS = Platform.OS;
jest.mock('react-native/Libraries/Settings/Settings', () => ({
  __esModule: true,
  default: { get: (key: string) => mockLaunch.args[key] },
}));

const calls: string[] = [];
const mockAuth = {
  firebaseUser: { displayName: 'E2E' } as { displayName: string } | null,
  signUp: jest.fn(async (email: string, password: string, name: string) => {
    calls.push(`signUp ${email} ${password} ${name}`);
  }),
};
const mockApp = {
  isAuthenticated: false,
  user: null as object | null,
  loading: true,
  onboardingComplete: false,
  pages: [] as UserPage[],
  updatePages: jest.fn(async (_pages: UserPage[], changed: number[]) => {
    calls.push(`updatePages ${changed.length}`);
  }),
  createDefaultUser: jest.fn((overrides: Record<string, unknown>) => ({ id: 'u', ...overrides })),
  saveUser: jest.fn(async () => {
    calls.push('saveUser');
  }),
  completeOnboarding: jest.fn(async () => {
    calls.push('completeOnboarding');
  }),
};
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../notifications', () => ({ ensureNotificationsPermission: jest.fn(async () => true) }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 41.88, longitude: -87.63 } })),
  Accuracy: { Balanced: 3 },
}));

// Loaded after the mocks above (jest hoists them); one copy of React for the component.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const account: typeof import('../account') = require('../account');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const component: typeof import('../E2EAccount') = require('../E2EAccount');

function newPages(count = 604): UserPage[] {
  return Array.from({ length: count }, (_, i) => ({ pageNumber: i + 1, status: 'not_memorized' }) as UserPage);
}

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { get: () => mockLaunch.os, configurable: true });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockLaunch.os = 'ios';
  mockLaunch.args = {};
  Object.assign(mockApp, { isAuthenticated: false, user: null, loading: true, onboardingComplete: false, pages: [] });
  account.accountDone();
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true, writable: true });
});

describe('the request', () => {
  it('reads an email, a boundary and juz (midnight and Juz 30 unless given)', () => {
    expect(account.parseAccount('email=e2e1%40example.com')).toEqual({ email: 'e2e1@example.com', boundary: 'midnight', juz: [30] });
    expect(account.parseAccount('?email=a@b.c&boundary=fajr&juz=29,30')).toEqual({ email: 'a@b.c', boundary: 'fajr', juz: [29, 30] });
  });

  it('refuses a request without an email or with a bad value', () => {
    expect(account.parseAccount('boundary=midnight')).toBeNull();
    expect(account.parseAccount('email=a@b.c&boundary=noon')).toBeNull();
    expect(account.parseAccount('email=a@b.c&juz=31')).toBeNull();
  });

  it('comes from the link (Android) or the launch arguments (iOS)', () => {
    expect(account.handleAccountLink('revisely://e2e/clock?at=now')).toBe(false);
    expect(account.handleAccountLink('revisely://e2e/account?email=x@y.z')).toBe(true);
    expect(account.pendingAccount()?.email).toBe('x@y.z');
    account.accountDone();

    mockLaunch.args = { e2eAccount: 'email=l@y.z&boundary=midnight' };
    account.readLaunchAccount();
    expect(account.pendingAccount()?.email).toBe('l@y.z');
    account.accountDone();

    mockLaunch.os = 'android';
    account.readLaunchAccount();
    expect(account.pendingAccount()).toBeNull();
  });
});

describe('onboardingMarks', () => {
  it('is page 1 and the juz’s pages, as onboarding marks them (24 for Juz 30)', () => {
    const marks = component.onboardingMarks(newPages(), [30]);
    expect([...marks.keys()].sort((a, b) => a - b)).toEqual([1, ...Array.from({ length: 23 }, (_, i) => 582 + i)]);
    expect(new Set(marks.values())).toEqual(new Set(['memorized']));
  });
});

describe('E2EAccount', () => {
  it('signs up, marks the pages once they are here, then saves the schedule once they show', async () => {
    mockLaunch.args = { e2eAccount: 'email=e2e@example.com' };
    account.readLaunchAccount();
    const { rerender } = render(<component.E2EAccount />);
    await act(async () => undefined);
    expect(calls).toEqual(['signUp e2e@example.com e2e-password E2E']);

    // The account, but its second batch of pages isn't here yet: Continue would wait.
    Object.assign(mockApp, { isAuthenticated: true, user: {}, loading: false, pages: newPages(450) });
    rerender(<component.E2EAccount />);
    await act(async () => undefined);
    expect(calls).toHaveLength(1);

    mockApp.pages = newPages();
    rerender(<component.E2EAccount />);
    await act(async () => undefined);
    expect(calls).toEqual(['signUp e2e@example.com e2e-password E2E', 'updatePages 24']);

    // The marks shown: the schedule screen's step.
    mockApp.pages = newPages().map((p) => (p.pageNumber === 1 || p.pageNumber >= 582 ? { ...p, status: 'memorized' } : p));
    rerender(<component.E2EAccount />);
    await act(async () => undefined);
    expect(calls.slice(2).sort()).toEqual(['completeOnboarding', 'saveUser']);
    expect(mockApp.createDefaultUser).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'E2E',
        dailyPageCapacity: 10,
        scheduleMode: 'pages',
        notificationsEnabled: true,
        fajrBoundaryEnabled: false,
        locationCoords: null,
      }),
    );
    expect(account.pendingAccount()).toBeNull();

    // Nothing more, whatever changes next.
    mockApp.pages = newPages();
    rerender(<component.E2EAccount />);
    await act(async () => undefined);
    expect(calls).toHaveLength(4);
  });

  it('reads the location for a fajr boundary, as the schedule screen does', async () => {
    mockLaunch.args = { e2eAccount: 'email=f@example.com&boundary=fajr' };
    account.readLaunchAccount();
    Object.assign(mockApp, { isAuthenticated: true, user: {}, loading: false, pages: newPages() });
    const { rerender } = render(<component.E2EAccount />);
    await act(async () => undefined);
    mockApp.pages = newPages().map((p) => (p.pageNumber === 1 || p.pageNumber >= 582 ? { ...p, status: 'memorized' } : p));
    rerender(<component.E2EAccount />);
    await act(async () => undefined);
    expect(mockApp.createDefaultUser).toHaveBeenCalledWith(
      expect.objectContaining({ fajrBoundaryEnabled: true, locationCoords: { latitude: 41.88, longitude: -87.63 } }),
    );
  });
});
