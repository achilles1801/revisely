import React from 'react';
import { Linking, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Shared values that last across renders, as on a device.
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const { useRef } = require('react');
  return {
    ...mock,
    useSharedValue: (init: unknown) => {
      const ref = useRef(null);
      if (!ref.current) ref.current = mock.useSharedValue(init);
      return ref.current;
    },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockImpact = jest.fn(async () => undefined);
jest.mock('expo-haptics', () => ({
  impactAsync: () => mockImpact(),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));

// The phone: a permission, a position (London) and a compass that the test turns.
type Perm = { granted: boolean; canAskAgain: boolean; status: string };
const mockLoc = {
  perm: { granted: true, canAskAgain: true, status: 'granted' } as Perm,
  afterRequest: { granted: true, canAskAgain: true, status: 'granted' } as Perm,
  coords: { latitude: 51.5074, longitude: -0.1278 } as { latitude: number; longitude: number } | null,
  headingFails: false,
  onHeading: null as null | ((h: { trueHeading: number; magHeading: number; accuracy: number }) => void),
  onHeadingError: null as null | ((e: unknown) => void),
  remove: jest.fn(),
};
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => mockLoc.perm),
  requestForegroundPermissionsAsync: jest.fn(async () => {
    mockLoc.perm = mockLoc.afterRequest;
    return mockLoc.afterRequest;
  }),
  getLastKnownPositionAsync: jest.fn(async () => (mockLoc.coords ? { coords: mockLoc.coords } : null)),
  getCurrentPositionAsync: jest.fn(async () => {
    if (!mockLoc.coords) throw new Error('no fix');
    return { coords: mockLoc.coords };
  }),
  watchHeadingAsync: jest.fn(async (cb: never, onError: never) => {
    mockLoc.onHeading = cb;
    mockLoc.onHeadingError = onError;
    if (mockLoc.headingFails) throw new Error('Heading unavailable');
    return { remove: mockLoc.remove };
  }),
}));

import * as Location from 'expo-location';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { TopBar } from '../../v2/TopBar';
import { qiblaView, QiblaSheet } from '../QiblaSheet';

const wrap = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

async function open() {
  const onClose = jest.fn();
  const view = (visible: boolean) => wrap(<QiblaSheet visible={visible} onClose={onClose} />);
  render(view(true));
  await act(async () => {});
  await act(async () => {});
  return { onClose, rerender: (visible: boolean) => screen.rerender(view(visible)) };
}

const turnTo = (trueHeading: number, accuracy = 3) =>
  act(() => mockLoc.onHeading?.({ trueHeading, magHeading: trueHeading, accuracy }));
const title = () => screen.getByTestId('qibla-title').props.children;
// The dial is hidden from VoiceOver (the title and lines say it all).
const H = { includeHiddenElements: true } as const;

