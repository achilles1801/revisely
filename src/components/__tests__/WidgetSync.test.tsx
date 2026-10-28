import React from 'react';
import { AppState, Linking } from 'react-native';
import { act, render } from '@testing-library/react-native';

const mockWrite = jest.fn((_s: any) => true);
jest.mock('../../lib/widgets/storage', () => ({ writeWidgetSnapshot: (s: any) => mockWrite(s) }));
const mockBuild = jest.fn((input: any) => ({ built: input }));
jest.mock('../../lib/widgets/snapshot', () => ({ buildWidgetSnapshot: (i: any) => mockBuild(i) }));
jest.mock('../../lib/quranData', () => ({ getQuranData: () => [] }));
let mockPosition: any = null;
jest.mock('../../lib/widgets/position', () => ({ lastKnownPosition: () => Promise.resolve(mockPosition) }));
const mockRequestQibla = jest.fn();
jest.mock('../../lib/widgets/links', () => ({
  ...jest.requireActual('../../lib/widgets/links'),
  requestQiblaSheet: () => mockRequestQibla(),
}));
let mockDay = '2026-10-27';
jest.mock('../../hooks/useRevisionDay', () => ({ useRevisionDay: () => ({ day: mockDay, date: new Date() }) }));

let mockApp: any;
jest.mock('../../context/AppContext', () => ({ useApp: () => mockApp }));
let mockAuth: any;
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }));
let mockAccent = 'indigo';
jest.mock('../../design/DesignContext', () => ({ useDesign: () => ({ accent: mockAccent }) }));

const mockNavigate = jest.fn();
let mockNavReady = true;
jest.mock('../../navigation/navigationRef', () => ({
  navigationRef: { isReady: () => mockNavReady, navigate: (...a: unknown[]) => mockNavigate(...a) },
}));

import { WidgetSync } from '../WidgetSync';

const flush = () => act(async () => {});
let appStateListener: ((s: string) => void) | null = null;
let urlListener: ((e: { url: string }) => void) | null = null;
let initialUrl: string | null = null;

beforeEach(() => {
  mockWrite.mockClear();
  mockBuild.mockClear();
  mockNavigate.mockClear();
  mockNavReady = true;
  mockPosition = null;
  mockRequestQibla.mockClear();
  mockDay = '2026-10-27';
  mockAccent = 'indigo';
  initialUrl = null;
  mockApp = { user: { id: 'u1' }, pages: [], logs: [], loading: false, onboardingComplete: true };
  mockAuth = { firebaseUser: { uid: 'u1' }, isLoading: false };
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t: any, l: any) => {
    appStateListener = l;
    return { remove: () => (appStateListener = null) } as any;
  });
  jest.spyOn(Linking, 'getInitialURL').mockImplementation(() => Promise.resolve(initialUrl));
  jest.spyOn(Linking, 'addEventListener').mockImplementation((_t: any, l: any) => {
    urlListener = l;
    return { remove: () => (urlListener = null) } as any;
  });
});

afterEach(() => jest.restoreAllMocks());

const lastInput = () => mockBuild.mock.calls[mockBuild.mock.calls.length - 1][0];

