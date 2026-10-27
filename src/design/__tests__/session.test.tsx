import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import { DesignProvider } from '../DesignContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { RoundButton } from '../../components/reader/RoundButton';
import { BulkActionsModal } from '../../components/BulkActionsModal';
import { GuideSheet } from '../../components/v2/GuideSheet';
import { getReadPalette } from '../../theme/readPalette';
import { getQuranData } from '../../lib/quranData';
import { paletteDark, paletteLight } from '../../theme/v2';

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{ allowed: true, chosen: 'new' }}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);
const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

describe('the session and reader in the new design', () => {
  it('the page palette uses the new greys around the same white and black pages', () => {
    expect(getReadPalette(false, true)).toMatchObject({ pageBg: '#FFFFFF', textSecondary: paletteLight.secondary, divider: paletteLight.separator });
    expect(getReadPalette(true, true)).toMatchObject({ pageBg: '#000000', textSecondary: paletteDark.secondary, divider: paletteDark.separator });
    // Classic untouched.
    expect(getReadPalette(false)).toMatchObject({ bg: '#F2F2F7', textSecondary: '#3C3C43' });
  });

  it('header buttons are bare icons; a page marked revised is the jade done check', async () => {
    const palette = getReadPalette(false, true);
    render(
      v2(
        <>
          <RoundButton icon="ellipsis-horizontal" label="Session menu" onPress={jest.fn()} palette={palette} />
          <RoundButton icon="checkmark-outline" label="Unmark current page" onPress={jest.fn()} palette={palette} active />
        </>,
      ),
    );
    await act(async () => {});
    expect(flat(screen.getByLabelText('Session menu').props.style).backgroundColor).toBeUndefined();
    expect(flat(screen.getByTestId('round-button-active').props.style).backgroundColor).toBe(paletteLight.done);
    expect(screen.getByTestId('icon-checkmark').props.children).toBe(paletteLight.onDone);
  });

  it('“Manage pages”: a row per juz, its mark jade once all its pages are done', async () => {
    const onMarkJuzComplete = jest.fn();
    render(
      v2(
        <BulkActionsModal
          visible
          onClose={jest.fn()}
          pages={[
            { pageNumber: 582, isCompleted: true, weaknessRating: 4 },
            { pageNumber: 583, isCompleted: true, weaknessRating: 4 },
          ]}
          quranData={getQuranData()}
          onMarkAllComplete={jest.fn()}
          onMarkAllIncomplete={jest.fn()}
          onMarkJuzComplete={onMarkJuzComplete}
          onTogglePage={jest.fn()}
        />,
      ),
    );
    await act(async () => {});
    expect(screen.getByText('2 of 2 complete')).toBeTruthy();
    expect(screen.getByText('Unmark all')).toBeTruthy();
    expect(screen.getAllByTestId('mark-done', { includeHiddenElements: true })).toHaveLength(1);
    fireEvent.press(screen.getByText('Juz 30'));
    expect(onMarkJuzComplete).toHaveBeenCalledWith(30);
  });

  it('“How it works” is a sheet of steps with Got it', async () => {
    const onClose = jest.fn();
    render(v2(<GuideSheet visible onClose={onClose} title="How revision works" steps={[{ icon: 'book-outline', title: 'Swipe', body: 'Turn pages.' }]} />));
    await act(async () => {});
    expect(screen.getByText('How revision works')).toBeTruthy();
    fireEvent.press(screen.getByText('Got it'));
    expect(onClose).toHaveBeenCalled();
  });
});
