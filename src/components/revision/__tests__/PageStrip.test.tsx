import React from 'react';
import { I18nManager, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { MAX_STRIP_BARS, PageStrip, stripBars } from '../PageStrip';
import { mushafRow } from '../../../lib/mushafDirection';

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

  it('[SESS-1] runs right to left, the first page on the right, in English and Arabic alike', () => {
    // React Native's row follows the layout's direction: both of these put the first child on the right.
    expect(mushafRow(false)).toBe('row-reverse');
    expect(mushafRow(true)).toBe('row');
    const direction = () => {
      const { unmount } = render(<PageStrip pages={[1, 2, 3]} done={new Set([1])} current={2} />);
      const strip = screen.getByTestId('session-page-strip');
      const value = StyleSheet.flatten(strip.props.style).flexDirection;
      // The bars stay in page order: the first page's is the first child, so it is the one on the right.
      expect((strip.children as unknown as { props: { testID: string } }[]).map((c) => c.props.testID)).toEqual([
        'session-strip-bar-done',
        'session-strip-bar-current',
        'session-strip-bar',
      ]);
      unmount();
      return value;
    };
    expect(direction()).toBe('row-reverse');
    const arabic = jest.replaceProperty(I18nManager, 'isRTL', true);
    expect(direction()).toBe('row');
    arabic.restore();
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
