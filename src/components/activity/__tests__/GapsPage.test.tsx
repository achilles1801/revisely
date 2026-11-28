// Gaps on its own page (ACT-42). Majd's rule for every screen (Nov 27 2026: "plz ensure something like this never happens
// (garbage ui)"): 0, 1, a few and many data points, a young account, the longest values, an SE and a Pro Max, the
// largest text. Each fails here on a value that would wrap or clip, or a day grid that collapses.
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { GapsPage, gridShape, CELL_MAX, tileRoom, tilesStack, TILE_MIN_SHRINK } from '../GapsPage';
import { compactDuration, gapsView } from '../../../lib/insightsGaps';
import { textWidth } from '../../../../jest/textWidth';
import { STACK_AT_SCALE } from '../ChromeText';

const mockPalette = new Proxy({}, { get: (_t, k) => (k === 'red' ? '#DC2626' : '#000000') });
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));

const TODAY = '2026-11-27';
const SE = 320;
const PRO_MAX = 440;
const dayBefore = (n: number) => new Date(Date.UTC(2026, 10, 27 - n)).toISOString().slice(0, 10);
const revisedOn = (days: string[]) => days.map((day) => ({ day, pages: [582] }));
/** Every day of the last `span` days but those `off` days back. */
const allBut = (span: number, off: number[]) => Array.from({ length: span }, (_, i) => i).filter((i) => !off.includes(i)).map(dayBefore);

function renderPage(days: string[], window: number, firstDay: string, before: string | null = 'the 3 months before') {
  const revised = revisedOn(days);
  const view = gapsView({ revised, today: TODAY, window, firstDay, knownSince: firstDay })!;
  const onOpenCalendar = jest.fn();
  render(
    <GapsPage
      view={view}
      revised={revised}
      today={TODAY}
      window={window}
      inWords="in 3 months"
      lastWords="last 3 months"
      before={before}
      firstDay={firstDay}
      knownSince={firstDay}
      onOpenCalendar={onOpenCalendar}
    />,
  );
  return { view, onOpenCalendar };
}

/** Lays the day grid out at a screen's width (less the page's margins and the card's padding). */
function layOut(screenWidth: number) {
  act(() => {
    fireEvent(screen.getByTestId('insights-gaps-grid'), 'layout', { nativeEvent: { layout: { width: screenWidth - 64, height: 0 } } });
  });
}
const cellSize = (day: string) => (screen.getByTestId(`insights-gaps-day-${day}`).props.style as object[]).reduce((s: any, x: any) => ({ ...s, ...x }), {}).width as number;

describe('[ACT-42] Gaps’ own page', () => {
  it('a young account (1 day): 0 gaps, no tiles, no patterns, one day', () => {
    renderPage([TODAY], 90, TODAY, null);
    expect(within(screen.getByTestId('insights-gaps-hero')).getByText('0')).toBeTruthy();
    expect(screen.queryByTestId('insights-gaps-tiles')).toBeNull();
    expect(screen.queryByTestId('insights-gaps-hero-trend')).toBeNull();
    expect(screen.queryByTestId('insights-gaps-patterns')).toBeNull();
    layOut(SE);
    expect(cellSize(TODAY)).toBe(CELL_MAX);
  });

  it('a young account (2 weeks) at a longer range: the card names its real span, as the figure does, never "last 3 months"', () => {
    const first = dayBefore(13);
    renderPage(allBut(14, [3, 7, 10]), 90, first, null);
    const title = within(screen.getByTestId('insights-gaps-days')).getAllByText(/^Every day, /)[0].props.children;
    expect([title].flat().join('')).toMatch(/^Every day, since \d+ \w+$/);
    expect(screen.queryByText('Every day, last 3 months')).toBeNull();
  });

  it('one gap: one tile, "your only gap", with its dates', () => {
    renderPage(allBut(30, [10, 11, 12]), 30, dayBefore(29), null);
    const tiles = screen.getByTestId('insights-gaps-tiles');
    expect(within(tiles).getByText('your only gap')).toBeTruthy();
    expect(within(tiles).getByText('3 days')).toBeTruthy();
  });

  it('a few gaps: longest and most recent with dates, the usual between them; a tap on a gap says it, again clears it', () => {
    const { view, onOpenCalendar } = renderPage(allBut(90, [3, 4, 30, 31, 32, 33, 60, 61]), 90, dayBefore(200));
    expect(screen.getByTestId('insights-gaps-tile-longest')).toBeTruthy();
    expect(screen.getByTestId('insights-gaps-tile-recent')).toBeTruthy();
    expect(within(screen.getByTestId('insights-gaps-tile-between')).getByText('usually between gaps')).toBeTruthy();
    expect(screen.getByTestId('insights-gaps-picked').props.children).toBe('82 of 90 days revised');
    const recent = view.gaps[view.gaps.length - 1];
    layOut(SE);
    fireEvent.press(screen.getByTestId(`insights-gaps-day-${recent.last}`));
    expect(within(screen.getByTestId('insights-gaps-picked')).getByText(/· 2 days/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('insights-gaps-picked'));
    expect(onOpenCalendar).toHaveBeenCalledWith(recent.first.slice(0, 7), expect.objectContaining({ from: recent.first }));
    fireEvent.press(screen.getByTestId(`insights-gaps-day-${recent.first}`));
    expect(screen.getByTestId('insights-gaps-picked').props.children).toBe('82 of 90 days revised');
  });

  it('many gaps over a year: the grid never collapses on an SE and fits a Pro Max', () => {
    const off = Array.from({ length: 365 }, (_, i) => i).filter((i) => i % 9 === 3 || i % 9 === 4);
    renderPage(allBut(365, off), 365, dayBefore(800), 'the year before');
    for (const width of [SE, PRO_MAX]) {
      layOut(width);
      const { columns, gap } = gridShape(365);
      const size = cellSize(dayBefore(0));
      expect(size).toBeGreaterThanOrEqual(8);
      expect(size * columns + gap * (columns - 1)).toBeLessThanOrEqual(width - 64);
    }
  });

  it('the trend against the range before: fewer gaps, the good way, with what it compares', () => {
    // The 3 months before had four gaps; these 3 months one.
    const before = [100, 101, 120, 121, 140, 141, 160, 161].map((n) => n);
    renderPage(allBut(180, [10, 11, ...before]), 90, dayBefore(400));
    expect(within(screen.getByTestId('insights-gaps-hero-trend')).getByText('from 4')).toBeTruthy();
    expect(within(screen.getByTestId('insights-gaps-trend-row')).getByText('Gaps are rarer')).toBeTruthy();
  });
});

describe('[ACT-42] tile values never wrap or clip, at any length, on an SE or a Pro Max, up to the largest text', () => {
  // The longest each kind can be: days just under 2 weeks, weeks, months, years, and a gap of unknown start.
  const values = [13, 41, 364, 3650].map((d) => compactDuration(d)).concat([compactDuration(400, false, true), compactDuration(13, true)]);
  for (const width of [SE, PRO_MAX]) {
    for (const scale of [1, 1.1, STACK_AT_SCALE - 0.01, STACK_AT_SCALE, 1.6]) {
      for (const n of [2, 3]) {
        it(`${width}pt, text ×${scale}, ${n} tiles`, () => {
          const set = values.slice(0, n);
          for (const v of values) {
            const row = [v, ...set.slice(1)];
            const room = tilesStack(row, width, scale) ? tileRoom(width, 1) : tileRoom(width, row.length);
            expect(textWidth(v, 'figure@20', scale) * TILE_MIN_SHRINK).toBeLessThanOrEqual(room);
          }
        });
      }
    }
  }
});
