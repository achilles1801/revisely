// Insights' one chart (BEHAVIOUR.md ACT-41): a tap picks a bar and the others fade, the same bar clears it, no
// press-and-hold; stacked parts in their colours; values and labels as the rule says (their rules: the property test).
import React from 'react';
import { StyleSheet } from 'react-native';
import { Dimensions } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { chartLayout, ChartPills, LABEL_WIDTH, MAX_BAR_WIDTH, MIN_SLOTS, TapChart, type ChartBar } from '../TapChart';

const mockPalette = require('../../../theme/v2').paletteV2(false, 'crimson');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));

const bars = (n: number, parts = false): ChartBar[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `w${i}`,
    value: i + 1,
    ...(parts ? { parts: [1, i] } : {}),
    valueText: String(i + 1),
    label: `L${i}`,
    spoken: `Week ${i}, ${i + 1}`,
  }));
const opacity = (id: string) => StyleSheet.flatten(screen.getByTestId(id.replace('-bar-', '-fill-')).props.style).opacity;

function Harness({ n = 5, parts = false, onPick = jest.fn() }: { n?: number; parts?: boolean; onPick?: (k: string | null) => void }) {
  const [picked, setPicked] = React.useState<string | null>(null);
  return (
    <TapChart
      bars={bars(n, parts)}
      picked={picked}
      onPick={(k) => {
        onPick(k);
        setPicked(k);
      }}
      colours={['red', 'amber']}
      testID="chart"
    />
  );
}

describe('[ACT-41] the chart', () => {
  it('a tap picks a bar and the others fade; the same bar again clears it; each bar is a button VoiceOver reads', () => {
    const onPick = jest.fn();
    render(<Harness onPick={onPick} />);
    const bar = screen.getByTestId('chart-bar-w2');
    expect(bar.props.accessibilityRole).toBe('button');
    expect(bar.props.accessibilityLabel).toBe('Week 2, 3');
    expect(opacity('chart-bar-w0')).toBe(1);
    fireEvent.press(bar);
    expect(onPick).toHaveBeenLastCalledWith('w2');
    expect(screen.getByTestId('chart-bar-w2').props.accessibilityState).toEqual({ selected: true });
    expect(opacity('chart-bar-w0')).toBe(0.45);
    expect(opacity('chart-bar-w2')).toBe(1);
    fireEvent.press(screen.getByTestId('chart-bar-w2'));
    expect(onPick).toHaveBeenLastCalledWith(null);
    expect(opacity('chart-bar-w0')).toBe(1);
    // No bar asks for a press-and-hold.
    expect(screen.getByTestId('chart-bar-w2').props.onLongPress).toBeUndefined();
  });

  it('values over every bar up to 7; past that over the lit one; labels past 10 the ends and the pick', () => {
    render(<Harness n={12} />);
    expect(screen.queryAllByText(/^\d+$/)).toHaveLength(1);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByTestId('chart-label-w0')).toHaveTextContent('L0');
    expect(screen.queryByTestId('chart-label-w5')).toBeNull();
    fireEvent.press(screen.getByTestId('chart-bar-w5'));
    expect(screen.getByTestId('chart-label-w5')).toHaveTextContent('L5');
    expect(screen.getByText('6')).toBeTruthy();
  });

  // A year of weeks on an SE: a slot is about 3 pt, and a label held to it ("31 Aug") was cut to nothing (ACT-43).
  it.each([
    [320, 1],
    [320, 3.1],
    [440, 1],
  ])('past 10 bars each label has room of its own, inside the chart, never cut to its slot (%i pt, text ×%s)', (width, fontScale) => {
    const dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height: 800, scale: 3, fontScale });
    try {
      const chart = width - 32;
      const labelWidth = Math.min(chart / 2, LABEL_WIDTH * Math.min(fontScale, 1.4));
      render(<Harness n={52} />);
      const shown = () =>
        screen.queryAllByTestId(/^chart-label-/).map((el) => StyleSheet.flatten(el.props.style) as { left: number; width: number; textAlign: string });
      const check = () => {
        for (const s of shown()) {
          expect(s.width).toBe(labelWidth);
          expect(s.left).toBeGreaterThanOrEqual(0);
          expect(s.left + s.width).toBeLessThanOrEqual(chart + 1e-6);
        }
        // Never two labels over each other.
        const spans = shown().map((s) => [s.left, s.left + s.width]).sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 1e-6);
      };
      check();
      expect(shown().map((s) => s.textAlign)).toEqual(['left', 'right']);
      // Picked near an end, the end gives way; picked in the middle, all three.
      fireEvent.press(screen.getByTestId('chart-bar-w2'));
      check();
      expect(screen.queryByTestId('chart-label-w0')).toBeNull();
      fireEvent.press(screen.getByTestId('chart-bar-w2'));
      fireEvent.press(screen.getByTestId('chart-bar-w26'));
      check();
      expect(screen.getByTestId('chart-label-w26')).toHaveTextContent('L26');
      expect(shown().length).toBeGreaterThanOrEqual(2);
    } finally {
      dims.mockRestore();
    }
  });

  it('a bar may have a colour of its own', () => {
    render(
      <TapChart
        bars={[{ key: 'a', value: 2, colour: 'teal', label: 'A', spoken: 'A' }, { key: 'b', value: 1, label: 'B', spoken: 'B' }]}
        picked={null}
        onPick={jest.fn()}
        colours={['red']}
        testID="chart"
      />,
    );
    expect(StyleSheet.flatten(screen.getByTestId('chart-part-a-0').props.style).backgroundColor).toBe('teal');
    expect(StyleSheet.flatten(screen.getByTestId('chart-part-b-0').props.style).backgroundColor).toBe('red');
  });

  it('a stacked bar draws its parts in their colours, bottom first', () => {
    render(<Harness n={3} parts />);
    const part = (k: number) => StyleSheet.flatten(screen.getByTestId(`chart-part-w2-${k}`).props.style);
    expect(part(0).backgroundColor).toBe('red');
    expect(part(1).backgroundColor).toBe('amber');
    expect([part(0).flex, part(1).flex]).toEqual([1, 2]);
  });

  it('its choices are small pills, the chosen one solid', () => {
    const onChange = jest.fn();
    render(<ChartPills options={[{ key: '4w', label: '4 weeks' }, { key: '3m', label: '3 months' }, { key: '1y', label: 'Year' }]} value="3m" onChange={onChange} testID="range" />);
    fireEvent.press(screen.getByTestId('range-1y'));
    expect(onChange).toHaveBeenCalledWith('1y');
  });
});

