// A note under a Recite take, a spot test included (ACT-11, ACT-34; Majd, Nov 25 2026: "add notes under spot test like
// how under revised is an option", then "notes: yes to all").
import React from 'react';
import { act, render, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import { DayBlocks } from '../DayBlocks';
import { takeTagOptions } from '../AddNoteSheet';
import { parseTag, tagFor } from '../../../lib/noteTags';

jest.mock('@react-navigation/native', () => {
  const mockReact = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => mockReact.useEffect(cb, [cb]) };
});
jest.mock('../../../context/ReadingTimerContext', () => ({ useReadingTimer: () => ({ timer: null }) }));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: [], user: { id: 'u1' }, logs: [] }) }));
jest.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('../../../services/firestoreService', () => ({
  getActivityItemsForDay: jest.fn(async () => ({ revisions: [], memorized: [], reads: [] })),
}));
jest.mock('../../v2/ContextMenu', () => ({ ContextMenu: () => null }));
jest.mock('../../v2/ActionSheet', () => ({ ActionSheet: () => null }));
jest.mock('../../reciteMemory/RecitedSheet', () => ({ RecitedSheet: () => null }));
jest.mock('../../../lib/recordings', () => ({ listRecordings: jest.fn(async () => []) }));
jest.mock('../../../lib/reciteLive/availability', () => ({
  ...jest.requireActual('../../../lib/reciteLive/availability'),
  reciteLiveForAccount: () => true,
}));
jest.mock('../../../lib/release/journalDesign', () => ({ journalDesignEnabled: () => true }));
jest.mock('../../../lib/reciteMemory/takeAudio', () => ({ useTakeRecordings: () => new Set() }));
const mockRecords: unknown[] = [];
jest.mock('../../../lib/reciteMemory/store', () => ({
  ...jest.requireActual('../../../lib/reciteMemory/store'),
  useMemoryRecords: () => mockRecords,
}));
// Each take row: its id, and its menu's actions kept for the test.
const mockActions: Record<string, { key: string; onPress: () => void }[]> = {};
jest.mock('../../reciteMemory/TakeRows', () => {
  const actual = jest.requireActual('../../reciteMemory/TakeRows');
  const { Text: MockText } = require('react-native');
  return {
    ...actual,
    useQuranWordsWhen: () => require('../../../lib/recite/__fixtures__/quranWords').quranWords(),
    TakeDayRow: ({ take, actions }: { take: { id: string }; actions: { key: string; onPress: () => void }[] }) => {
      mockActions[take.id] = actions;
      return <MockText testID={`take-row-${take.id}`}>{take.id}</MockText>;
    },
  };
});

const DAY = '2026-11-25';
const take = (id: string, createdAt: number, spot = false) => ({
  id, kind: 'take', createdAt, rev: 1, day: DAY, from: 5000, to: 5100, secs: 120, marks: [], passed: [],
  ...(spot ? { spotTest: { finished: true } } : {}),
});

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}
const noop = jest.fn();
const at = Date.UTC(2026, 10, 25, 21, 0);

describe('A note under a take', () => {
  it('[ACT-11] a take is a tag: take:<id>', () => {
    expect(tagFor('take', 'abc')).toBe('take:abc');
    expect(parseTag('take:abc')).toEqual({ kind: 'take', id: 'abc' });
  });

  it('[ACT-11] Show under offers each of the day’s takes: Spot test and Recited, with its time when there are several', () => {
    expect(takeTagOptions([{ id: 's', createdAt: at, spotTest: { finished: true } as never }, { id: 'r', createdAt: at }]).map((o) => [o.tag, o.label])).toEqual([
      ['take:s', 'Spot test'],
      ['take:r', 'Recited'],
    ]);
    const two = takeTagOptions([{ id: 'r1', createdAt: at }, { id: 'r2', createdAt: at + 60_000 }]).map((o) => o.label);
    expect(two[0]).toMatch(/^Recited \d/);
    expect(two[0]).not.toBe(two[1]);
  });

  it('[ACT-11] [ACT-34] a note tagged to a take shows under it, a spot test’s under its own block; the take’s menu adds one', async () => {
    mockRecords.splice(0, mockRecords.length, take('t-rec', at - 3_600_000), take('t-spot', at - 1_800_000, true));
    const onAddTakeNote = jest.fn();
    const notes = [
      { id: 'n1', at, kind: 'note', text: 'Under the take.', minutes: null, tag: 'take:t-rec' },
      { id: 'n2', at, kind: 'note', text: 'Under the spot test.', minutes: null, tag: 'take:t-spot' },
      { id: 'n3', at, kind: 'note', text: 'Its take is gone.', minutes: null, tag: 'take:deleted' },
    ] as never;
    const screen = render(
      (
        <DayBlocks
          day={DAY}
          revisionNotes={[]}
          memorizationNotes={[]}
          readings={[]}
          notes={notes}
          onEditReading={noop}
          onEditNote={noop}
          onDeleteNote={noop}
          onDeleteAllNotes={noop}
          revisedLog={null}
          onDeleteRevised={noop}
          onDeleteMemorized={noop}
          onOpenRecording={noop}
          onDeleteReading={noop}
          onAddTakeNote={onAddTakeNote}
        />
      ) as never,
    );
    await flush();
    expect(within(screen.getByTestId('activity-block-recited')).getByText('Under the take.')).toBeTruthy();
    expect(within(screen.getByTestId('activity-block-spot')).getByText('Under the spot test.')).toBeTruthy();
    const notesBlock = screen.getByTestId('activity-block-notes');
    expect(within(notesBlock).queryByText('Under the take.')).toBeNull();
    expect(within(notesBlock).getByText('Its take is gone.')).toBeTruthy();
    // The take's menu: Add a note, already pointed at it.
    const add = mockActions['t-spot'].find((a) => a.key === 'note');
    expect(add).toBeTruthy();
    add!.onPress();
    expect(onAddTakeNote).toHaveBeenCalledWith('take:t-spot');
    expect(Text).toBeTruthy();
  });
});
