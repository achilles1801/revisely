// A day's Revised figure in the calendar (BEHAVIOUR.md ACT-32; Majd, Nov 23 2026, after adding a revised elsewhere spot:
// "not sure what 2 of 0 even means"). It counts the day's plan: pages beyond it never take the figure past it, and a day
// with no plan says what was revised.
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CalendarMonth } from '../../../src/components/activity/CalendarMonth';
import { dayMarks } from '../../../src/lib/activityInsights';
import type { Revised } from '../../../src/lib/activityInsights';

const mockPalette = new Proxy({}, { get: () => '#000000' });
jest.mock('../../../src/context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));

const DAY = '2026-11-22';
const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const item = (pages: number[], assigned?: number[]): Revised => ({ day: DAY, countsFor: DAY, pages, assigned, minutes: null });
const data = (revised: Revised[]) => ({ revised, memorized: [], read: [], noteDays: new Set<string>() });

function show(revised: Revised[], span: 'month' | 'week' = 'month') {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <CalendarMonth
        month="2026-11"
        week="2026-11-22"
        span={span}
        onSpan={jest.fn()}
        today={DAY}
        picked={DAY}
        data={data(revised)}
        onStep={jest.fn()}
        onPick={jest.fn()}
        onOpen={jest.fn()}
      />
    </SafeAreaProvider>,
  );
}

const figure = () => screen.getByTestId('preview-value-revised').props.children as string;

describe('a day’s Revised figure (ACT-32)', () => {
  it('[ACT-32] a day with no plan never says “2 of 0”: it names what was revised, in the month and the week', () => {
    const month = show([item([5, 6])]);
    expect(figure()).toBe('Al-Baqarah · 2 pages');
    month.unmount();
    show([item([5, 6])], 'week');
    expect(screen.getByText(/Revised 2 pages/)).toBeTruthy();
    expect(screen.queryByText(/ of 0/)).toBeNull();
  });

  it('[ACT-32] pages beyond the plan never take the figure past it, or fill the ring', () => {
    // All five planned pages, and two more logged by hand.
    const all = [item([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]), item([20, 21])];
    const view = show(all);
    expect(figure()).toBe('5 of 5');
    view.unmount();
    expect(dayMarks(DAY, data(all)).ring).toBe(1);

    // Three of the five, and two others: 3 of 5, not 5 of 5.
    const some = [item([1, 2, 3], [1, 2, 3, 4, 5]), item([20, 21])];
    show(some);
    expect(figure()).toBe('3 of 5');
    expect(dayMarks(DAY, data(some)).ring).toBeCloseTo(0.6);
  });

  it('[ACT-32] a planned page logged by hand counts toward the plan, once', () => {
    const both = [item([1, 2, 3], [1, 2, 3, 4, 5]), item([3, 4])];
    show(both);
    expect(figure()).toBe('4 of 5');
    expect(dayMarks(DAY, data(both)).ring).toBeCloseTo(0.8);
  });
});
