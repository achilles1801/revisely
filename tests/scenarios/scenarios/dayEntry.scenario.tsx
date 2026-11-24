// The picked day under Overview's calendar, as one entry (BEHAVIOUR.md ACT-34, Revisely Dev; Majd, Nov 23 2026: "the thing being
// modified should be the journal entries beneath it; also i dont think we need to put "journal" for each entry").
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CalendarMonth } from '../../../src/components/activity/CalendarMonth';
import type { Revised } from '../../../src/lib/activityInsights';

const mockPalette = new Proxy({}, { get: () => '#000000' });
jest.mock('../../../src/context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));

type Node = ReturnType<typeof screen.getByTestId>;

const DAY = '2026-11-22';
const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const revised: Revised = { day: DAY, countsFor: DAY, pages: [5, 6], assigned: [5, 6], minutes: 31 } as Revised;

function show(opts: { items?: Revised[]; note?: string | null; memorized?: { day: string; pages: number[] }[]; spot?: { tests: number; stopped: number; pages: number[] } } = {}) {
  const onOpen = jest.fn();
  const onAddNote = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <CalendarMonth
        month="2026-11"
        week="2026-11-22"
        span="month"
        onSpan={jest.fn()}
        today={DAY}
        picked={DAY}
        data={{ revised: opts.items ?? [], memorized: (opts.memorized ?? []) as never, read: [], noteDays: new Set(opts.note ? [DAY] : []) }}
        onStep={jest.fn()}
        onPick={jest.fn()}
        onOpen={onOpen}
        noteOf={() => opts.note ?? null}
        onAddNote={onAddNote}
        spotTests={opts.spot ? new Map([[DAY, opts.spot]]) : undefined}
      />
    </SafeAreaProvider>,
  );
  return { onOpen, onAddNote };
}

describe('a day’s entry under the calendar', () => {
  it('[ACT-34] the date and its lines are one button that opens the day: no Open, no Journal label, the note last', () => {
    const { onOpen } = show({ items: [revised], note: 'Slow down at the second page', memorized: [{ day: DAY, pages: [7] }] });
    expect(screen.queryByText('Open')).toBeNull();
    expect(screen.queryByText(/journal/i)).toBeNull();
    const entry = screen.getByTestId('preview-open');
    const lines = entry
      .findAll((n: Node) => typeof n.type === 'string' && /^preview-row-/.test(String(n.props.testID ?? '')))
      .map((n: Node) => n.props.testID);
    expect(lines).toEqual(['preview-row-revised', 'preview-row-memorized', 'preview-row-notes']);
    expect(screen.getByTestId('preview-value-notes').props.children).toBe('Slow down at the second page');
    expect(screen.queryByTestId('preview-add-note')).toBeNull();
    fireEvent.press(screen.getByTestId('preview-row-memorized'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(DAY);
  });

  it('[ACT-34] a day with no note offers Add a note, its one other action', () => {
    const { onOpen, onAddNote } = show({ items: [revised] });
    expect(screen.queryByTestId('preview-row-notes')).toBeNull();
    fireEvent.press(screen.getByTestId('preview-add-note'));
    expect(onAddNote).toHaveBeenCalledWith(DAY);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('[ACT-34] a line never grows into long small text, however many takes or places', () => {
    const scattered: Revised = { day: DAY, countsFor: DAY, pages: [2, 4, 322, 400, 500, 604], minutes: 12 } as Revised;
    show({ items: [scattered] });
    const value = screen.getByTestId('preview-value-revised');
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBeUndefined();
    expect(String(value.props.children).length).toBeLessThanOrEqual(30);
    expect(value.props.children).toMatch(/and \d+ more$/);
    expect(String(screen.getByTestId('preview-tail-revised').props.children)).toContain('6 pages');
  });

  it('[ACT-34] a spot test is its own line, saying how it went, however many there are', () => {
    show({ spot: { tests: 1, stopped: 1, pages: [2] } });
    expect(screen.getByTestId('preview-row-spot')).toBeTruthy();
    expect(screen.queryByTestId('preview-row-recited')).toBeNull();
    expect(String(screen.getByTestId('preview-tail-spot').props.children)).toContain('Stopped early');
  });

  it('[ACT-34] many spot tests stay one short line', () => {
    show({ spot: { tests: 3, stopped: 1, pages: [2, 322, 500] } });
    const value = screen.getByTestId('preview-value-spot');
    expect(value.props.adjustsFontSizeToFit).toBeUndefined();
    expect(String(value.props.children).length).toBeLessThanOrEqual(30);
    expect(String(screen.getByTestId('preview-tail-spot').props.children)).toContain('3 tests · 1 stopped early');
  });

  it('[ACT-34] a day with nothing says so, and can still take a note', () => {
    show();
    expect(screen.getByTestId('preview-nothing')).toBeTruthy();
    expect(screen.getByTestId('preview-add-note')).toBeTruthy();
  });
});
