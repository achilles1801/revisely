// The progress chart's dates: text beside the plot (react-native-svg cut the right one, "Toda", in flow 18's rm03), one
// when every take is on the same day.
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { AccuracyChart, axisDates } from '../AccuracyChart';

jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2 } = jest.requireActual('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(false, 'indigo'), isDark: false }) };
});

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 15, 19, 30).getTime();

describe('axisDates', () => {
  it('one date when the first and last takes are on the same day', () => {
    expect(axisDates(NOW - 60_000, NOW, NOW)).toEqual(['Today', null]);
    const nov12 = new Date(2026, 10, 12, 9).getTime();
    expect(axisDates(nov12, nov12 + 3_600_000, NOW)).toEqual(['12 Nov', null]);
  });

  it('both ends on different days, today named', () => {
    expect(axisDates(new Date(2026, 10, 12, 9).getTime(), NOW - 5_000, NOW)).toEqual(['12 Nov', 'Today']);
    expect(axisDates(new Date(2026, 9, 30, 9).getTime(), new Date(2026, 10, 2, 9).getTime(), NOW)).toEqual(['30 Oct', '2 Nov']);
  });
});

describe('AccuracyChart', () => {
  it('draws its dates as text under the plot: Today once for takes of one day', () => {
    render(<AccuracyChart points={[{ at: NOW - 60_000, accuracy: 0.985 }, { at: NOW, accuracy: 0.985 }]} width={360} now={NOW} />);
    expect(screen.getByTestId('progress-chart-from', { includeHiddenElements: true }).props.children).toBe('Today');
    expect(screen.queryByTestId('progress-chart-to', { includeHiddenElements: true })).toBeNull();
  });

  it('the first and the last take’s days at either end', () => {
    render(<AccuracyChart points={[{ at: NOW - 3 * DAY, accuracy: 0.9 }, { at: NOW, accuracy: 0.97 }]} width={360} now={NOW} />);
    expect(screen.getByTestId('progress-chart-from', { includeHiddenElements: true }).props.children).toBe('12 Nov');
    expect(screen.getByTestId('progress-chart-to', { includeHiddenElements: true }).props.children).toBe('Today');
  });
});
