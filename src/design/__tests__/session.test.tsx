import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, color }: { name: string; color: string }) => <Text testID={`icon-${name}`}>{color}</Text>,
  };
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
import { PagesSheet } from '../../components/revision/PagesSheet';
import { CarryOverSetting } from '../../components/CarryOverSetting';
import { getReadPalette } from '../../theme/readPalette';
import { getQuranData } from '../../lib/quranData';
import { DEFAULT_ACCENT, paletteDark, paletteLight, paletteV2 } from '../../theme/v2';

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
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
    expect(getReadPalette(false)).toMatchObject({
      pageBg: '#FFFFFF',
      textSecondary: paletteLight.secondary,
      divider: paletteLight.separator,
    });
    expect(getReadPalette(true)).toMatchObject({
      pageBg: '#000000',
      textSecondary: paletteDark.secondary,
      divider: paletteDark.separator,
    });
  });

  it('header buttons are bare icons; a page marked revised is the jade done check', async () => {
    const palette = getReadPalette(false);
    render(
      v2(
        <>
          <RoundButton icon="ellipsis-horizontal" label="Session menu" onPress={jest.fn()} palette={palette} />
          <RoundButton
            icon="checkmark-outline"
            label="Unmark current page"
            onPress={jest.fn()}
            palette={palette}
            active
          />
        </>,
      ),
    );
    await act(async () => {});
    expect(flat(screen.getByLabelText('Session menu').props.style).backgroundColor).toBeUndefined();
    expect(flat(screen.getByTestId('round-button-active').props.style).backgroundColor).toBe(
      paletteV2(false, DEFAULT_ACCENT).done,
    );
    expect(screen.getByTestId('icon-checkmark').props.children).toBe(paletteLight.onDone);
  });

  it('[SESS-1] the Pages sheet: page numbers alone, You are here in the accent, a row goes, a circle marks', async () => {
    const onJump = jest.fn();
    const onToggle = jest.fn();
    const onMarkAll = jest.fn();
    const { rerender } = render(
      v2(
        <PagesSheet
          visible
          onClose={jest.fn()}
          pages={[582, 583, 584]}
          done={new Set([582])}
          current={583}
          onJump={onJump}
          onToggle={onToggle}
          onMarkAll={onMarkAll}
          onUnmarkAll={jest.fn()}
        />,
      ),
    );
    await act(async () => {});
    expect(screen.getByText('1 of 3 revised')).toBeTruthy();
    expect(screen.getByText('Page 582')).toBeTruthy();
    // No ayah numbers: every row is its page number.
    expect(screen.queryByText(/An-Nazi|Al-Mutaffifin|\d+–\d+/)).toBeNull();
    const accent = paletteV2(false, DEFAULT_ACCENT);
    expect(flat(screen.getByTestId('session-pages-here').props.style).backgroundColor).toBe(accent.accentSubtle);
    expect(flat(screen.getByText('You are here').parent!.parent!.props.style).backgroundColor).toBe(accent.accentText);
    fireEvent.press(screen.getByLabelText('Go to page 584'));
    expect(onJump).toHaveBeenCalledWith(584);
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Mark page 584 as revised'));
    expect(onToggle).toHaveBeenCalledWith(584);
    fireEvent.press(screen.getByLabelText('Mark all revised'));
    expect(onMarkAll).toHaveBeenCalledTimes(1);
    rerender(
      v2(
        <PagesSheet
          visible
          onClose={jest.fn()}
          pages={[582, 583, 584]}
          done={new Set([582, 583, 584])}
          current={583}
          onJump={onJump}
          onToggle={onToggle}
          onMarkAll={onMarkAll}
          onUnmarkAll={jest.fn()}
        />,
      ),
    );
    await act(async () => {});
    expect(screen.getByLabelText('Unmark all')).toBeTruthy();
  });

  it('no help buttons: Keep daily amount says what it does under its label', async () => {
    const onChange = jest.fn();
    const { rerender } = render(v2(<CarryOverSetting mode="shift" onChange={onChange} />));
    await act(async () => {});
    expect(screen.queryByLabelText('What does Keep daily amount do?')).toBeNull();
    expect(screen.getByTestId('carry-over-explainer').props.children).toMatch(/today stays its usual size/);
    rerender(v2(<CarryOverSetting mode="add" onChange={onChange} />));
    expect(screen.getByTestId('carry-over-explainer').props.children).toMatch(/go on top of today/);
  });
});
