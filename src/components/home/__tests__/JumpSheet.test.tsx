import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));

import { JumpSheet, targetLabel } from '../JumpSheet';
import type { User, UserPage } from '../../../types';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const mem = (nums: number[]): UserPage[] =>
  nums.map((pageNumber) => ({
    pageNumber,
    status: 'memorized',
    dateMemorized: null,
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  }));

const user = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  dailyPageCapacity: 10,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  customPlan: null,
  savedPlans: [],
  scheduleAnchorDate: '2026-10-15T12:00:00',
} as unknown as User;

// Juz 1, juz 30, and part of juz 12. Today (Oct 17, day 2) starts at page 21.
const MEMORIZED = mem([...range(1, 21), ...range(225, 235), ...range(582, 604)]);
const TODAY = new Date(2026, 9, 17);

function open(over: Partial<React.ComponentProps<typeof JumpSheet>> = {}) {
  const onJump = jest.fn();
  render(<JumpSheet visible onClose={jest.fn()} user={user} memorized={MEMORIZED} revisionDate={TODAY} onJump={onJump} {...over} />);
  return onJump;
}

describe('Jump to (sheet)', () => {
  it('lists only the juz with memorized pages, marks where today starts, and starts today at the one chosen', () => {
    const onJump = open();
    expect(screen.getByTestId('jump-juz-1')).toBeTruthy();
    expect(screen.getByTestId('jump-juz-30')).toBeTruthy();
    expect(screen.queryByTestId('jump-juz-2')).toBeNull();
    // Today starts at page 21, in juz 1.
    expect(within(screen.getByTestId('jump-juz-1')).getByText('Today')).toBeTruthy();
    expect(within(screen.getByTestId('jump-juz-30')).queryByText('Today')).toBeNull();
    // Part of a juz: how much of it.
    expect(within(screen.getByTestId('jump-juz-12')).getByText('p. 225–235 · 11 of 20 pages')).toBeTruthy();
    expect(within(screen.getByTestId('jump-juz-30')).getByText('p. 582–604')).toBeTruthy();
    // Nothing chosen yet: nothing to start.
    expect(screen.getByText('Choose where to start')).toBeTruthy();
    fireEvent.press(screen.getByTestId('jump-go'));
    expect(onJump).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('jump-juz-30'));
    expect(screen.getByTestId('jump-juz-30').props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(screen.getByText('Start today at Juz 30'));
    expect(onJump).toHaveBeenCalledWith({ kind: 'juz', juz: 30 });
  });

  it('by surah: the surahs with memorized pages', () => {
    const onJump = open();
    fireEvent.press(screen.getByText('Surah'));
    expect(screen.getByTestId('jump-surah-78')).toBeTruthy(); // An-Naba, juz 30
    expect(screen.queryByTestId('jump-surah-36')).toBeNull(); // Ya-Sin, not memorized
    fireEvent.press(screen.getByTestId('jump-surah-78'));
    fireEvent.press(screen.getByTestId('jump-go'));
    expect(onJump).toHaveBeenCalledWith({ kind: 'surah', surah: 78 });
  });

  it('by page: a wheel of the memorized pages, on today’s start', () => {
    const onJump = open();
    fireEvent.press(screen.getByText('Page'));
    expect(screen.getByTestId('jump-page-wheel')).toBeTruthy();
    expect(screen.getByTestId('jump-page-where')).toHaveTextContent('Juz 1 · Al-Baqarah · today starts here');
    fireEvent.press(screen.getByTestId('jump-go'));
    expect(onJump).toHaveBeenCalledWith({ kind: 'page', page: 21 });
  });

  it('juz a day: juz only, no tabs', () => {
    open({ user: { ...user, scheduleMode: 'juz', dailyJuzCount: 1 } as User });
    expect(screen.queryByTestId('jump-tabs')).toBeNull();
    expect(screen.getByTestId('jump-juz-list')).toBeTruthy();
  });

  it('a custom plan: only what it goes through', () => {
    const planned = {
      ...user,
      customPlan: { days: [range(582, 591), range(592, 601)], cycleStartDate: '2026-10-17', direction: 'forward' },
    } as unknown as User;
    open({ user: planned });
    expect(screen.getByTestId('jump-juz-30')).toBeTruthy();
    expect(screen.queryByTestId('jump-juz-1')).toBeNull();
  });

  it('names targets as the button and the toast do', () => {
    expect(targetLabel({ kind: 'juz', juz: 12 })).toBe('Juz 12');
    expect(targetLabel({ kind: 'page', page: 222 })).toBe('p. 222');
    expect(targetLabel({ kind: 'surah', surah: 18 })).toMatch(/^Al-Kahf/);
  });
});
