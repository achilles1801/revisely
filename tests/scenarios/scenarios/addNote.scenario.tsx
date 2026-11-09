// The Note add sheet (ACT-5): a note for the day, optionally shown under one of the day's items.
// Add is a new note with its own id and time; an empty note cannot be added.
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AddNoteSheet } from '../../../src/components/activity/AddNoteSheet';
import { queueChange } from '../../../src/lib/offline/queue';

jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('../../../src/lib/offline/queue', () => ({ queueChange: jest.fn(async () => undefined), currentAccount: () => null }));
jest.mock('../../../src/services/firestoreService', () => ({
  getActivityItemsForDay: jest.fn(async () => ({
    revisions: [{ id: 'rev', day: '2026-11-03', countsFor: '2026-11-03' }],
    memorized: [],
    reads: [],
  })),
}));
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

describe('Note add sheet (ACT-5)', () => {
  beforeEach(() => {
    (queueChange as unknown as jest.Mock).mockClear();
  });

  it('[ACT-5] adds a note for the day, shown under the day’s Revised block', async () => {
    const screen = render(<AddNoteSheet visible onClose={jest.fn()} day="2026-11-03" />);
    await flush();
    fireEvent.changeText(screen.getByTestId('add-note-text'), '548–549 keep slipping at the turn.');
    fireEvent.press(screen.getByTestId('add-note-tag-revised'));
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(queueChange).toHaveBeenCalledWith({
      kind: 'journal.entry.add',
      date: '2026-11-03',
      entry: expect.objectContaining({ kind: 'note', text: '548–549 keep slipping at the turn.', tag: 'revision:2026-11-03' }),
    });
  });

  it('[ACT-5] an empty note cannot be added', async () => {
    const screen = render(<AddNoteSheet visible onClose={jest.fn()} day="2026-11-03" />);
    await flush();
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(queueChange).not.toHaveBeenCalled();
  });
});
