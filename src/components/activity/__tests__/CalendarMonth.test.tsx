// Overview's calendar with Insights' longest gap marked on it (ACT-28): the band behind the gap's days and the words
// above the grid; when the mark goes, they fade out and are hidden from VoiceOver at once.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CalendarMonth } from '../CalendarMonth';
import type { CalendarGap } from '../../../lib/activityCalendar';

const mockPalette = new Proxy({}, { get: () => '#000000' });
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));

const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const GAP: CalendarGap = { from: '2026-10-30', to: '2026-11-04', cue: 'Longest gap, 30 Oct – 4 Nov · 5 days', key: 1 };
const DATA = { revised: [], memorized: [], read: [], noteDays: new Set<string>() };

function calendar(gap: CalendarGap | null, span: 'month' | 'week' = 'month') {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <CalendarMonth
        month="2026-11"
        week="2026-10-25"
        span={span}
        onSpan={jest.fn()}
        today="2026-11-05"
        picked={null}
        data={DATA}
        onStep={jest.fn()}
        onPick={jest.fn()}
        onOpen={jest.fn()}
        gap={gap}
      />
    </SafeAreaProvider>
  );
}

describe('the longest gap on the calendar (ACT-28)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('marks the gap’s days in the rows that hold them, with its words above the grid', () => {
    render(calendar(GAP));
    expect(screen.getByText('Longest gap, 30 Oct – 4 Nov · 5 days')).toBeTruthy();
    // No band before the grid's width is known.
    expect(screen.queryByTestId('calendar-gap-band-2026-11-01')).toBeNull();
    fireEvent(screen.getByTestId('calendar-grid'), 'layout', { nativeEvent: { layout: { width: 393 } } });
    expect(screen.getByTestId('calendar-gap-band-2026-11-01')).toBeTruthy();
    expect(screen.queryByTestId('calendar-gap-band-2026-11-08')).toBeNull();
  });

  it('when the mark goes, it is hidden from VoiceOver at once and gone once faded', () => {
    const view = render(calendar(GAP));
    fireEvent(screen.getByTestId('calendar-grid'), 'layout', { nativeEvent: { layout: { width: 393 } } });
    view.rerender(calendar(null));
    // Still drawn while it fades, but not there for VoiceOver (nor for queries that leave hidden elements out).
    const hidden = { includeHiddenElements: true };
    expect(screen.queryByTestId('calendar-gap-cue-leaving')).toBeNull();
    expect(screen.getByTestId('calendar-gap-cue-leaving', hidden).props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByTestId('calendar-gap-band-leaving-2026-11-01', hidden)).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.queryByTestId('calendar-gap-cue-leaving', hidden)).toBeNull();
    expect(screen.queryByTestId('calendar-gap-band-leaving-2026-11-01', hidden)).toBeNull();
  });

  it('in a week, the band is in the week’s one row', () => {
    render(calendar(GAP, 'week'));
    fireEvent(screen.getByTestId('calendar-week'), 'layout', { nativeEvent: { layout: { width: 393 } } });
    expect(screen.getByTestId('calendar-gap-band-2026-10-25')).toBeTruthy();
  });
});
