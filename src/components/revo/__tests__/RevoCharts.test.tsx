// Revo's charts answer a touch (Majd, Nov 7 2026): a tap or a slide picks a mark, the header
// becomes its readout, and a panel under it leads on. VoiceOver steps through the same marks.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { ThemeProvider } from '../../../context/ThemeContext';
import { plainText } from '../../../lib/passages';
import type { RevisionLog, UserPage } from '../../../types';
import { DailyPagesChart } from '../charts/DailyPagesChart';
import { JuzMapChart } from '../charts/JuzMapChart';
import { PageRatingsChart } from '../charts/PageRatingsChart';
import { TimelineChart } from '../charts/TimelineChart';
import { WeeksChart } from '../charts/WeeksChart';
import type { RevoDayFacts } from '../../../lib/revo/types';
import { ChartCard } from '../RevoCards';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined), notificationAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ logs: [], pages: [] }) }));

const TODAY = '2026-11-07';
const log = (date: string, pagesRevised: number[], extra: Partial<RevisionLog> = {}): RevisionLog => ({
  id: date,
  date,
  pagesRevised,
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: null,
  ...extra,
});
const logs: RevisionLog[] = [
  log('2026-11-01', [582, 583], { durationMinutes: 20, weaknessUpdates: [{ page: 583, rating: 2 }] }),
  log('2026-11-02', [584, 585]),
  log('2026-11-06', [583], { weaknessUpdates: [{ page: 583, rating: 1 }] }),
];
const page = (pageNumber: number, extra: Partial<UserPage> = {}): UserPage => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2026-09-01T09:00:00',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
  ...extra,
});

/** Renders inside the theme, once it has loaded (ThemeProvider shows nothing before). */
async function mount(el: React.ReactElement, id: string) {
  const out = render(<ThemeProvider>{el}</ThemeProvider>);
  await screen.findByTestId(id);
  return out;
}
const text = (id: string) => plainText(String(screen.getByTestId(id).props.children));
const layout = (id: string, width: number, height: number, y = 0) =>
  fireEvent(screen.getByTestId(id), 'layout', { nativeEvent: { layout: { x: 0, y, width, height } } });
const tap = (id: string, x: number, y = 40) =>
  act(() =>
    fireGestureHandler(getByGestureTestId(id), [
      { state: State.BEGAN, x, y },
      { state: State.ACTIVE, x, y },
      { state: State.END, x, y },
    ]),
  );

beforeEach(() => jest.clearAllMocks());

