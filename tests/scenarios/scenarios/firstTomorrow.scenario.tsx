// "Revise these first tomorrow", Plan it and the juz sheet's "Plan it for tomorrow first" (ACT-24).
// Majd, Nov 8 2026: "the buttons on the activity screen don't work". They saved, silently: a toast says
// so now, with Undo (lib/weakSpotActions putFirstTomorrow), and once the pages go first tomorrow each
// button shows it ("First tomorrow ✓") and can't be tapped twice.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InsightsView, type InsightsData } from '../../../src/components/activity/InsightsView';

const TODAY = '2026-11-03';
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: (_t, k) => (k === 'heat' || k === 'heatInk' ? ['#000000', '#000000', '#000000', '#000000', '#000000'] : '#000000') }), theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));
// Juz 4's pages, memorized, last revised 41 days ago (as the app holds the date: a timestamp).
jest.mock('../../../src/context/AppContext', () => {
  const pages = Array.from({ length: 20 }, (_, i) => ({ pageNumber: 62 + i, status: 'memorized', weaknessRating: 4, lastRevisedDate: '2026-09-23T10:00:00.000Z', skipCount: 0 }));
  return { useApp: () => ({ pages, user: { smartTrackingEnabled: true } }) };
});
jest.mock('../../../src/lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../src/lib/revo/useRevoContext', () => ({ useRevoContext: () => ({ sources: () => null }) }));
jest.mock('../../../src/services/firestoreService', () => ({ getActivityItemsBetween: jest.fn(async () => ({ revisions: [], memorized: [], reads: [] })) }));
const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

// Al-Hashr's 546–547 weak; Juz 4 (62–81) memorized and untouched for 41 days.
const JUZ4 = Array.from({ length: 20 }, (_, i) => 62 + i);
function data(firstTomorrow: number[]): InsightsData {
  return {
    today: TODAY,
    memorized: new Set([546, 547, 550, ...JUZ4]),
    learning: new Set(),
    rating: (p) => (p === 546 || p === 547 ? 2 : 4),
    ratedWeak: new Map(),
    revised: [{ day: TODAY, countsFor: TODAY, pages: [546, 547, 550], skipped: [], minutes: 10, occurredAt: null }],
    read: [],
    memorizations: [],
    capacity: 20,
    revo: false,
    smartTracking: true,
    lastRevisedOn: new Map(JUZ4.map((p) => [p, '2026-09-23'] as [number, string])),
    firstTomorrow: new Set(firstTomorrow),
  };
}

function open(firstTomorrow: number[]) {
  const onReviseTomorrow = jest.fn();
  const onPlanIt = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InsightsView data={data(firstTomorrow)} onReviseTomorrow={onReviseTomorrow} onPlanIt={onPlanIt} onOpenPage={jest.fn()} />
    </SafeAreaProvider>,
  );
  return { onReviseTomorrow, onPlanIt };
}

describe('first tomorrow', () => {
  afterEach(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  it('[ACT-24] before: "Revise these first tomorrow" and Plan it put the pages first tomorrow', () => {
    const { onReviseTomorrow, onPlanIt } = open([]);
    fireEvent.press(screen.getByTestId('insights-revise-tomorrow'));
    expect(onReviseTomorrow).toHaveBeenCalledWith([546, 547]);
    fireEvent.press(screen.getByTestId('insights-plan-it'));
    expect(onPlanIt).toHaveBeenCalledWith(JUZ4);
  });

  it('[ACT-24] after: each says "First tomorrow" and can’t be tapped twice; so does the juz sheet’s Plan it', () => {
    open([546, 547, ...JUZ4]);
    expect(screen.queryByTestId('insights-revise-tomorrow')).toBeNull();
    expect(screen.getByTestId('insights-revise-tomorrow-done')).toBeTruthy();
    expect(screen.queryByTestId('insights-plan-it')).toBeNull();
    expect(screen.getByTestId('insights-plan-it-done')).toBeTruthy();
    expect(screen.getAllByText('First tomorrow')).toHaveLength(2);
    fireEvent.press(screen.getByTestId('insights-untouched'));
    expect(screen.getByTestId('juz-sheet-plan-it-done')).toBeTruthy();
    expect(screen.queryByTestId('juz-sheet-plan-it')).toBeNull();
  });

  it('[ACT-24] only the pages already first tomorrow count: one weak page more brings the button back', () => {
    open([546]);
    expect(screen.getByTestId('insights-revise-tomorrow')).toBeTruthy();
  });
});
