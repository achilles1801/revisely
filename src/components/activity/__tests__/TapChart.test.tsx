// Insights' one chart (BEHAVIOUR.md ACT-41): a tap picks a bar and the others fade, the same bar clears it, no
// press-and-hold; stacked parts in their colours; values and labels as the rule says (their rules: the property test).
import React from 'react';
import { StyleSheet } from 'react-native';
import { Dimensions } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { chartLayout, ChartPills, MAX_BAR_WIDTH, MIN_SLOTS, TapChart, type ChartBar } from '../TapChart';

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
    expect(screen.getByTestId('chart-label-w5')).toHaveTextContent('');
    fireEvent.press(screen.getByTestId('chart-bar-w5'));
    expect(screen.getByTestId('chart-label-w5')).toHaveTextContent('L5');
    expect(screen.getByText('6')).toBeTruthy();
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
});

