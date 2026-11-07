// The threaded sub-rows of the Activity day view carry no actions (editing happens in the log):
// no swipe, no Delete, and no empty thread item (Majd's TestFlight report).
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DayBlocks, timeRange } from '../DayBlocks';
import * as firestoreService from '../../../services/firestoreService';
import type { JournalNote } from '../../../types';

jest.mock('../../../context/ThemeContext', () => {
  const mockPalette = new Proxy({}, { get: () => '#000000' });
  return { useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) };
});
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: [], user: null, logs: [] }) }));
jest.mock('../../../services/firestoreService', () => ({
  getActivityItemsForDay: jest.fn(() =>
    Promise.resolve({ revisions: [], memorized: [], reads: [], doneAhead: [] }),
  ),
}));
jest.mock('../../../lib/recordings', () => ({
  ...jest.requireActual('../../../lib/recordings'),
  listRecordings: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../../hooks/useRecordingPlayback', () => ({ useRecordingPlayback: () => ({}) }));
jest.mock('../../v2/ActionSheet', () => ({ ActionSheet: () => null }));
jest.mock('../useActivityReload', () => {
  const mockReact = jest.requireActual('react');
  return { useActivityReload: (load: () => void) => mockReact.useEffect(() => load(), []) };
});

const note = (id: string, text: string): JournalNote => ({ id, at: Date.UTC(2026, 10, 5, 13, 1), kind: 'note', text, minutes: null });

describe('the Notes block (sub-rows carry no actions)', () => {
  it('shows each note as a plain row, with no swipe row, no Delete and no empty item', async () => {
    render(
      <DayBlocks
        day="2026-11-05"
        revisionNotes={[]}
        memorizationNotes={[]}
        readings={[]}
        notes={[note('n1', 'fyy')]}
        onEditReading={jest.fn()}
        onDeleteReading={jest.fn()}
        onOpenLog={jest.fn()}
        revisedLog={null}
        onDeleteRevised={jest.fn()}
        onDeleteMemorized={jest.fn()}
        onOpenRecording={jest.fn()}
      />,
    );
    await screen.findByTestId('activity-block-notes');
    expect(screen.getByText('fyy')).toBeTruthy();
    expect(screen.queryByTestId('activity-note-n1')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.getAllByText(/fyy/)).toHaveLength(1);
    expect(firestoreService.getActivityItemsForDay).toHaveBeenCalledWith('2026-11-05');
  });

  it('a day with no notes shows no Notes block at all', async () => {
    render(
      <DayBlocks day="2026-11-05" revisionNotes={[]} memorizationNotes={[]} readings={[]} notes={[]} onEditReading={jest.fn()} onDeleteReading={jest.fn()} onOpenLog={jest.fn()} revisedLog={null} onDeleteRevised={jest.fn()} onDeleteMemorized={jest.fn()} onOpenRecording={jest.fn()} />,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('activity-block-notes')).toBeNull();
  });
});

describe('a timed read\'s time range (mock d1)', () => {
  const at = (h: number, m: number) => new Date(2026, 10, 3, h, m).getTime();
  const plain = (t: string) => t.replace(/\s/g, ' ');
  it('says AM or PM once when both ends share it', () => {
    expect(plain(timeRange(at(8, 5), 18))).toBe('8:05 – 8:23 AM');
  });
  it('says both when the range crosses noon', () => {
    expect(plain(timeRange(at(11, 50), 20))).toBe('11:50 AM – 12:10 PM');
  });
  it('gives the start alone without minutes', () => {
    expect(plain(timeRange(at(8, 5), null))).toBe('8:05 AM');
  });
});
