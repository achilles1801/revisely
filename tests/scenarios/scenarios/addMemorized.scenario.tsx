// The Memorized add sheet (ACT-5): From and To (or a surah) mark those pages memorized, and record
// a Memorized item for today: the same two writes the composer makes.
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AddMemorizedSheet } from '../../../src/components/activity/AddMemorizedSheet';
import { queueChange } from '../../../src/lib/offline/queue';

const mockUpdatePages = jest.fn(async () => undefined);
const mockPages = Array.from({ length: 604 }, (_, i) => ({ pageNumber: i + 1, status: i < 3 ? 'memorized' : 'not_memorized', dateMemorized: null }));

jest.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({ user: { id: 'u1' }, pages: mockPages, updatePages: (...args: unknown[]) => (mockUpdatePages as unknown as (...a: unknown[]) => unknown)(...args) }),
}));
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('../../../src/lib/offline/queue', () => ({ queueChange: jest.fn(async () => undefined) }));
jest.mock('../../../src/services/firestoreService', () => ({ getReadingSessionsForDay: jest.fn(async () => []) }));
jest.mock('../../../src/components/memorization/RangePickerSheet', () => ({ RangePickerSheet: () => null }));
jest.mock('../../../src/components/v2/Sheet', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    Sheet: ({ children, right }: { children: React.ReactNode; right?: { label: string; onPress: () => void; disabled?: boolean } }) =>
      React.createElement(
        View,
        null,
        children,
        right
          ? React.createElement(Pressable, { testID: 'sheet-right', disabled: right.disabled, onPress: right.onPress }, React.createElement(Text, null, right.label))
          : null,
      ),
  };
});

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('Memorized add sheet (ACT-5)', () => {
  beforeEach(() => {
    (queueChange as unknown as jest.Mock).mockClear();
    mockUpdatePages.mockClear();
  });

  it('[ACT-5] marks the pages memorized and records a Memorized item for the day', async () => {
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" />);
    fireEvent.changeText(screen.getByTestId('add-memorized-from'), '21');
    fireEvent.changeText(screen.getByTestId('add-memorized-to'), '25');
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(queueChange).toHaveBeenCalledWith({ kind: 'memorization.mark', day: '2026-11-03', pages: [21, 22, 23, 24, 25], at: expect.any(Number) });
    const [changed, numbers] = mockUpdatePages.mock.calls[0] as unknown as [{ pageNumber: number; status: string }[], number[]];
    expect(numbers).toEqual([21, 22, 23, 24, 25]);
    expect(changed.filter((p) => p.pageNumber >= 21 && p.pageNumber <= 25).every((p) => p.status === 'memorized')).toBe(true);
  });

  it('[ACT-5] a range already memorized writes no page change, and still records the day', async () => {
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" />);
    fireEvent.changeText(screen.getByTestId('add-memorized-from'), '1');
    fireEvent.changeText(screen.getByTestId('add-memorized-to'), '3');
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(mockUpdatePages).not.toHaveBeenCalled();
    expect(queueChange).toHaveBeenCalledTimes(1);
  });

  it('[ACT-5] minutes typed go with the day’s Memorized item; none typed sends none', async () => {
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" />);
    fireEvent.changeText(screen.getByTestId('add-memorized-from'), '562');
    fireEvent.changeText(screen.getByTestId('add-memorized-to'), '562');
    fireEvent.changeText(screen.getByTestId('add-memorized-minutes'), '25');
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(queueChange).toHaveBeenCalledWith({ kind: 'memorization.mark', day: '2026-11-03', pages: [562], at: expect.any(Number), minutes: 25 });
  });
});
