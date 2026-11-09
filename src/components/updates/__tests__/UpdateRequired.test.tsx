import React from 'react';
import { BackHandler } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
let mockRequired: { installed: string; minimum: string } | null = { installed: '1.0.3', minimum: '1.0.4' };
const mockOpenStore = jest.fn(() => Promise.resolve());
jest.mock('../../../lib/updates/storeUpdates', () => ({
  useStoreDecision: () => ({ required: mockRequired, offer: null }),
  openStore: () => mockOpenStore(),
  storeName: () => 'the App Store',
}));
let mockBusy: string[] = [];
jest.mock('../../../lib/updates/busy', () => ({ useBusyReasons: () => mockBusy }));

import { UpdateRequiredGate } from '../UpdateRequired';

beforeEach(() => {
  jest.clearAllMocks();
  mockRequired = { installed: '1.0.3', minimum: '1.0.4' };
  mockBusy = [];
});

describe('<UpdateRequiredGate />', () => {
  it('covers the app with no way past it but Update', () => {
    render(<UpdateRequiredGate />);
    expect(screen.getByText('Update required')).toBeTruthy();
    expect(screen.getByText(/Get version 1\.0\.4 or later from the App Store/)).toBeTruthy();
    expect(screen.getByText('Installed: 1.0.3')).toBeTruthy();
    expect(screen.queryByText(/Not now|Later|Cancel/)).toBeNull();
    fireEvent.press(screen.getByTestId('update-required-open'));
    expect(mockOpenStore).toHaveBeenCalledTimes(1);
  });

  it("swallows Android's back button", () => {
    const add = jest.spyOn(BackHandler, 'addEventListener');
    render(<UpdateRequiredGate />);
    const handler = add.mock.calls[0][1] as () => boolean;
    expect(handler()).toBe(true);
  });

  it('nothing when not required', () => {
    mockRequired = null;
    render(<UpdateRequiredGate />);
    expect(screen.queryByTestId('update-required')).toBeNull();
  });

  it.each([['recording'], ['recitation']])('waits for a %s to stop', (reason) => {
    mockBusy = [reason];
    render(<UpdateRequiredGate />);
    expect(screen.queryByTestId('update-required')).toBeNull();
  });

  it('does not wait for a screen or a timer (they keep their state)', () => {
    mockBusy = ['screen', 'timer'];
    render(<UpdateRequiredGate />);
    expect(screen.getByTestId('update-required')).toBeTruthy();
  });
});
