// The take's summary with Recite's memory (lib/reciteMemory): the words this take cleared from the page, and its
// passage's trend with a way to its progress. Only for a take that marked mistakes; nothing for a first take.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TakeSummarySheet } from '../TakeSummarySheet';

const mockPalette = require('../../../theme/v2').paletteV2(false, 'indigo');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));

const words = require('../../../lib/recite/__fixtures__/quranWords').quranWords();
const A87 = words.verseFirstWord(12, 87);
const METRICS = { frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } };

function show(memory: { cleared: string[]; trend: number[]; line: string | null } | null, check = true, onProgress = jest.fn()) {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TakeSummarySheet
        visible
        check={check}
        words={words}
        from={A87}
        to={A87 + 40}
        seconds={102}
        marks={[]}
        score={check ? { text: '99.1%', level: 'good' } : null}
        checkOwned
        onFinding={() => undefined}
        onCheck={() => undefined}
        onAgain={() => undefined}
        onDone={() => undefined}
        memory={memory}
        onProgress={onProgress}
      />
    </SafeAreaProvider>,
  );
  return onProgress;
}

describe('the summary with Recite’s memory', () => {
  it('names the words this take cleared, and opens the passage’s progress', () => {
    const onProgress = show({ cleared: ['فَتَحَسَّسُوا۟', 'بِبِضَـٰعَةٍۢ'], trend: [0.951, 0.983, 0.991], line: 'Up from 95.1% on Mon 2 Nov · 3 takes' });
    expect(screen.getByText('2 cleared from the page')).toBeTruthy();
    expect(screen.getByText('Right on 2 different days')).toBeTruthy();
    expect(screen.getByTestId('progress-sparkline')).toBeTruthy();
    fireEvent.press(screen.getByTestId('take-summary-progress'));
    expect(onProgress).toHaveBeenCalled();
  });

  it('a first take here has no trend yet, and clearing nothing says nothing', () => {
    show({ cleared: [], trend: [0.99], line: null });
    expect(screen.queryByTestId('take-summary-cleared')).toBeNull();
    expect(screen.queryByTestId('take-summary-progress')).toBeNull();
  });

  it('Recite (following only) shows neither', () => {
    show({ cleared: ['فَتَحَسَّسُوا۟'], trend: [0.9, 0.95], line: 'Up' }, false);
    expect(screen.queryByTestId('take-summary-cleared')).toBeNull();
    expect(screen.queryByTestId('take-summary-progress')).toBeNull();
  });
});
