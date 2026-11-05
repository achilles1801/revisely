// The Revised add sheet (ACT-5): pages typed as From and To, optional minutes and strength. Add
// queues one manual Revised item for today, and a strength choice rates those pages.
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AddRevisedSheet } from '../../../src/components/activity/AddRevisedSheet';
import { queueChange } from '../../../src/lib/offline/queue';

const mockUpdatePages = jest.fn(async () => undefined);
const mockPages = Array.from({ length: 604 }, (_, i) => ({ pageNumber: i + 1, status: 'memorized', weaknessRating: 4 }));

jest.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({ user: { id: 'u1' }, pages: mockPages, updatePages: (...args: unknown[]) => (mockUpdatePages as unknown as (...a: unknown[]) => unknown)(...args) }),
}));
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('../../../src/lib/offline/queue', () => ({ queueChange: jest.fn(async () => undefined) }));
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

describe('Revised add sheet (ACT-5)', () => {
  beforeEach(() => {
    (queueChange as unknown as jest.Mock).mockClear();
    mockUpdatePages.mockClear();
  });

  it('[ACT-5] adds a manual Revised item for today and rates its pages by the strength chosen', async () => {
    const screen = render(<AddRevisedSheet visible onClose={jest.fn()} day="2026-11-03" logs={[]} />);
    fireEvent.changeText(screen.getByTestId('add-revised-from'), '556');
    fireEvent.changeText(screen.getByTestId('add-revised-to'), '557');
    fireEvent.changeText(screen.getByTestId('add-revised-minutes'), '8');
    fireEvent.press(screen.getByTestId('add-revised-strength-strong'));
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(queueChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'revision.add',
        item: expect.objectContaining({ countsFor: '2026-11-03', source: 'manual', pages: [556, 557], minutes: 8 }),
      }),
    );
    const [changed, numbers] = mockUpdatePages.mock.calls[0] as unknown as [{ pageNumber: number; weaknessRating: number }[], number[]];
    expect(numbers).toEqual([556, 557]);
    expect(changed.map((p) => [p.pageNumber, p.weaknessRating])).toEqual([
      [556, 4],
      [557, 4],
    ]);
  });

  it('[ACT-5] adds no strength: the pages are added and no rating changes', async () => {
    const screen = render(<AddRevisedSheet visible onClose={jest.fn()} day="2026-11-03" logs={[]} />);
    fireEvent.changeText(screen.getByTestId('add-revised-from'), '10');
    fireEvent.changeText(screen.getByTestId('add-revised-to'), '10');
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(queueChange).toHaveBeenCalledTimes(1);
    expect(mockUpdatePages).not.toHaveBeenCalled();
  });
});
