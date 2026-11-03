import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
let mockBanner = { visible: true, updateId: 'u1' };
const mockApply = jest.fn(() => Promise.resolve(true));
const mockDismiss = jest.fn();
jest.mock('../../../lib/updates/ota', () => ({
  useUpdateBanner: () => mockBanner,
  applyUpdate: () => mockApply(),
  dismissBanner: () => mockDismiss(),
}));
let mockBusy: string[] = [];
jest.mock('../../../lib/updates/busy', () => ({ useBusyReasons: () => mockBusy }));

import { UpdateBanner } from '../UpdateBanner';

beforeEach(() => {
  jest.clearAllMocks();
  mockBanner = { visible: true, updateId: 'u1' };
  mockBusy = [];
});

describe('<UpdateBanner />', () => {
  it('nothing unless an update has waited since an earlier visit', () => {
    mockBanner = { visible: false, updateId: 'u1' };
    render(<UpdateBanner />);
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });

  it('"Update ready · Restart": Restart restarts into it', () => {
    render(<UpdateBanner />);
    expect(screen.getByText('Update ready')).toBeTruthy();
    fireEvent.press(screen.getByTestId('update-banner-restart'));
    expect(mockApply).toHaveBeenCalledTimes(1);
  });

  it('✕ dismisses it', () => {
    render(<UpdateBanner />);
    fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it.each([['recording'], ['recitation'], ['timer']])('no Restart while busy (%s): it says when it applies', (reason) => {
    mockBusy = [reason];
    render(<UpdateBanner />);
    expect(screen.queryByTestId('update-banner-restart')).toBeNull();
    expect(screen.getByText('Update ready · applies next time you open Revisely')).toBeTruthy();
    expect(screen.getByLabelText('Dismiss')).toBeTruthy();
  });

  it('being on Home is no reason to hide Restart', () => {
    mockBusy = ['screen'];
    render(<UpdateBanner />);
    expect(screen.getByTestId('update-banner-restart')).toBeTruthy();
  });
});
