// The day's page strip (ACT-20) and strength without Smart Tracking (ACT-19). Majd, Nov 8 2026: the
// strip didn't say what it was telling him, "especially if i dont have smart tracking enabled", and
// "you'd think u can atleast click on it and it'd take u to that page in the mushaf".
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
// 546–549 (Al-Hashr to the start of Al-Mumtahanah): 546 and 547 rated weak, the rest strong.
const mockApp: { pages: unknown[]; user: unknown } = { pages: [], user: null };
jest.mock('../../../src/context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('../../../src/services/firestoreService', () => ({
  getActivityItemsForDay: jest.fn(async () => ({
    // Assigned 546–549: 546–548 revised, 549 skipped.
    revisions: [{ id: '2026-11-03', day: '2026-11-03', countsFor: '2026-11-03', pages: [546, 547, 548], skipped: [549], assigned: [546, 547, 548, 549], minutes: 12, occurredAt: null }],
    memorized: [],
    reads: [],
  })),
}));
jest.mock('../../../src/lib/recordings', () => ({ listRecordings: jest.fn(async () => []) }));

const page = (pageNumber: number, weaknessRating: number) => ({
  pageNumber,
  status: 'memorized',
  weaknessRating,
  lastRevisedDate: '2026-11-03',
  totalRevisionCount: 3,
  skipCount: 0,
  dateMemorized: null,
});

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const noop = jest.fn();
function open(smartTracking: boolean) {
  mockApp.pages = [page(546, 2), page(547, 2), page(548, 4), page(549, 5)];
  mockApp.user = { smartTrackingEnabled: smartTracking };
  const onOpenPage = jest.fn();
  const screen = render(
    (
      <DayBlocks
        day="2026-11-03"
        revisionNotes={[]}
        memorizationNotes={[]}
        readings={[]}
        notes={[]}
        onEditReading={noop}
        onOpenLog={noop}
        revisedLog={null}
        onDeleteRevised={noop}
        onDeleteMemorized={noop}
        onOpenRecording={noop}
        onDeleteReading={noop}
        onOpenPage={onOpenPage}
      />
    ) as never,
  );
  return { screen, onOpenPage };
}

describe('the day’s page strip', () => {
  beforeEach(() => (firestoreService.getActivityItemsForDay as unknown as jest.Mock).mockClear());

  it('[ACT-19] without Smart Tracking: no strength counts and no weak marks; the strip says what it shows', async () => {
    const { screen } = open(false);
    await flush();
    expect(screen.queryByTestId('activity-strength')).toBeNull();
    expect(screen.queryByText(/weak|moderate|strong/)).toBeNull();
    expect(screen.queryAllByTestId(/^strip-weak-/)).toHaveLength(0);
    expect(screen.getByTestId('activity-strip-summary').props.children).toBe('3 revised · 1 skipped');
  });

  it('[ACT-19] with Smart Tracking: strength shows, and the weak pages are marked', async () => {
    const { screen } = open(true);
    await flush();
    expect(screen.getByTestId('activity-strength')).toBeTruthy();
    expect(screen.getByText('weak')).toBeTruthy();
    expect(screen.getAllByTestId(/^strip-weak-/)).toHaveLength(2);
  });

  it('[ACT-20] its ends are named by surah, not page number', async () => {
    const { screen } = open(false);
    await flush();
    const ends = [screen.getByTestId('strip-start'), screen.getByTestId('strip-end')].map((t) => plainText(String(t.props.children)));
    expect(ends).toEqual(['Al-Hashr', 'Al-Mumtahanah']);
    expect(screen.queryByText(/^p\. /)).toBeNull();
  });

  it('[ACT-20] a tap on a page opens it in the reader; VoiceOver names it by surah and what happened to it', async () => {
    const { screen, onOpenPage } = open(false);
    await flush();
    const cell = screen.getByTestId('strip-page-549');
    expect(plainText(cell.props.accessibilityLabel)).toBe('Al-Mumtahanah, ayahs 1 to 5, skipped');
    expect(cell.props.accessibilityHint).toBe('Opens in the reader');
    fireEvent.press(cell);
    fireEvent.press(screen.getByTestId('strip-page-546'));
    expect(onOpenPage.mock.calls).toEqual([[549], [546]]);
  });
});
