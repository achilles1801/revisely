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
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: ({ colors }: { colors: string[] }) => <View testID="progress-gradient" accessibilityHint={colors.join(',')} />,
  };
});
jest.mock('../MushafPager', () => {
  const { View } = require('react-native');
  return { MushafPager: () => <View testID="mushaf" /> };
});

const mockApp: any = {};
jest.mock('../../context/AppContext', () => ({ useApp: () => mockApp }));

import { EditSessionModal } from '../EditSessionModal';
import { WeaknessModal } from '../WeaknessRating';
import { ProgressBar } from '../ProgressBar';
import { strengthTone } from '../insights/strength';
import { DesignProvider } from '../../design/DesignContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { getQuranData } from '../../lib/quranData';
import { getReadPalette } from '../../theme/readPalette';
import { ACCENTS, DEFAULT_ACCENT, paletteV2 } from '../../theme/v2';
import type { RevisionLog } from '../../types';

const palette = paletteV2(false, DEFAULT_ACCENT);
const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  mockApp.user = { id: 'u1', smartTrackingEnabled: true };
  mockApp.pages = [];
  mockApp.updatePages = jest.fn(async () => undefined);
});

describe('strength in the new design', () => {
  it('weak is red, moderate grey, strong green, for every accent and mode', () => {
    for (const accent of ACCENTS) {
      for (const dark of [false, true]) {
        const p = paletteV2(dark, accent);
        expect([1, 2].map((r) => strengthTone(r, p))).toEqual([p.red, p.red]);
        expect(strengthTone(3, p)).toBe(p.secondary);
        expect([4, 5].map((r) => strengthTone(r, p))).toEqual([p.good, p.good]);
      }
    }
  });

  it('the rating sheet dots use the same colours', async () => {
    render(v2(<WeaknessModal pageNumber={1} surahName="Al-Fatihah" onClose={jest.fn()} />));
    await act(async () => {});
    expect(flat(screen.getByTestId('rating-dot-1').props.style).backgroundColor).toBe(palette.red);
    expect(flat(screen.getByTestId('rating-dot-3').props.style).backgroundColor).toBe(palette.secondary);
    expect(flat(screen.getByTestId('rating-dot-5').props.style).backgroundColor).toBe(palette.good);
  });
});

describe('a progress bar in the new design', () => {
  it('a separator-grey track and the accent’s progress fill, start to end', async () => {
    render(v2(<ProgressBar progress={40} showLabel testID="bar" />));
    await act(async () => {});
    expect(screen.getByTestId('bar').props.accessibilityValue).toMatchObject({ now: 40 });
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByTestId('progress-gradient').props.accessibilityHint).toBe(palette.progress.join(','));
    expect(flat(screen.getByTestId('bar-track').props.style).backgroundColor).toBe(palette.separator);
    expect(screen.getByTestId('bar-fill')).toBeTruthy();
  });
});

describe('editing a session in the new design', () => {
  const log: RevisionLog = {
    id: 'log-1',
    date: '2026-10-20',
    pagesRevised: [1],
    pagesSkipped: [2],
    weaknessUpdates: [],
    durationMinutes: null,
  } as RevisionLog;

  it('the session’s bare header icons on its page colours; marking is the "done" check', async () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(
      v2(
        <EditSessionModal
          visible
          onClose={onClose}
          log={log}
          quranData={getQuranData()}
          sessionPages={[1, 2]}
          onSave={onSave}
          onDelete={jest.fn()}
        />,
      ),
    );
    await act(async () => {});
    const read = getReadPalette(false);
    expect(flat(screen.getByTestId('edit-session').props.style).backgroundColor).toBe(read.pageBg);
    // Page 1 was revised: the done check.
    expect(flat(screen.getByTestId('round-button-active').props.style).backgroundColor).toBe(palette.done);
    expect(flat(screen.getByLabelText('Session menu').props.style).backgroundColor).toBeUndefined();
    expect(flat(screen.getByText('Juz 1 · Hizb 1').props.style)).toMatchObject({ fontSize: 13, color: read.textSecondary });
    expect(flat(screen.getByTestId('edit-session-page').props.style).color).toBe(read.textPrimary);

    fireEvent.press(screen.getByLabelText('Unmark current page'));
    expect(screen.queryByTestId('round-button-active')).toBeNull();
    fireEvent.press(screen.getByLabelText('Close and save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ pagesRevised: [], pagesSkipped: [1, 2] }));
    expect(onClose).toHaveBeenCalled();
  });

  it('its menu is the new design’s menu', async () => {
    render(
      v2(
        <EditSessionModal
          visible
          onClose={jest.fn()}
          log={log}
          quranData={getQuranData()}
          sessionPages={[1, 2]}
          onSave={jest.fn()}
          onDelete={jest.fn()}
        />,
      ),
    );
    await act(async () => {});
    fireEvent.press(screen.getByLabelText('Session menu'));
    expect(screen.getByText('Rate strength for this page')).toBeTruthy();
    expect(flat(screen.getByText('Delete session').props.style).color).toBe(palette.red);
  });
});
