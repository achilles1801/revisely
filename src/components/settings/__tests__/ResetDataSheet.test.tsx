import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// The sheet's own reset is passed in; lib/testerReset isn't run here.
jest.mock('../../../lib/testerReset', () => ({ resetMyData: jest.fn(), showsResetMyData: () => true }));

import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { ResetDataSheet } from '../ResetDataSheet';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import { showsResetMyData } from '../../../lib/testerReset';

const palette = paletteV2(false, DEFAULT_ACCENT);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flat = (style: unknown): Record<string, any> => StyleSheet.flatten(style as never) ?? {};

async function open(reset: () => Promise<unknown>, onClose = jest.fn()) {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <ResetDataSheet visible onClose={onClose} reset={reset} />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
  return onClose;
}

const confirmButton = () => screen.getByTestId('reset-data-confirm');

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

describe('Reset my data (testers)', () => {
  it('the red button does nothing until RESET is typed', async () => {
    const reset = jest.fn(async () => ({}));
    await open(reset);
    expect(confirmButton().props.accessibilityState).toMatchObject({ disabled: true });
    for (const typed of ['', 'reset', 'RESE', 'RESET please']) {
      fireEvent.changeText(screen.getByTestId('reset-data-input'), typed);
      await act(async () => {
        fireEvent.press(confirmButton());
      });
    }
    expect(reset).not.toHaveBeenCalled();
    expect(flat(confirmButton().props.style).backgroundColor).toBe(palette.redFill);
  });

  it('typed RESET arms it; the reset runs once, then the sheet closes', async () => {
    let finish: () => void = () => undefined;
    const reset = jest.fn(() => new Promise<void>((r) => (finish = r)));
    const onClose = await open(reset);
    fireEvent.changeText(screen.getByTestId('reset-data-input'), 'RESET');
    expect(confirmButton().props.accessibilityState).toMatchObject({ disabled: false });
    await act(async () => {
      fireEvent.press(confirmButton());
    });
    // Busy: a second press and Cancel do nothing.
    expect(confirmButton().props.accessibilityState).toMatchObject({ busy: true });
    await act(async () => {
      fireEvent.press(confirmButton());
      fireEvent.press(screen.getByTestId('reset-data-cancel'));
    });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a refusal shows its reason, and the sheet stays to try again', async () => {
    const reset = jest.fn(async () => {
      throw new Error('Reset my data is for testers only.');
    });
    const onClose = await open(reset);
    fireEvent.changeText(screen.getByTestId('reset-data-input'), 'RESET');
    await act(async () => {
      fireEvent.press(confirmButton());
    });
    expect(screen.getByTestId('reset-data-error').props.children).toBe('Reset my data is for testers only.');
    expect(flat(screen.getByTestId('reset-data-error').props.style).color).toBe(palette.red);
    expect(onClose).not.toHaveBeenCalled();
    expect(confirmButton().props.accessibilityState).toMatchObject({ disabled: false, busy: false });
  });

  it('Cancel closes it when nothing is running', async () => {
    const onClose = await open(jest.fn(async () => ({})));
    fireEvent.press(screen.getByTestId('reset-data-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('who sees it', () => {
  it('a previewTester account only (as the server requires)', () => {
    const { showsResetMyData: real } = jest.requireActual('../../../lib/testerReset');
    expect(real({ previewTester: true })).toBe(true);
    expect(real({ previewTester: false })).toBe(false);
    expect(real({})).toBe(false);
    expect(real(null)).toBe(false);
    expect(showsResetMyData).toBeDefined();
  });
});
