// [MEM-12] Memorization's chart always reads as a chart: a bar is never wider than MAX_BAR (28pt a month, 14 a day), and the
// axis has at least MIN_SLOTS (6 months, 7 days), now at the right, so 1, 2 or 3 bars never become one block across the
// screen (Majd, Nov 28 2026, one month drawn the screen's width: "plz ensure something like this never happens (garbage
// ui)"). At an iPhone SE's width and a Pro Max's, with 1, 2, 3 and many bars, by month and by day.
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { LinearGradient } from 'expo-linear-gradient';
jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2 } = require('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(true), theme: {}, isDark: true }) };
});
import { MAX_BAR, MIN_SLOTS, MemorizationBars, barLayout, type MemorizationUnit } from '../MemorizationBars';

// The section's content width: the screen less its 16pt gutters.
const WIDTHS = { 'iPhone SE': 375 - 32, 'iPhone Pro Max': 440 - 32 };

function series(unit: MemorizationUnit, n: number): { key: string; pages: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    key: unit === 'month' ? `2026-${String(12 - n + 1 + i).padStart(2, '0')}` : `2026-11-${String(28 - n + 1 + i).padStart(2, '0')}`,
    pages: i === n - 1 ? 74 : 3 + i,
  }));
}

async function chart(unit: MemorizationUnit, n: number, width: number) {
  const screen = render(
    <MemorizationBars unit={unit} series={series(unit, n)} picked={null} onPick={() => {}} label={(k) => k.slice(-2)} a11yLabel={(k) => k} />,
  );
  await act(async () => {
    fireEvent(screen.getByTestId(`insights-memorization-bars-${unit}`), 'layout', { nativeEvent: { layout: { width, height: 120, x: 0, y: 0 } } });
  });
  const bars = screen.UNSAFE_getAllByType(LinearGradient).map((b) => StyleSheet.flatten(b.props.style).width as number);
  const slots = screen.queryAllByTestId('memorization-slot').length / 2 + screen.queryAllByTestId('memorization-slot-empty').length / 2;
  return { bars, slots };
}

describe.each(Object.entries(WIDTHS))('[MEM-12] the memorization chart at %s width', (_device, width) => {
  describe.each([
    ['month', [1, 2, 3, 12]],
    ['day', [1, 2, 3, 30]],
  ] as const)('by %s', (unit, counts) => {
    it.each(counts)('%i bar(s): every bar at most the maximum, the axis at least its slots, never one block', async (n) => {
      const { bars, slots } = await chart(unit, n, width);
      expect(bars).toHaveLength(n);
      expect(slots).toBe(Math.max(n, MIN_SLOTS[unit]));
      for (const w of bars) {
        expect(w).toBeGreaterThan(0);
        expect(w).toBeLessThanOrEqual(MAX_BAR[unit]);
        // Never a block: no bar takes a sixth of the chart (the month that filled the screen was all of it).
        expect(w).toBeLessThan(width / MIN_SLOTS.month);
      }
    });
  });
});

describe('barLayout', () => {
  it('one month: six slots, a 28pt bar, not the width of the chart', () => {
    expect(barLayout('month', 1, 408)).toMatchObject({ slots: 6, bar: 28 });
  });
  it('thirty days fill the width with thin bars and narrow gaps', () => {
    const l = barLayout('day', 30, 343);
    expect([l.slots, l.gap]).toEqual([30, 2]);
    expect(l.bar).toBeLessThan(10);
    expect(l.slots * l.slot + (l.slots - 1) * l.gap).toBeCloseTo(343);
  });
});