describe('<WidgetSync />', () => {
  it("writes the signed-in account's snapshot once it has loaded", async () => {
    mockApp = { ...mockApp, loading: true };
    const view = render(<WidgetSync />);
    await flush();
    expect(mockWrite).not.toHaveBeenCalled();
    mockApp = { ...mockApp, loading: false };
    view.rerender(<WidgetSync />);
    await flush();
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(lastInput()).toMatchObject({ signedIn: true, user: { id: 'u1' }, onboardingComplete: true, accent: 'indigo' });
  });

  it('not during sign-up, when the user is still a placeholder for another id', async () => {
    mockApp = { ...mockApp, user: { id: 'placeholder' } };
    render(<WidgetSync />);
    await flush();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('signed out: a signed-out snapshot', async () => {
    mockAuth = { firebaseUser: null, isLoading: false };
    mockApp = { ...mockApp, user: null };
    render(<WidgetSync />);
    await flush();
    expect(lastInput()).toMatchObject({ signedIn: false, user: null });
  });

  it('again when sessions, pages, the accent or the revision day change, and on coming back', async () => {
    const view = render(<WidgetSync />);
    await flush();
    const writes = () => mockWrite.mock.calls.length;
    const before = writes();

    mockApp = { ...mockApp, logs: [{ id: 'l1', date: '2026-10-27', pagesRevised: [1] }] };
    view.rerender(<WidgetSync />);
    await flush();
    expect(writes()).toBe(before + 1);

    mockAccent = 'jade';
    view.rerender(<WidgetSync />);
    await flush();
    expect(lastInput().accent).toBe('jade');
    expect(writes()).toBe(before + 2);

    mockDay = '2026-10-28';
    view.rerender(<WidgetSync />);
    await flush();
    expect(writes()).toBe(before + 3);

    act(() => appStateListener?.('background'));
    expect(writes()).toBe(before + 3);
    act(() => appStateListener?.('active'));
    await flush();
    expect(writes()).toBe(before + 4);
  });

  it('a link that started the app opens once the main screens are up', async () => {
    initialUrl = 'revisely://today';
    mockApp = { ...mockApp, loading: true };
    const view = render(<WidgetSync />);
    await flush();
    expect(mockNavigate).not.toHaveBeenCalled();
    mockApp = { ...mockApp, loading: false };
    view.rerender(<WidgetSync />);
    await flush();
    expect(mockNavigate).toHaveBeenCalledWith('Home', { screen: 'ActiveRevision', initial: false });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('links while running: Home, and the reader at a page; other URLs are ignored', async () => {
    render(<WidgetSync />);
    await flush();
    act(() => urlListener?.({ url: 'revisely://home' }));
    await flush();
    expect(mockNavigate).toHaveBeenLastCalledWith('Home', { screen: 'Dashboard' });
    act(() => urlListener?.({ url: 'revisely://read?page=596' }));
    await flush();
    expect(mockNavigate).toHaveBeenLastCalledWith('Read', {
      screen: 'QuranReader',
      params: { pageNumber: 596 },
      initial: false,
    });
    act(() => urlListener?.({ url: 'com.googleusercontent.apps.1:/oauth2redirect' }));
    await flush();
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });

  it('waits for navigation to be ready, and for onboarding to finish', async () => {
    jest.useFakeTimers();
    try {
      mockApp = { ...mockApp, onboardingComplete: false };
      mockNavReady = false;
      const view = render(<WidgetSync />);
      await flush();
      act(() => urlListener?.({ url: 'revisely://today' }));
      mockApp = { ...mockApp, onboardingComplete: true };
      view.rerender(<WidgetSync />);
      await flush();
      expect(mockNavigate).not.toHaveBeenCalled();
      mockNavReady = true;
      act(() => jest.advanceTimersByTime(150));
      expect(mockNavigate).toHaveBeenCalledWith('Home', { screen: 'ActiveRevision', initial: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it("the Qibla from the phone's last known position, else the account's Fajr location", async () => {
    mockApp = { ...mockApp, user: { id: 'u1', locationCoords: { latitude: 51.5, longitude: -0.12 } } };
    const view = render(<WidgetSync />);
    await flush();
    expect(lastInput().qiblaFrom).toEqual({ latitude: 51.5, longitude: -0.12 });
    mockPosition = { latitude: 43.65, longitude: -79.38 };
    act(() => appStateListener?.('active'));
    await flush();
    expect(lastInput().qiblaFrom).toEqual({ latitude: 43.65, longitude: -79.38 });
    view.unmount();
  });

  it('the Qibla link: Home, and asks for the Qibla sheet', async () => {
    render(<WidgetSync />);
    await flush();
    act(() => urlListener?.({ url: 'revisely://qibla' }));
    await flush();
    expect(mockNavigate).toHaveBeenLastCalledWith('Home', { screen: 'Dashboard' });
    expect(mockRequestQibla).toHaveBeenCalledTimes(1);
  });
});
