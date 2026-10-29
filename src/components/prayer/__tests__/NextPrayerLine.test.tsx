import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight } = require('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteLight }) };
});

import { NextPrayerLine } from '../NextPrayerLine';
import { formatTime } from '../../../lib/prayer/times';
import type { PrayerTimesNow } from '../usePrayerTimes';

const now = new Date(2026, 9, 28, 12, 59);
const asr = new Date(now.getTime() + 72 * 60_000);
const times = { next: { name: 'asr', time: asr }, now } as unknown as PrayerTimesNow;

describe('<NextPrayerLine />', () => {
  it('"Asr 2:11 PM … in 1h 12m", the name in the accent, opens the sheet', () => {
    const onPress = jest.fn();
    render(<NextPrayerLine times={times} onPress={onPress} />);
    const line = screen.getByTestId('next-prayer-line');
    expect(line).toHaveTextContent(`Asr ${formatTime(asr)}in 1h 12m`);
    expect(line.props.accessibilityLabel).toBe(`Next prayer: Asr at ${formatTime(asr)}, in 1h 12m`);
    fireEvent.press(line);
    expect(onPress).toHaveBeenCalled();
  });

  it('nothing opaque and no hairline (Home’s glow carries on behind it)', () => {
    render(<NextPrayerLine times={times} onPress={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByTestId('next-prayer-line').props.style) as Record<string, unknown>;
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderBottomWidth ?? 0).toBe(0);
  });

  it('no next prayer: nothing', () => {
    render(<NextPrayerLine times={{ next: null, now } as unknown as PrayerTimesNow} onPress={jest.fn()} />);
    expect(screen.queryByTestId('next-prayer-line')).toBeNull();
  });
});
