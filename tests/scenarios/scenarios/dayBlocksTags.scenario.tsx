// Tagged notes in the Activity day (ACT-11): a note tagged to an item shows under that item; a
// tagged note whose item is gone, and an untagged note, stay in the Notes block.
import React from 'react';
import { act, render, within } from '@testing-library/react-native';
import { DayBlocks } from '../../../src/components/activity/DayBlocks';
import * as firestoreService from '../../../src/services/firestoreService';

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]) };
});
jest.mock('../../../src/context/ReadingTimerContext', () => ({ useReadingTimer: () => ({ timer: null }) }));
jest.mock('../../../src/context/AppContext', () => ({ useApp: () => ({ pages: [], user: null }) }));
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('../../../src/services/firestoreService', () => ({
  getActivityItemsForDay: jest.fn(async () => ({
    revisions: [{ id: 'rev', day: '2026-11-03', countsFor: '2026-11-03', pages: [1], skipped: [], assigned: [1], minutes: null, occurredAt: 0 }],
    memorized: [{ id: '2026-11-03', day: '2026-11-03', pages: [21, 22] }],
    reads: [],
  })),
}));
jest.mock('../../../src/components/v2/ContextMenu', () => ({ ContextMenu: () => null }));
jest.mock('../../../src/lib/recordings', () => ({ listRecordings: jest.fn(async () => []) }));

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const noop = jest.fn();
const at = Date.UTC(2026, 10, 3, 21, 0);

describe('Tagged notes in the day (ACT-11)', () => {
  it('[ACT-11] a note tagged to an item shows under it; orphans and untagged notes stay in Notes', async () => {
    const notes = [
      { id: 'n-rev', at, kind: 'note', text: 'Tagged to revised.', minutes: null, tag: 'revision:2026-11-03' },
      { id: 'n-mem', at, kind: 'note', text: 'Tagged to memorized.', minutes: null, tag: 'memorization:2026-11-03' },
      { id: 'n-gone', at, kind: 'note', text: 'Its item is gone.', minutes: null, tag: 'read:deleted' },
      { id: 'n-plain', at, kind: 'note', text: 'Plain note.', minutes: null },
    ] as never;
    const screen = render(
      (
        <DayBlocks
          day="2026-11-03"
          revisionNotes={[]}
          memorizationNotes={[]}
          readings={[]}
          notes={notes}
          onEditReading={noop}
          onOpenLog={noop}
          revisedLog={null}
          onDeleteRevised={noop}
          onDeleteMemorized={noop}
          onOpenRecording={noop}
          onDeleteReading={noop}
        />
      ) as never,
    );
    await flush();
    const notesBlock = screen.getByTestId('activity-block-notes');
    expect(within(notesBlock).queryByText('Tagged to revised.')).toBeNull();
    expect(within(notesBlock).queryByText('Tagged to memorized.')).toBeNull();
    expect(within(notesBlock).getByText('Its item is gone.')).toBeTruthy();
    expect(within(notesBlock).getByText('Plain note.')).toBeTruthy();
    expect(screen.getByText('Tagged to revised.')).toBeTruthy();
    expect(screen.getByText('Tagged to memorized.')).toBeTruthy();
    expect(firestoreService.getActivityItemsForDay).toHaveBeenCalled();
  });
});