describe('[ACT-41] never one block, never an empty frame (Majd: "plz ensure something like this never happens (garbage ui)")', () => {
  let dims: jest.SpyInstance | null = null;
  afterEach(() => {
    dims?.mockRestore();
    dims = null;
  });
  // An iPhone SE and a Pro Max (Majd's).
  it.each([320, 440])('at %i pt: 0 points says so; 1, 2, 3 and many keep each bar narrow, in at least 7 slots', (width) => {
    dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height: 800, scale: 3, fontScale: 1 });
    for (const n of [0, 1, 2, 3, 12, 30, 90]) {
      render(<TapChart bars={bars(n)} picked={null} onPick={jest.fn()} colours={['red']} testID="chart" />);
      if (n === 0) {
        expect(screen.getByTestId('chart-empty')).toHaveTextContent('Nothing here yet in this range');
        expect(screen.queryAllByRole('button')).toHaveLength(0);
      } else {
        const layout = chartLayout(n, width - 32);
        expect(screen.queryAllByTestId('chart-slot-empty')).toHaveLength(Math.max(0, MIN_SLOTS - n));
        for (const b of bars(n)) {
          const w = StyleSheet.flatten(screen.getByTestId(`chart-fill-${b.key}`).props.style).width as number;
          expect(w).toBeGreaterThan(0);
          expect(w).toBeLessThanOrEqual(MAX_BAR_WIDTH);
          expect(w).toBe(layout.bar);
        }
        // A lone bar is one slot of seven, never the chart's width.
        expect(layout.slots * layout.bar).toBeLessThanOrEqual(width - 32);
      }
      screen.unmount();
    }
  });

  // A young account's Day view drew one bar at the far right of an empty area with no other labels (Nov 28 2026).
  it.each([320, 440])('at %i pt: a timeline, never a bar floating alone: each empty slot has a mark, the first and last slots a label', (width) => {
    dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height: 800, scale: 3, fontScale: 1 });
    for (const n of [1, 2, 3, 12, 30]) {
      render(<TapChart bars={bars(n)} picked={null} onPick={jest.fn()} colours={['red']} testID="chart" slotLabel={(before) => `B${before}`} />);
      const lead = Math.max(0, MIN_SLOTS - n);
      // Each empty slot holds a faint mark on the baseline, as wide as a bar.
      const marks = screen.queryAllByTestId('chart-mark');
      expect(marks).toHaveLength(lead);
      for (const m of marks) {
        const style = StyleSheet.flatten(m.props.style);
        expect(style.width).toBe(chartLayout(n, width - 32).bar);
        expect(style.backgroundColor).toBe(mockPalette.track);
      }
      // The first slot is labelled: the slot before the bars by what it stands for (the first, `lead` slots back), or the
      // first bar; the last bar too.
      if (lead > 0) expect(screen.getByTestId('chart-label-first')).toHaveTextContent(`B${lead}`);
      else {
        expect(screen.queryByTestId('chart-label-first')).toBeNull();
        expect(screen.getByTestId('chart-label-w0')).toHaveTextContent('L0');
      }
      expect(screen.getByTestId(`chart-label-w${n - 1}`)).toHaveTextContent(`L${n - 1}`);
      screen.unmount();
    }
  });

  it('a bar of nothing keeps its slot as a mark on the baseline, and stays a button', () => {
    const withZero = bars(3).map((b, i) => (i === 1 ? { ...b, value: 0, valueText: undefined } : b));
    render(<TapChart bars={withZero} picked={null} onPick={jest.fn()} colours={['red']} testID="chart" />);
    expect(screen.queryByTestId('chart-fill-w1')).toBeNull();
    // Four empty slots before the bars and the bar of nothing.
    expect(screen.queryAllByTestId('chart-mark')).toHaveLength(MIN_SLOTS - 3 + 1);
    expect(screen.getByTestId('chart-bar-w1').props.accessibilityRole).toBe('button');
  });
});

