// The take's summary with Recite's memory (lib/reciteMemory): the words this take cleared from the page, its passage's
// earlier takes (RMEM-7), and its trend with a way to its progress. Only for a take that marked mistakes; nothing for a
// first take.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TakeSummarySheet } from '../TakeSummarySheet';
import { historyRows } from '../../../lib/reciteMemory/history';
import type { HistoryRow } from '../../../lib/reciteMemory/history';
import type { TakeRecord } from '../../../lib/reciteMemory/record';

const mockPalette = require('../../../theme/v2').paletteV2(false, 'indigo');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));

const words = require('../../../lib/recite/__fixtures__/quranWords').quranWords();
const A87 = words.verseFirstWord(12, 87);
const METRICS = { frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } };

function show(
  memory: { cleared: string[]; trend: number[]; line: string | null } | null,
  check = true,
  onProgress = jest.fn(),
  history: HistoryRow[] = [],
  onPastTake?: (take: TakeRecord) => void,
  during = false,
) {
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
        history={history}
        onPastTake={onPastTake}
        during={during}
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

describe('the summary’s passage history (RMEM-7)', () => {
  const at = (d: number, h = 20) => new Date(2026, 10, d, h, 0).getTime();
  const NOW = at(22, 21);
  const take = (id: string, d: number, over: Partial<TakeRecord> = {}): TakeRecord => ({
    id,
    kind: 'take',
    take: null,
    createdAt: at(d),
    rev: 1,
    day: `2026-11-${d}`,
    level: 'words',
    hidden: false,
    from: A87,
    to: A87 + 40,
    secs: 60,
    mistakes: 0,
    tajweed: 0,
    unclear: 0,
    accuracy: 1,
    marks: [],
    passed: [],
    recordingId: null,
    ...over,
  });
  const rows = () =>
    historyRows(words, { from: A87, to: A87 + 40 }, [take('y', 21, { accuracy: 0.981, mistakes: 2, tajweed: 1, unclear: 2 }), take('f', 20, { accuracy: 0.992, mistakes: 1, hidden: true })], NOW);

  it('lists the earlier takes newest first, each its day, score and mistakes; a tap shows that take', () => {
    const onPastTake = jest.fn();
    show({ cleared: [], trend: [0.99, 0.981, 0.991], line: 'Up from 99.2% on Fri 20 Nov · 3 takes' }, true, jest.fn(), rows(), onPastTake);
    expect(screen.getByText('This passage: your last 2 takes')).toBeTruthy();
    expect(screen.getAllByTestId('take-summary-history-score').map((n) => n.props.children)).toEqual(['98.1%', '99.2%']);
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('2 mistakes')).toBeTruthy();
    expect(screen.getByText('Friday')).toBeTruthy();
    expect(screen.getByText('1 mistake · page hidden')).toBeTruthy();
    // VoiceOver hears each row in words.
    const [first, second] = screen.getAllByTestId('take-summary-history-row');
    expect(first.props.accessibilityLabel).toBe('Yesterday: 98.1%, 2 mistakes. Show it on the page');
    expect(second.props.accessibilityLabel).toBe('Friday: 99.2%, 1 mistake, page hidden. Show it on the page');
    fireEvent.press(second);
    expect(onPastTake).toHaveBeenCalledWith(expect.objectContaining({ id: 'f' }));
    // The trend still follows it.
    expect(screen.getByTestId('take-summary-progress')).toBeTruthy();
  });

  it('one earlier take reads as one', () => {
    show({ cleared: [], trend: [0.99, 0.981], line: 'Down · 2 takes' }, true, jest.fn(), rows().slice(0, 1), jest.fn());
    expect(screen.getByText('This passage: your last take')).toBeTruthy();
  });

  it('nothing with no earlier take, during the take, or for Recite (following only)', () => {
    show({ cleared: [], trend: [0.99], line: null }, true, jest.fn(), [], jest.fn());
    expect(screen.queryByTestId('take-summary-history')).toBeNull();
    screen.unmount();
    show(null, true, jest.fn(), rows(), jest.fn(), true);
    expect(screen.queryByTestId('take-summary-history')).toBeNull();
    screen.unmount();
    show(null, false, jest.fn(), rows(), jest.fn());
    expect(screen.queryByTestId('take-summary-history')).toBeNull();
  });
});
