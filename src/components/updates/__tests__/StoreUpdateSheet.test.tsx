import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
let mockFocused = true;
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));
let mockOffer: string | null = '1.0.4';
const mockMarkOffered = jest.fn((v: string) => {
  mockOffer = mockOffer === v ? null : mockOffer;
});
const mockOpenStore = jest.fn(() => Promise.resolve());
jest.mock('../../../lib/updates/storeUpdates', () => ({
  useStoreDecision: () => ({ required: null, offer: mockOffer }),
  markOffered: (v: string) => mockMarkOffered(v),
  openStore: () => mockOpenStore(),
  storeName: () => 'the App Store',
}));
let mockBusy: string[] = [];
jest.mock('../../../lib/updates/busy', () => ({ useBusyReasons: () => mockBusy }));

import { OFFER_DELAY_MS, StoreUpdateSheet } from '../StoreUpdateSheet';

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockFocused = true;
  mockOffer = '1.0.4';
  mockBusy = [];
});
afterEach(() => {
  jest.useRealTimers();
});

const settle = () =>
  act(() => {
    jest.advanceTimersByTime(OFFER_DELAY_MS);
  });

describe('<StoreUpdateSheet />', () => {
  it('offers the new version on Home, once (marked as offered when it shows)', () => {
    render(<StoreUpdateSheet />);
    expect(screen.queryByText('New version available')).toBeNull();
    settle();
    expect(screen.getByText('New version available')).toBeTruthy();
    expect(screen.getByText('Revisely 1.0.4 is on the App Store.')).toBeTruthy();
    expect(mockMarkOffered).toHaveBeenCalledWith('1.0.4');
  });

  it('Update opens the store', () => {
    render(<StoreUpdateSheet />);
    settle();
    fireEvent.press(screen.getByTestId('store-update-open'));
    expect(mockOpenStore).toHaveBeenCalledTimes(1);
  });

  it('Not now closes it', () => {
    render(<StoreUpdateSheet />);
    settle();
    fireEvent.press(screen.getByTestId('store-update-later'));
    expect(mockOpenStore).not.toHaveBeenCalled();
  });

  it('waits while Home is not in front, or while something goes on', () => {
    mockFocused = false;
    const { rerender } = render(<StoreUpdateSheet />);
    settle();
    expect(screen.queryByText('New version available')).toBeNull();
    mockFocused = true;
    mockBusy = ['recording'];
    rerender(<StoreUpdateSheet />);
    settle();
    expect(screen.queryByText('New version available')).toBeNull();
    expect(mockMarkOffered).not.toHaveBeenCalled();
    mockBusy = [];
    rerender(<StoreUpdateSheet />);
    settle();
    expect(screen.getByText('New version available')).toBeTruthy();
  });

  it('nothing to offer, nothing shown', () => {
    mockOffer = null;
    render(<StoreUpdateSheet />);
    settle();
    expect(screen.queryByText('New version available')).toBeNull();
  });
});
