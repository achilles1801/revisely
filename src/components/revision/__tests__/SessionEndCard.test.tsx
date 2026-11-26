import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { SessionEndCard } from '../SessionEndCard';
import { boxedMarks, offCentreMarks } from '../../../../jest/rings';

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <RNText testID={`icon-${name}`}>{name}</RNText> };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../../v2/Confetti', () => {
  const { View } = require('react-native');
  return { Confetti: () => <View testID="confetti" /> };
});
// The Ramadan theme's end card (THEME-7; the scenario ramadanTheme runs it for real): what the hook says, by hand.
const mockRamadan = { dressed: false, line: null as string | null, khatmah: false };
jest.mock('../../ramadan/useRamadanEndCard', () => ({ useRamadanEndCard: () => mockRamadan }));
jest.mock('../../ramadan/EndCardDecor', () => {
  const { View } = require('react-native');
  return { EndCardDecor: ({ khatmah }: { khatmah: boolean }) => <View testID={khatmah ? 'decor-khatmah' : 'decor'} /> };
});

async function show(props: React.ComponentProps<typeof SessionEndCard>) {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <SessionEndCard {...props} />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

describe('SessionEndCard: asking for a rating (SESS-8)', () => {
  it('shows the line on a finished session it was given, and the line opens the store', async () => {
    const onRate = jest.fn();
    await show({ total: 3, done: 3, celebrate: 1, onRate });
    expect(screen.getByText(/Enjoying Revisely\? Rate it/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('session-end-rate'));
    expect(onRate).toHaveBeenCalledTimes(1);
  });

  it('has a ✕ that stops asking', async () => {
    const onDismissRate = jest.fn();
    await show({ total: 3, done: 3, celebrate: 1, onRate: jest.fn(), onDismissRate });
    fireEvent.press(screen.getByLabelText("Don't ask again"));
    expect(onDismissRate).toHaveBeenCalledTimes(1);
  });

  it('shows nothing with pages left, or when it is not the moment', async () => {
    await show({ total: 3, done: 2, celebrate: 1, onRate: jest.fn() });
    expect(screen.queryByTestId('session-end-rate')).toBeNull();
    await show({ total: 3, done: 3, celebrate: 1 });
    expect(screen.queryByTestId('session-end-rate')).toBeNull();
  });
});

describe('SessionEndCard: the done check', () => {
  it('sits in the centre of its circle (jest/rings.ts)', async () => {
    await show({ total: 3, done: 3, celebrate: 1 });
    const { Ionicons } = require('@expo/vector-icons');
    expect(boxedMarks(screen.UNSAFE_root as never, Ionicons)).toBe(1);
    expect(offCentreMarks(screen.UNSAFE_root as never, Ionicons)).toEqual([]);
  });
});

describe('SessionEndCard in Ramadan (THEME-7)', () => {
  afterEach(() => Object.assign(mockRamadan, { dressed: false, line: null, khatmah: false }));

  it('draws the theme’s light and lanterns instead of the confetti, and the day of the month under the count', async () => {
    Object.assign(mockRamadan, { dressed: true, line: 'Day 12 of Ramadan' });
    await show({ total: 3, done: 3, celebrate: 1 });
    expect(screen.getByTestId('decor')).toBeTruthy();
    expect(screen.queryByTestId('confetti')).toBeNull();
    expect(screen.getByText('Day 12 of Ramadan')).toBeTruthy();
    expect(screen.queryByTestId('session-end-khatmah')).toBeNull();
  });

  it('adds the khatmah card when the hook says it is the moment', async () => {
    Object.assign(mockRamadan, { dressed: true, line: 'Day 26 of Ramadan', khatmah: true });
    await show({ total: 3, done: 3, celebrate: 1 });
    expect(screen.getByTestId('decor-khatmah')).toBeTruthy();
    expect(screen.getByText('You’ve been through the whole Qur’an this Ramadan')).toBeTruthy();
    expect(screen.getByText('All 604 pages since 1 Ramadan')).toBeTruthy();
  });

  it('keeps the confetti outside Ramadan', async () => {
    await show({ total: 3, done: 3, celebrate: 1 });
    expect(screen.getByTestId('confetti')).toBeTruthy();
    expect(screen.queryByTestId('decor')).toBeNull();
  });
});