describe('pages per day', () => {
  const onOpenDay = jest.fn();
  const week = () =>
    mount(
      <DailyPagesChart title="Pages revised this week" days={7} today={TODAY} logs={logs} planned={() => 2} onOpenDay={onOpenDay} />,
      'revo-chart-dailyPages',
    );

  it('at rest: the title, what a tap does, a bar for each day and the plan behind it', async () => {
    await week();
    expect(text('revo-chart-dailyPages-title')).toBe('Pages revised this week');
    expect(text('revo-chart-dailyPages-line')).toBe('5 pages · tap a day to see it');
    expect(screen.getAllByTestId('revo-chart-bar')).toHaveLength(7);
    expect(screen.getByText('Planned', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('revo-chart-dailyPages-detail')).toBeNull();
  });

  it('a tap picks the day under the finger; its panel leads to that day in Activity; × puts it back', async () => {
    await week();
    layout('revo-chart-dailyPages-plot', 350, 130);
    tap('revo-chart-dailyPages-plot-tap', 20);
    expect(text('revo-chart-dailyPages-title')).toBe('Sunday 1 November');
    // No facts given: what was revised.
    expect(text('revo-chart-dailyPages-line')).toBe('2 pages revised');
    expect(screen.getByTestId('revo-chart-dailyPages-passage')).toBeTruthy();
    expect(screen.getByLabelText('1 weak, 0 moderate, 0 strong')).toBeTruthy();
    fireEvent.press(screen.getByTestId('revo-chart-dailyPages-day'));
    expect(onOpenDay).toHaveBeenCalledWith('2026-11-01');

    fireEvent.press(screen.getByTestId('revo-chart-dailyPages-close'));
    expect(text('revo-chart-dailyPages-title')).toBe('Pages revised this week');
    expect(screen.queryByTestId('revo-chart-dailyPages-detail')).toBeNull();
  });

  it('a day with no ratings shows no strip: the passage names it', async () => {
    await week();
    layout('revo-chart-dailyPages-plot', 350, 130);
    tap('revo-chart-dailyPages-plot-tap', 70);
    expect(text('revo-chart-dailyPages-title')).toBe('Monday 2 November');
    expect(screen.getByTestId('revo-chart-dailyPages-passage')).toBeTruthy();
    expect(screen.queryByLabelText(/weak, .* moderate, .* strong/)).toBeNull();
  });

  it('tapping the picked day again puts it back', async () => {
    await week();
    layout('revo-chart-dailyPages-plot', 350, 130);
    tap('revo-chart-dailyPages-plot-tap', 70);
    expect(text('revo-chart-dailyPages-title')).toBe('Monday 2 November');
    tap('revo-chart-dailyPages-plot-tap', 60);
    expect(text('revo-chart-dailyPages-title')).toBe('Pages revised this week');
  });

  it('a slide runs along the days with a tick for each new one, and leaves the last one open', async () => {
    await week();
    layout('revo-chart-dailyPages-plot', 350, 130);
    act(() =>
      fireGestureHandler(getByGestureTestId('revo-chart-dailyPages-plot-pan'), [
        { state: State.BEGAN, x: 20, y: 40 },
        { state: State.ACTIVE, x: 20, y: 40 },
        { state: State.ACTIVE, x: 30, y: 40 },
        { state: State.ACTIVE, x: 70, y: 40 },
        { state: State.ACTIVE, x: 120, y: 40 },
        { state: State.END, x: 120, y: 40 },
      ]),
    );
    expect(text('revo-chart-dailyPages-title')).toBe('Tuesday 3 November');
    expect(text('revo-chart-dailyPages-line')).toBe('Nothing revised');
    // Sunday, Monday, Tuesday: one tick each (the second Sunday sample adds none).
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('revo-chart-dailyPages-detail')).toBeTruthy();
  });

  it('VoiceOver: one adjustable element; swiping steps through the days, a double tap puts the pick back', async () => {
    await week();
    const plot = screen.getByTestId('revo-chart-dailyPages-plot');
    expect(plot.props.accessibilityRole).toBe('adjustable');
    expect(plot.props.accessibilityLabel).toContain('2 pages of 2 planned');
    fireEvent(plot, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(text('revo-chart-dailyPages-title')).toBe('Sunday 1 November');
    fireEvent(plot, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(text('revo-chart-dailyPages-title')).toBe('Monday 2 November');
    expect(screen.getByTestId('revo-chart-dailyPages-plot').props.accessibilityValue.text).toContain('Monday 2 November');
    fireEvent(plot, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(text('revo-chart-dailyPages-title')).toBe('Sunday 1 November');
    fireEvent(plot, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(text('revo-chart-dailyPages-title')).toBe('Pages revised this week');
  });

  it('30 days: dates instead of letters, and no grey bars when the plan isn’t known', async () => {
    await mount(<DailyPagesChart title="This month" days={30} today={TODAY} logs={logs} />, 'revo-chart-dailyPages');
    expect(screen.getAllByTestId('revo-chart-bar')).toHaveLength(30);
    expect(screen.queryByText('Planned', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('revo-chart-dailyPages-day')).toBeNull();
  });
});

describe('page ratings', () => {
  const onReviseFirst = jest.fn(async () => undefined);
  const onOpenPage = jest.fn();
  const ratings = () =>
    mount(
      <PageRatingsChart
          title="Two that slip"
          pages={[583, 584]}
          today={TODAY}
          logs={logs}
          userPages={[page(583, { weaknessRating: 1, lastRevisedDate: '2026-11-06T09:00:00.000Z' }), page(584)]}
          onReviseFirst={onReviseFirst}
          onOpenPage={onOpenPage}
        />,
      'revo-chart-pageRatings',
    );
  const rows = () => {
    layout('revo-chart-pageRatings-plot', 310, 140);
    const [a, b] = screen.getAllByTestId('revo-chart-pageRatings-row');
    fireEvent(a, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 310, height: 45 } } });
    fireEvent(b, 'layout', { nativeEvent: { layout: { x: 0, y: 45, width: 310, height: 45 } } });
  };

  it('a tap on a dot: its rating, its day and the gap before it; the panel names the passage', async () => {
    await ratings();
    rows();
    // 6 November sits at 30/30 of the line: x = 310.
    tap('revo-chart-pageRatings-plot-tap', 305, 30);
    expect(text('revo-chart-pageRatings-title')).toMatch(/ · weak$/);
    expect(text('revo-chart-pageRatings-line')).toBe('6 November, 5 days after the time before');
    expect(text('revo-chart-pageRatings-passage')).toMatch(/· Juz 30/);
    expect(screen.getByText('Weak now · rated weak twice in 31 days · revised yesterday')).toBeTruthy();
  });

  it('a tap on a row away from its dots picks the row', async () => {
    await ratings();
    rows();
    tap('revo-chart-pageRatings-plot-tap', 150, 70);
    expect(text('revo-chart-pageRatings-line')).toBe('No ratings in 31 days');
  });

  it('Revise first tomorrow waits for the tap, then says so; Open in the reader opens the page', async () => {
    await ratings();
    rows();
    tap('revo-chart-pageRatings-plot-tap', 150, 20);
    fireEvent.press(screen.getByTestId('revo-chart-pageRatings-reader'));
    expect(onOpenPage).toHaveBeenCalledWith(583);
    expect(onReviseFirst).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('revo-chart-pageRatings-revise'));
    expect(onReviseFirst).toHaveBeenCalledWith([583]);
    expect(await screen.findByTestId('revo-chart-pageRatings-revise-added')).toBeTruthy();
  });
});

describe('juz map', () => {
  // Juz 28 memorized (p. 542–561) and revised Nov 1; Juz 30's first ten pages being learned.
  const juz28 = Array.from({ length: 20 }, (_, i) => page(542 + i, { lastRevisedDate: '2026-11-01', weaknessRating: i === 6 ? 2 : 4 }));
  const juzLogs = [log('2026-11-01', Array.from({ length: 20 }, (_, i) => 542 + i))];
  const onReviseFirst = jest.fn(async () => undefined);
  const onOpenPage = jest.fn();
  const map = () =>
    mount(
      <JuzMapChart
        title="Your juz · last revised"
        today={TODAY}
        logs={juzLogs}
        userPages={[...juz28, page(582, { status: 'in_progress' })]}
        preview={() => 'Revised 1× in 30 days · 1 weak spot'}
        onReviseFirst={onReviseFirst}
        onOpenPage={onOpenPage}
      />,
      'revo-chart-juzMap',
    );

  it('at rest: Insights’ 30 tiles and what a tap does', async () => {
    await map();
    expect(screen.getAllByText(/^\d+$/)).toHaveLength(30);
    expect(text('revo-chart-juzMap-line')).toBe('Tap a juz to see it');
    expect(screen.getByTestId('revo-chart-juzMap-plot').props.accessibilityLabel).toContain('Revised this week: Juz 28');
  });

  it('a tap picks the juz under the finger: when it was last revised, its strip, and where to go', async () => {
    await map();
    layout('revo-chart-juzMap-plot', 370, 104);
    // Juz 28: third row, eighth column.
    tap('revo-chart-juzMap-plot-tap', 7.5 * 37, 90);
    expect(text('revo-chart-juzMap-title')).toBe('Juz 28 · last revised 6 days ago');
    expect(screen.getByText('Revised 1× in 30 days · 1 weak spot')).toBeTruthy();
    expect(screen.getByLabelText('1 weak, 0 moderate, 19 strong')).toBeTruthy();
    fireEvent.press(screen.getByTestId('revo-chart-juzMap-reader'));
    expect(onOpenPage).toHaveBeenCalledWith(542);
    fireEvent.press(screen.getByTestId('revo-chart-juzMap-revise'));
    expect(onReviseFirst).toHaveBeenCalledWith(Array.from({ length: 20 }, (_, i) => 542 + i));
    expect(await screen.findByTestId('revo-chart-juzMap-revise-added')).toBeTruthy();
  });

  it('a juz not memorized opens in the reader, with nothing to revise', async () => {
    await map();
    const plot = screen.getByTestId('revo-chart-juzMap-plot');
    fireEvent(plot, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(text('revo-chart-juzMap-title')).toBe('Juz 1 · not memorized');
    expect(screen.queryByTestId('revo-chart-juzMap-revise')).toBeNull();
    expect(screen.getByTestId('revo-chart-juzMap-reader')).toBeTruthy();
    // Juz 30 is being learned.
    fireEvent(plot, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    fireEvent(plot, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    fireEvent(plot, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(text('revo-chart-juzMap-title')).toBe('Juz 30 · being learned');
  });
});

describe('timeline', () => {
  // 582–583 revised Nov 1 (583 weak) and Nov 6 (583 weak): two dots, at 0 and 5/6 of the line.
  const onOpenDay = jest.fn();
  const line = (passage: number[] = [582, 583]) =>
    mount(<TimelineChart title="End of An-Naba" passage={passage} days={30} today={TODAY} logs={logs} onOpenDay={onOpenDay} />, 'revo-chart-timeline');

  it('a tap on a dot: its day, rating and the gap before it; the panel leads to that day', async () => {
    await line();
    expect(text('revo-chart-timeline-line')).toBe('2 revisions · tap one to see it');
    expect(screen.getAllByTestId('revo-chart-revision')).toHaveLength(2);
    // The line sits 7 in from each side of a 314-wide plot: 300 wide.
    layout('revo-chart-timeline-plot', 314, 80);
    tap('revo-chart-timeline-plot-tap', 7 + 250);
    expect(text('revo-chart-timeline-title')).toBe('Friday 6 November · weak');
    expect(text('revo-chart-timeline-line')).toBe('5 days after the time before');
    fireEvent.press(screen.getByTestId('revo-chart-timeline-day'));
    expect(onOpenDay).toHaveBeenCalledWith('2026-11-06');
    // Away from any dot: nothing changes.
    tap('revo-chart-timeline-plot-tap', 7 + 120);
    expect(text('revo-chart-timeline-title')).toBe('Friday 6 November · weak');
    tap('revo-chart-timeline-plot-tap', 7 + 2);
    expect(text('revo-chart-timeline-line')).toBe('The first time in this view');
  });

  it('a slide runs from dot to dot, a tick for each', async () => {
    await line();
    layout('revo-chart-timeline-plot', 314, 80);
    act(() =>
      fireGestureHandler(getByGestureTestId('revo-chart-timeline-plot-pan'), [
        { state: State.BEGAN, x: 10, y: 30 },
        { state: State.ACTIVE, x: 10, y: 30 },
        { state: State.ACTIVE, x: 100, y: 30 },
        { state: State.ACTIVE, x: 240, y: 30 },
        { state: State.END, x: 240, y: 30 },
      ]),
    );
    expect(text('revo-chart-timeline-title')).toBe('Friday 6 November · weak');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });

  it('never revised in the window: it says so, and has nothing to pick', async () => {
    await line([600]);
    expect(text('revo-chart-timeline-line')).toBe('Not revised in 30 days');
    fireEvent(screen.getByTestId('revo-chart-timeline-plot'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(text('revo-chart-timeline-title')).toBe('End of An-Naba');
  });
});

describe('weeks grid', () => {
  // Saturday Nov 7; the first session Nov 1. Sunday done, Monday in part, Tuesday missed.
  const facts = (day: string): RevoDayFacts | null => {
    const plan = { '2026-11-01': [2, 0, true], '2026-11-02': [2, 1, false], '2026-11-03': [2, 2, false] }[day] as [number, number, boolean] | undefined;
    return {
      daysAgo: 0,
      plan: plan ? { pages: plan[0], carried: 0, onDay: plan[0] - plan[1], ahead: 0, late: 0, notDone: plan[1], done: plan[2] } : null,
      revised: { pages: 0, forLater: 0, forEarlier: 0 },
      minutes: day === '2026-11-01' ? 20 : null,
      readMinutes: null,
      memorized: { pages: 0 },
      ratings: { weak: 0, moderate: 0, strong: 0, weakPages: [] },
      recordings: null,
      notes: null,
    };
  };
  const onOpenDay = jest.fn();
  const grid = () => mount(<WeeksChart title="Since 1 November" weeks={4} today={TODAY} logs={logs} facts={facts} onOpenDay={onOpenDay} />, 'revo-chart-weeks');

  it('a weekday’s letter picks its column: how many were missed, and which', async () => {
    await grid();
    expect(screen.getAllByTestId('revo-chart-week-day')).toHaveLength(28);
    fireEvent.press(screen.getByTestId('revo-chart-weeks-col-2'));
    expect(text('revo-chart-weeks-title')).toBe('Tuesdays · 1 missed of 1');
    expect(text('revo-chart-weeks-line')).toBe('Missed 3 Nov');
    expect(screen.getByLabelText('Tuesdays').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('revo-chart-weeks-col-2'));
    expect(text('revo-chart-weeks-title')).toBe('Since 1 November');
  });

  it('a cell picks its day, with that day in Activity; days before the first session can’t be picked', async () => {
    await grid();
    layout('revo-chart-weeks-plot', 370, 100);
    // Sunday of the last row: x past the month column, y in the fourth row.
    tap('revo-chart-weeks-plot-tap', 39 + 10, 90);
    expect(text('revo-chart-weeks-title')).toBe('Sunday 1 November');
    expect(text('revo-chart-weeks-line')).toBe('Done · 2 of 2 pages · 20 min');
    fireEvent.press(screen.getByTestId('revo-chart-weeks-day'));
    expect(onOpenDay).toHaveBeenCalledWith('2026-11-01');
    fireEvent.press(screen.getByTestId('revo-chart-weeks-close'));
    tap('revo-chart-weeks-plot-tap', 39 + 10, 10);
    expect(text('revo-chart-weeks-title')).toBe('Since 1 November');
  });

  it('VoiceOver steps through the days from the first session', async () => {
    await grid();
    const plot = screen.getByTestId('revo-chart-weeks-plot');
    fireEvent(plot, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(text('revo-chart-weeks-title')).toBe('Sunday 1 November');
    fireEvent(plot, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(text('revo-chart-weeks-title')).toBe('Monday 2 November');
  });
});

describe('ChartCard', () => {
  it('draws nothing for a kind this app doesn’t know', async () => {
    render(
      <ThemeProvider>
        <ChartCard chart={{ kind: 'weeksAhead', title: 'Your juz' } as never} day={TODAY} />
        <ChartCard chart={{ kind: 'dailyPages', title: 'Week', days: 7 }} day={TODAY} />
      </ThemeProvider>,
    );
    await screen.findByTestId('revo-chart-dailyPages');
    expect(screen.queryByText('Your juz')).toBeNull();
  });

  it('draws the kinds it knows, flat (no card behind them)', async () => {
    await mount(<ChartCard chart={{ kind: 'dailyPages', title: 'Week', days: 7 }} day={TODAY} />, 'revo-chart-dailyPages');
    expect(screen.getByTestId('revo-chart-dailyPages').props.style).not.toEqual(expect.objectContaining({ backgroundColor: expect.anything() }));
  });
});
