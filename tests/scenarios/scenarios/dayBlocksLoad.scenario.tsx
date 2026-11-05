// Regression: DayBlocks reloaded its items on every render. Its `load` was a new function each
// render, and useActivityReload runs load in a focus effect keyed on it, so each load set new
// state, which rendered again, which loaded again: an endless fetch loop that grew the heap until
// the app froze (seen in the scenario E2E for a Memorized entry on a tester's day).
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { DayBlocks } from '../../../src/components/activity/DayBlocks';
import * as firestoreService from '../../../src/services/firestoreService';

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  // As useFocusEffect: the callback runs when it changes, which is what loops when it changes every render.
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]) };
});
jest.mock('../../../src/context/ReadingTimerContext', () => ({ useReadingTimer: () => ({ timer: null }) }));
jest.mock('../../../src/context/AppContext', () => ({ useApp: () => ({ pages: [], user: null }) }));
jest.mock('../../../src/context/ThemeContext', () => ({ useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }) }));
jest.mock('../../../src/services/firestoreService', () => ({
  getActivityItemsForDay: jest.fn(async () => ({ revisions: [], memorized: [], reads: [] })),
}));
jest.mock('../../../src/components/v2/ActionSheet', () => ({ ActionSheet: () => null }));
jest.mock('../../../src/lib/recordings', () => ({ listRecordings: jest.fn(async () => []) }));

describe('DayBlocks loads its items once', () => {
  it('[ACT-9] does not reload the day on every render', async () => {
    const spy = firestoreService.getActivityItemsForDay as unknown as jest.Mock;
    spy.mockClear();
    render(
      <DayBlocks
        day="2026-11-03"
        revisionNotes={[]}
        memorizationNotes={[]}
        readings={[]}
        notes={[]}
        onEditReading={jest.fn()}
        onDeleteReading={jest.fn()}
        onOpenLog={jest.fn()}
        revisedLog={null}
        onDeleteRevised={jest.fn()}
        onDeleteMemorized={jest.fn()}
        onOpenRecording={jest.fn()}
        onDeleteReading={jest.fn()}
      /> as never,
    );
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
