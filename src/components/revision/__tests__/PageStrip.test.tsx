import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MAX_STRIP_BARS, PageStrip, stripBars } from '../PageStrip';

jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2, DEFAULT_ACCENT } = jest.requireActual('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(false, DEFAULT_ACCENT) }) };
});

const range = (a: number, n: number) => Array.from({ length: n }, (_, i) => a + i);

describe('the page strip (SESS-1)', () => {
  it('[SESS-1] a bar per page: filled once revised, whatever the order, the page on screen marked', () => {
    expect(stripBars([10, 11, 12], new Set([12, 10]), 11)).toEqual([
      { key: 10, done: true, current: false },
      { key: 11, done: false, current: true },
      { key: 12, done: true, current: false },
    ]);
  });

  it('a very long day shares its bars: one is full only when all its pages are, and every page is in one', () => {
    const pages = range(1, 604);
    const all = stripBars(pages, new Set(pages), 300);
    expect(all).toHaveLength(MAX_STRIP_BARS);
    expect(all.every((b) => b.done)).toBe(true);
    expect(all.filter((b) => b.current)).toHaveLength(1);
    const oneMissing = stripBars(pages, new Set(pages.filter((p) => p !== 604)), 1);
    expect(oneMissing[oneMissing.length - 1].done).toBe(false);
    expect(oneMissing[0].current).toBe(true);
  });

  it('says how far the day has come to a screen reader', () => {
    render(<PageStrip pages={[1, 2, 3, 4, 5]} done={new Set([1, 2, 3])} current={3} />);
    const strip = screen.getByLabelText('3 of 5 revised');
    expect(strip.props.accessibilityRole).toBe('progressbar');
    expect(strip.props.accessibilityValue).toEqual({ min: 0, max: 5, now: 3 });
    expect(screen.getAllByTestId(/^session-strip-bar-done/, { includeHiddenElements: true })).toHaveLength(3);
    expect(screen.getByTestId('session-strip-bar-done-current', { includeHiddenElements: true })).toBeTruthy();
  });
});
