// The Activity day's rows (ACT-6): a hold on a row under a block does nothing (notes are edited
// in the daily log); a block header holds a menu of Edit and Delete, and VoiceOver offers the
// same actions as custom actions. A Memorized entry's menu is exactly Edit and Delete, and Edit
// opens the memorized pages at that entry (Majd, Nov 8 2026).
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { DayBlocks } from '../../../src/components/activity/DayBlocks';
import * as firestoreService from '../../../src/services/firestoreService';
import { plainText } from '../../../src/lib/passages';

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
  getActivityItemsForDay: jest.fn(async () => ({ revisions: [], memorized: [], reads: [] })),
}));
jest.mock('../../../src/components/v2/ContextMenu', () => ({
  ContextMenu: (props: unknown) => {
    (globalThis as { __sheet?: unknown }).__sheet = props;
    return null;
  },
}));
jest.mock('../../../src/lib/recordings', () => ({ listRecordings: jest.fn(async () => []) }));

type Sheet = { visible: boolean; actions: { key: string; label: string; onPress: () => void }[]; preview?: { label: string; text?: string } };
const sheet = () => (globalThis as { __sheet?: Sheet }).__sheet ?? { visible: false, actions: [] };

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const noop = jest.fn();
const props = {
  day: '2026-11-03',
  revisionNotes: [],
  memorizationNotes: [],
  onEditReading: noop,
  onOpenLog: noop,
  revisedLog: null,
  onDeleteRevised: noop,
  onDeleteMemorized: noop,
  onOpenRecording: noop,
  onDeleteReading: noop,
};

describe('Activity day rows (ACT-6)', () => {
  it('[ACT-6] a hold on a note under a block opens no menu', async () => {
    const note = { id: 'n1', text: 'a note', kind: 'memorization', tag: 'memorization:x' } as never;
    const screen = render((<DayBlocks {...props} notes={[note]} readings={[]} />) as never);
    await flush();
    fireEvent(screen.getByLabelText('Daily log. Open the log'), 'longPress');
    expect(sheet().visible).toBe(false);
  });

  it('[ACT-6] a Read block header holds Edit and Delete, and VoiceOver offers the same actions', async () => {
    (firestoreService.getActivityItemsForDay as unknown as jest.Mock).mockResolvedValue({
      revisions: [],
      memorized: [],
      reads: [{ id: 'r1', day: '2026-11-03', pages: [1, 2], minutes: 10, occurredAt: Date.UTC(2026, 10, 3, 9) }],
    });
    const session = { id: 'r1', pages: [1, 2], durationSeconds: 600, startedAt: Date.UTC(2026, 10, 3, 9) } as never;
    const screen = render((<DayBlocks {...props} notes={[]} readings={[session]} />) as never);
    await flush();
    // The header reads its title and figure together ("Read, 2 pages").
    const header = screen.getByLabelText('Read, 2 pages');
    expect(header.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['edit-r1', 'delete-r1']);
    fireEvent(header, 'longPress');
    expect(sheet().visible).toBe(true);
    expect(sheet().actions.some((a) => a.label.startsWith('Edit'))).toBe(true);
    expect(sheet().actions.some((a) => a.label.startsWith('Delete'))).toBe(true);
  });

  it('[ACT-6] a Memorized entry holds exactly Edit and Delete; Edit opens the memorized pages at it', async () => {
    (firestoreService.getActivityItemsForDay as unknown as jest.Mock).mockResolvedValue({
      revisions: [],
      memorized: [{ id: 'm1', day: '2026-11-03', pages: [562, 563], minutes: 25 }],
      reads: [],
    });
    const onEditMemorized = jest.fn();
    const onDeleteMemorized = jest.fn();
    const screen = render(
      (<DayBlocks {...props} notes={[]} readings={[]} onEditMemorized={onEditMemorized} onDeleteMemorized={onDeleteMemorized} />) as never,
    );
    await flush();
    const header = screen.getByLabelText('Memorized, 2 pages');
    expect(header.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['edit-m1', 'delete-m1']);
    fireEvent(header, 'longPress');
    expect(sheet().visible).toBe(true);
    expect(sheet().actions.map((a) => a.label)).toEqual(['Edit', 'Delete']);
    // The preview names the entry, by surah.
    expect(plainText(sheet().preview?.text ?? '')).toMatch(/^Al-Mulk/);
    act(() => sheet().actions[0].onPress());
    expect(onEditMemorized).toHaveBeenCalledWith([562, 563]);
  });

  it('[ACT-6] two Memorized entries: Edit and Delete for each, named', async () => {
    (firestoreService.getActivityItemsForDay as unknown as jest.Mock).mockResolvedValue({
      revisions: [],
      memorized: [
        { id: 'm1', day: '2026-11-03', pages: [562] },
        { id: 'm2', day: '2026-11-03', pages: [1] },
      ],
      reads: [],
    });
    const screen = render((<DayBlocks {...props} notes={[]} readings={[]} onEditMemorized={jest.fn()} />) as never);
    await flush();
    fireEvent(screen.getByLabelText('Memorized, 2 pages'), 'longPress');
    const labels = sheet().actions.map((a) => a.label);
    expect(labels).toHaveLength(4);
    expect(labels.filter((l) => l.startsWith('Edit '))).toHaveLength(2);
    expect(labels.filter((l) => l.startsWith('Delete '))).toHaveLength(2);
  });
});
