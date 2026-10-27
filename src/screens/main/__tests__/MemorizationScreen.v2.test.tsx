import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name, color }: { name: string; color: string }) => <Text testID={`icon-${name}`}>{color}</Text> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
const mockApp: any = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));

import { touchHandlingAncestor } from '../../../../jest/scrollable';
import MemorizationScreen from '../MemorizationScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import type { User, UserPage } from '../../../types';

const palette = paletteV2(false, DEFAULT_ACCENT);
const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

const page = (pageNumber: number, memorized: boolean): UserPage => ({
  pageNumber,
  status: memorized ? 'memorized' : 'not_memorized',
  dateMemorized: memorized ? '2025-01-01T00:00:00.000Z' : null,
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  mockApp.user = { id: 'u1', memorizedSurahs: [1], customPlan: null } as unknown as User;
  // Al-Fatihah (page 1) memorized, Al-Baqarah's first page (2) not.
  mockApp.pages = [page(1, true), page(2, false), page(3, false)];
  mockApp.updatePages = jest.fn(async () => undefined);
  mockApp.saveUser = jest.fn(async () => undefined);
});

async function renderScreen() {
  render(v2(<MemorizationScreen />));
  await act(async () => {});
}

const dismissSheets = () => {
  // A sheet's onHidden runs once it has gone (iOS: onDismiss).
  const { Modal } = jest.requireActual('react-native');
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });
};

describe('Memorization in the new design', () => {
  it('a top bar, how much is memorized with its bar, flat rows; no glass, no help', async () => {
    await renderScreen();
    expect(screen.getByText('Memorization')).toBeTruthy();
    expect(screen.getByText('1 of 604 pages')).toBeTruthy();
    expect(screen.getByText('0 of 30 juz · 1 of 114 surahs')).toBeTruthy();
    expect(screen.getByTestId('memorization-progress')).toBeTruthy();
    expect(screen.getByTestId('memorization-list')).toBeTruthy();
    expect(screen.queryByTestId('icon-help')).toBeNull();
    expect(touchHandlingAncestor(screen.getByTestId('memorization-v2'))).toBeNull();
    // Lenses are pills.
    expect(screen.getByTestId('pill-chapter')).toBeTruthy();
    expect(screen.getByTestId('pill-hizb')).toBeTruthy();
  });

  it('a fully memorized surah wears the "done" mark; the others their number', async () => {
    await renderScreen();
    const fatihah = screen.getByTestId('surah-1');
    const hidden = { includeHiddenElements: true };
    expect(flat(within(fatihah).getByTestId('mark-done', hidden).props.style).backgroundColor).toBe(palette.done);
    const baqarah = screen.getByTestId('surah-2');
    expect(within(baqarah).queryByTestId('mark-done', hidden)).toBeNull();
    expect(within(baqarah).getByText('2', hidden)).toBeTruthy();
    expect(within(baqarah).getByText('Al-Baqarah')).toBeTruthy();
  });

  it('opening a surah shows its pages, memorized ones filled', async () => {
    await renderScreen();
    fireEvent.press(screen.getByTestId('surah-1'));
    expect(flat(screen.getByTestId('page-chip-1').props.style).backgroundColor).toBe(palette.done);
    fireEvent.press(screen.getByTestId('surah-2'));
    expect(flat(screen.getByTestId('page-chip-2').props.style).backgroundColor).toBe(palette.fill);
  });

  it('edit: checkboxes, a flat bar with Cancel and Save, then a sheet to confirm', async () => {
    await renderScreen();
    expect(screen.queryByTestId('surah-1-check')).toBeNull();
    fireEvent.press(screen.getByTestId('memorization-edit'));
    // Al-Fatihah's box is checked, in the primary fill.
    const check = screen.getByTestId('surah-1-check');
    expect(check.props.accessibilityState).toMatchObject({ checked: true });
    expect(flat(check.props.style).backgroundColor).toBe(palette.primary);
    expect(screen.getByText('No changes')).toBeTruthy();

    fireEvent.press(screen.getByTestId('surah-2'));
    fireEvent.press(screen.getByTestId('page-chip-2'));
    expect(screen.getByText('Save (1)')).toBeTruthy();
    // Al-Baqarah is now partly memorized.
    expect(screen.getByTestId('surah-2-check').props.accessibilityState).toMatchObject({ checked: 'mixed' });

    fireEvent.press(screen.getByTestId('memorization-save'));
    expect(screen.getByText('Save 1 change?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-save'));
    });
    expect(mockApp.updatePages).toHaveBeenCalledWith(expect.any(Array), [2]);
    expect(screen.queryByTestId('memorization-save')).toBeNull();
    expect(screen.getByTestId('memorization-edit')).toBeTruthy();
  });

  it('back with unsaved marks asks first; Discard drops them', async () => {
    await renderScreen();
    fireEvent.press(screen.getByTestId('memorization-edit'));
    fireEvent.press(screen.getByTestId('surah-2'));
    fireEvent.press(screen.getByTestId('page-chip-2'));
    fireEvent.press(screen.getByTestId('back'));
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(screen.getByTestId('memorization-confirm')).toBeTruthy();
    fireEvent.press(screen.getByTestId('confirm-discard'));
    expect(screen.queryByText('Save (1)')).toBeNull();
    expect(mockApp.updatePages).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('back'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('with a custom schedule, "Schedule needs review" follows once the save sheet has gone', async () => {
    mockApp.user = {
      id: 'u1',
      memorizedSurahs: [1],
      customPlan: { days: [[1]], cycleStartDate: '2026-10-01', direction: 'forward' },
    } as unknown as User;
    await renderScreen();
    fireEvent.press(screen.getByTestId('memorization-edit'));
    fireEvent.press(screen.getByTestId('surah-2'));
    fireEvent.press(screen.getByTestId('page-chip-2'));
    fireEvent.press(screen.getByTestId('memorization-save'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-save'));
    });
    expect(mockApp.saveUser).toHaveBeenCalled();
    expect(screen.queryByText('Schedule needs review')).toBeNull();
    dismissSheets();
    expect(screen.getByText('Schedule needs review')).toBeTruthy();
    fireEvent.press(screen.getByTestId('review-now'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PlanEdit');
  });
});
