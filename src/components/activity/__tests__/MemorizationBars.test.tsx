// [MEM-12] Memorization's chart always reads as a chart: a bar is never wider than its widest (28pt a month, 14 a day),
// and the axis has at least its fewest slots (6 months, 7 days), now at the right, so 1, 2 or 3 bars never become one
// block across the screen (Majd, Nov 28 2026, one month drawn the screen's width: "plz ensure something like this never
// happens (garbage ui)"). At an iPhone SE's width and a Pro Max's, with 1, 2, 3 and many bars, by month and by day. The
// chart is Insights' one chart (TapChart, ACT-41) with Memorization's numbers (MEM_CHART).
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { LinearGradient } from 'expo-linear-gradient';
jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2 } = require('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(true), theme: {}, isDark: true }) };
});
import { MEM_CHART, TapChart } from '../TapChart';

type Unit = 'month' | 'day';
// The section's content width: the screen less its 16pt gutters.
const WIDTHS = { 'iPhone SE': 375 - 32, 'iPhone Pro Max': 440 - 32 };

function series(unit: Unit, n: number): { key: string; pages: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    key: unit === 'month' ? `2026-${String(12 - n + 1 + i).padStart(2, '0')}` : `2026-11-${String(28 - n + 1 + i).padStart(2, '0')}`,
    pages: i === n - 1 ? 74 : 3 + i,
  }));
}

async function chart(unit: Unit, n: number, width: number) {
  const id = `insights-memorization-bars-${unit}`;
  const screen = render(
    <TapChart
      bars={series(unit, n).map((x) => ({ key: x.key, value: x.pages, label: x.key.slice(-2), spoken: x.key }))}
      picked={null}
      onPick={() => {}}
      colours={['#000000']}
      gradient={['#000000', '#111111']}
      testID={id}
      maxBar={MEM_CHART[unit].maxBar}
      minSlots={MEM_CHART[unit].minSlots}
    />,
  );
  await act(async () => {
    fireEvent(screen.getByTestId(id), 'layout', { nativeEvent: { layout: { width, height: 120, x: 0, y: 0 } } });
  });
  const bars = screen.UNSAFE_getAllByType(LinearGradient).map((b) => StyleSheet.flatten(b.props.style).width as number);
  const slots = bars.length + screen.queryAllByTestId(`${id}-slot-empty`).length;
  screen.unmount();
  return { bars, slots };
}

describe.each(Object.entries(WIDTHS))('[MEM-12] the memorization chart at %s width', (_device, width) => {
  describe.each([
    ['month', [1, 2, 3, 12]],
    ['day', [1, 2, 3, 30]],
  ] as const)('by %s', (unit, counts) => {
    it.each(counts)('%i bars: none wider than its widest, at least its fewest slots, never one block', async (n) => {
      const { bars, slots } = await chart(unit, n, width);
      expect(bars).toHaveLength(n);
      for (const w of bars) {
        expect(w).toBeGreaterThan(0);
        expect(w).toBeLessThanOrEqual(MEM_CHART[unit].maxBar);
      }
      expect(slots).toBeGreaterThanOrEqual(MEM_CHART[unit].minSlots);
      // One bar is never most of the chart.
      expect(Math.max(...bars)).toBeLessThan(width / 4);
    });
  });
});
