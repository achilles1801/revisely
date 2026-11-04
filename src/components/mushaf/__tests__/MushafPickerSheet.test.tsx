import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
let mockOthers: { edition: string; pages: number; bytes: number }[] = [];
const mockRemoveOther = jest.fn();
jest.mock('../../../lib/mushafOffline', () => ({
  otherEditionsOnPhone: () => mockOthers,
  removeOtherEditionPages: (e: string) => mockRemoveOther(e),
}));
let mockStatus = { phase: 'complete', pages: 604, total: 604, bytes: 1, totalBytes: 1, textReady: true, prefs: { auto: true, cellular: false } };
jest.mock('../../../lib/mushafOfflineUi', () => ({
  ...jest.requireActual('../../../lib/mushafOfflineUi'),
  useMushafOffline: () => mockStatus,
}));
jest.mock('../../../lib/pageCache', () => {
  const sizes = require('../../../data/mushafSizes.json');
  return { pageSizeTable: (e: string) => (e === 'madani1441' ? sizes['1441/w1440'] : sizes.full) };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MushafPickerSheet } from '../MushafPickerSheet';
import { __resetMushafEditionForTests, getMushafEdition } from '../../../lib/mushafEdition';

beforeEach(async () => {
  jest.clearAllMocks();
  __resetMushafEditionForTests();
  await AsyncStorage.clear();
  mockOthers = [];
  mockStatus = { ...mockStatus, phase: 'complete', pages: 604 };
});

describe('<MushafPickerSheet />', () => {
  it('lists both prints, the chosen one checked, with what is on the phone and the credits', async () => {
    render(<MushafPickerSheet visible onClose={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('mushaf-edition-madani1405').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('mushaf-edition-madani1441').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByText('On this phone')).toBeTruthy();
    expect(screen.getByTestId('mushaf-edition-madani1441').props.accessibilityHint).toBe('153\u00A0MB to download');
    expect(screen.getByText(/Page numbers are the same in both/)).toBeTruthy();
    expect(screen.getByTestId('mushaf-credit-madani1441')).toHaveTextContent(/King Fahd Glorious Qur.an Printing Complex/);
    expect(screen.getByTestId('mushaf-credit-madani1405')).toHaveTextContent(/quran.com-images/);
  });

  it('choosing a print keeps it on the phone', async () => {
    render(<MushafPickerSheet visible onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('mushaf-edition-madani1441'));
    });
    expect(getMushafEdition()).toBe('madani1441');
    expect(await AsyncStorage.getItem('@revisely_mushaf_edition:v1')).toBe('madani1441');
    expect(screen.getByTestId('mushaf-edition-madani1441').props.accessibilityState).toEqual({ selected: true });
  });

  it('offers to remove the other print’s pages, after asking', async () => {
    mockOthers = [{ edition: 'madani1405', pages: 604, bytes: 247_000_000 }];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(<MushafPickerSheet visible onClose={jest.fn()} />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('mushaf-remove-madani1405'));
    expect(alert).toHaveBeenCalledWith('Remove Madani 1405?', expect.stringContaining('247\u00A0MB'), expect.any(Array));
    const remove = (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === 'Remove');
    act(() => remove?.onPress?.());
    expect(mockRemoveOther).toHaveBeenCalledWith('madani1405');
  });
});