beforeEach(async () => {
  jest.clearAllMocks();
  mockLoc.perm = { granted: true, canAskAgain: true, status: 'granted' };
  mockLoc.afterRequest = { granted: true, canAskAgain: true, status: 'granted' };
  mockLoc.coords = { latitude: 51.5074, longitude: -0.1278 };
  mockLoc.headingFails = false;
  mockLoc.onHeading = null;
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

describe('the Qibla sheet', () => {
  it('not asked yet: why, then Allow location; allowed, it finds the Qibla', async () => {
    mockLoc.perm = { granted: false, canAskAgain: true, status: 'undetermined' };
    await open();
    expect(screen.getByTestId('qibla-permission')).toBeTruthy();
    expect(title()).toBe('Allow location to find the Qibla');
    expect(screen.getByText(/Your location stays on this phone/)).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
    // No compass yet.
    expect(Location.watchHeadingAsync).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByTestId('qibla-allow')));
    await act(async () => {});
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
    // Located, the compass not read yet: the bearing as text.
    expect(title()).toBe('119° from north');
    expect(screen.getByText('London, United Kingdom')).toBeTruthy();
    expect(Location.watchHeadingAsync).toHaveBeenCalled();
  });

  it('refused, and iOS won’t ask again: Open Settings', async () => {
    mockLoc.perm = { granted: false, canAskAgain: false, status: 'denied' };
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
    await open();
    expect(title()).toBe('Location is off for Revisely');
    fireEvent.press(screen.getByTestId('qibla-settings'));
    expect(spy).toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('turning: which way and how far, from true north; facing it: one light tap, held until past 5°', async () => {
    await open();
    turnTo(85);
    expect(title()).toBe('Turn right 34°');
    expect(screen.getByText('119° from north · 4,794 km to Makkah')).toBeTruthy();
    expect(screen.getByTestId('qibla-dial-turn', H)).toBeTruthy();
    expect(mockImpact).not.toHaveBeenCalled();
    // Readings are smoothed (a phone sends dozens a second): a few to settle.
    for (let i = 0; i < 15; i++) turnTo(117.6);
    expect(title()).toBe('Facing the Qibla');
    expect(screen.getByTestId('qibla-dial-aligned', H)).toBeTruthy();
    expect(screen.getByTestId('qibla-glow', H)).toBeTruthy();
    expect(mockImpact).toHaveBeenCalledTimes(1);
    // Within 5°: still facing it, no second tap.
    for (let i = 0; i < 15; i++) turnTo(122.5);
    expect(title()).toBe('Facing the Qibla');
    expect(mockImpact).toHaveBeenCalledTimes(1);
    // Past 5°: turning again; back within 3°: a second tap.
    for (let i = 0; i < 15; i++) turnTo(130);
    expect(title()).toMatch(/^Turn left/);
    for (let i = 0; i < 15; i++) turnTo(119);
    expect(title()).toBe('Facing the Qibla');
    expect(mockImpact).toHaveBeenCalledTimes(2);
  });

  it('an unsure compass never says “Facing the Qibla”', async () => {
    await open();
    turnTo(119, 1);
    expect(title()).not.toBe('Facing the Qibla');
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it('inaccurate for over a second: Calibrate your compass, with the figure 8; accurate again, back to turning', async () => {
    await open();
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    turnTo(85, 0);
    expect(screen.queryByText('Calibrate your compass')).toBeNull();
    now.mockReturnValue(2_200);
    turnTo(85, 0);
    expect(title()).toBe('Calibrate your compass');
    expect(screen.getByTestId('qibla-figure-eight', H)).toBeTruthy();
    turnTo(85, 3);
    expect(title()).toBe('Turn right 34°');
    now.mockRestore();
  });

  it('no compass: the bearing as text, north up, no needle', async () => {
    mockLoc.headingFails = true;
    await open();
    expect(title()).toBe('119° from north');
    expect(screen.getByTestId('qibla-dial-static', H)).toBeTruthy();
    expect(screen.queryByTestId('qibla-needle', H)).toBeNull();
  });

  it('no true heading yet (−1): not a magnetic guess; the bearing, finding north', async () => {
    await open();
    turnTo(-1);
    expect(title()).toBe('119° from north');
    expect(screen.getByText(/Finding north/)).toBeTruthy();
  });

  it('at the Kaaba: no direction to give', async () => {
    mockLoc.coords = { latitude: 21.4225, longitude: 39.8262 };
    await open();
    turnTo(200);
    expect(title()).toBe("You're at the Kaaba");
    expect(screen.queryByTestId('qibla-kaaba', H)).toBeNull();
  });

  it('no position at all: says so, and tries again', async () => {
    mockLoc.coords = null;
    await open();
    expect(title()).toBe("Couldn't find where you are");
    mockLoc.coords = { latitude: 51.5074, longitude: -0.1278 };
    await act(async () => fireEvent.press(screen.getByTestId('qibla-retry')));
    await act(async () => {});
    expect(title()).toBe('119° from north');
  });

  it('closed, the compass is let go (and nothing reads it while closed)', async () => {
    const { rerender } = await open();
    turnTo(85);
    expect(mockLoc.remove).not.toHaveBeenCalled();
    rerender(false);
    await act(async () => {});
    expect(mockLoc.remove).toHaveBeenCalled();
  });

  it('Done closes it', async () => {
    const { onClose } = await open();
    fireEvent.press(screen.getByTestId('qibla-done'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('qiblaView', () => {
  const base = {
    status: 'ready' as const,
    bearing: 119,
    distanceKm: 4794,
    place: 'London, United Kingdom',
    atKaaba: false,
    calibrating: false,
  };
  it('picks the state the mocks draw', () => {
    expect(qiblaView({ ...base, heading: { kind: 'live', heading: 85, accuracy: 3 } }, false).kind).toBe('turn');
    expect(qiblaView({ ...base, heading: { kind: 'live', heading: 118, accuracy: 3 } }, true).kind).toBe('aligned');
    expect(qiblaView({ ...base, calibrating: true, heading: { kind: 'live', heading: 40, accuracy: 0 } }, false).kind).toBe(
      'calibrate',
    );
    expect(qiblaView({ ...base, heading: { kind: 'unavailable' } }, false).kind).toBe('static');
    expect(qiblaView({ ...base, status: 'needs-permission', heading: { kind: 'waiting' } }, false).kind).toBe('permission');
  });
});

describe('Home’s top bar with three icons', () => {
  it('both sides widen together, so the middle stays centred', async () => {
    render(wrap(<TopBar center={null} left={null} right={null} sideWidth={120} />));
    await act(async () => {});
    type Node = { type: unknown; props: { style?: unknown } };
    const sides = screen.UNSAFE_root.findAll(
      (n: Node) =>
        n.type === 'View' && (StyleSheet.flatten(n.props.style as never) as { width?: number } | undefined)?.width === 120,
    );
    expect(sides.length).toBe(2);
  });
});
