import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
let mockOffer = { visible: true, updateId: 'u1' };
const mockApply = jest.fn(() => Promise.resolve(true));
const mockPostpone = jest.fn(() => {
  mockOffer = { ...mockOffer, visible: false };
});
jest.mock('../../../lib/updates/ota', () => ({
  useUpdateOffer: () => mockOffer,
  applyUpdate: () => mockApply(),
  postponeUpdateOffer: () => mockPostpone(),
}));
let mockBusy: string[] = [];
jest.mock('../../../lib/updates/busy', () => ({ useBusyReasons: () => mockBusy }));

import { UPDATE_OFFER_DELAY_MS, UpdateReadySheet } from '../UpdateReadySheet';

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockOffer = { visible: true, updateId: 'u1' };
  mockBusy = [];
});
afterEach(() => {
  jest.useRealTimers();
});

const settle = () =>
  act(() => {
    jest.advanceTimersByTime(UPDATE_OFFER_DELAY_MS);
  });

describe('<UpdateReadySheet />', () => {
  it('opens by itself once an update has downloaded, shortly after the screen settles', () => {
    render(<UpdateReadySheet />);
    expect(screen.queryByText('A new update is ready')).toBeNull();
    settle();
    expect(screen.getByText('A new update is ready')).toBeTruthy();
  });

  it('Update now restarts into it', () => {
    render(<UpdateReadySheet />);
    settle();
    fireEvent.press(screen.getByTestId('update-ready-now'));
    expect(mockApply).toHaveBeenCalledTimes(1);
  });

  it('Later closes it until the next cold start', () => {
    const { rerender } = render(<UpdateReadySheet />);
    settle();
    fireEvent.press(screen.getByTestId('update-ready-later'));
    expect(mockPostpone).toHaveBeenCalledTimes(1);
    expect(mockApply).not.toHaveBeenCalled();
    rerender(<UpdateReadySheet />);
    settle();
    expect(screen.queryByText('A new update is ready')).toBeNull();
  });

  it('nothing without an update waiting', () => {
    mockOffer = { visible: false, updateId: null } as never;
    render(<UpdateReadySheet />);
    settle();
    expect(screen.queryByText('A new update is ready')).toBeNull();
  });

  it.each([['recording'], ['recitation'], ['timer'], ['screen']])(
    'waits while busy (%s), and opens right after it ends',
    (reason) => {
      mockBusy = [reason];
      const { rerender } = render(<UpdateReadySheet />);
      settle();
      expect(screen.queryByText('A new update is ready')).toBeNull();
      mockBusy = [];
      rerender(<UpdateReadySheet />);
      settle();
      expect(screen.getByText('A new update is ready')).toBeTruthy();
    },
  );
});
