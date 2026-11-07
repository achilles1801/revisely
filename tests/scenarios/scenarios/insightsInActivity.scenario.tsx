// Insights in Activity (ACT-12): Weak spots reads the pages' ratings, which only Smart Tracking writes.
// Without it, Activity's Insights has no Weak spots (no Ask, no "See all"), only a line that turns it
// on; with it, Weak spots ends in "See all pages by strength", the old Insights tab's Browse as a
// screen of its own.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { InsightsView, type InsightsData } from '../../../src/components/activity/InsightsView';

jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));
jest.mock('../../../src/lib/revo/open', () => ({ openRevo: jest.fn() }));

const TODAY = '2026-11-03';
function data(smartTracking: boolean): InsightsData {
  return {
    today: TODAY,
    // Al-Hashr's 546–547 rated weak, 550 strong.
    memorized: new Set([546, 547, 550]),
    learning: new Set(),
    rating: (p) => (p === 550 ? 4 : 2),
    ratedWeak: new Map(),
    revised: [],
    read: [],
    memorizations: [],
    capacity: 20,
    revo: true,
    smartTracking,
  };
}

function open(smartTracking: boolean) {
  const onSeeAllPages = jest.fn();
  const onTurnOnSmartTracking = jest.fn();
  const view = render(
    <InsightsView
      data={data(smartTracking)}
      onReviseTomorrow={jest.fn()}
      onPlanIt={jest.fn()}
      onOpenPage={jest.fn()}
      onSeeAllPages={onSeeAllPages}
      onTurnOnSmartTracking={onTurnOnSmartTracking}
    />,
  );
  return { ...view, onSeeAllPages, onTurnOnSmartTracking };
}

describe('Insights in Activity', () => {
  it('[ACT-12] without Smart Tracking: no Weak spots, no Ask and no "See all"; a line turns it on; the other sections stay', () => {
    const { queryByText, queryByTestId, getByText, getByRole, onTurnOnSmartTracking } = open(false);
    expect(getByText('Coverage')).toBeTruthy();
    expect(getByText('Consistency')).toBeTruthy();
    expect(getByText('Memorization')).toBeTruthy();
    expect(queryByText('Weak spots')).toBeNull();
    expect(queryByText('Al-Hashr')).toBeNull();
    expect(queryByTestId('insights-ask-revo')).toBeNull();
    expect(queryByTestId('insights-see-all-pages')).toBeNull();
    fireEvent.press(getByRole('link', { name: 'Turn on Smart Tracking to see your weak spots' }));
    expect(onTurnOnSmartTracking).toHaveBeenCalledTimes(1);
  });

  it('[ACT-12] with Smart Tracking: Weak spots lists the weak pages and ends in "See all pages by strength"', () => {
    const { getByText, getByTestId, queryByTestId, onSeeAllPages } = open(true);
    expect(getByText('Weak spots')).toBeTruthy();
    expect(getByText('Al-Hashr')).toBeTruthy();
    expect(getByTestId('insights-ask-revo')).toBeTruthy();
    expect(queryByTestId('insights-smart-tracking')).toBeNull();
    fireEvent.press(getByText('See all pages by strength'));
    expect(onSeeAllPages).toHaveBeenCalledTimes(1);
  });
});
