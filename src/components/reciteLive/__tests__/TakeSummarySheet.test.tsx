// The take's summary with screen readers and at the largest text (CLAUDE.md, UI traps): chrome stops growing at 1.4×
// and the Arabic word at 1.6×; from 1.3× a finding's word goes under its title instead of squeezing it; the summary is
// spoken once when it shows; a take that ran into another surah names the surah in each finding.
import React from 'react';
import { AccessibilityInfo, Dimensions, Modal, Text } from 'react-native';
import { act, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TakeSummarySheet, findingPlace, STACK_FINDINGS_AT } from '../TakeSummarySheet';
import { plainText } from '../../../lib/passages';
import type { Mark } from '../../../lib/reciteLive/contract';

const mockPalette = new Proxy({}, { get: (_t, k) => (k === 'premium' ? ['#000000', '#000000'] : '#000000') });
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));

const words = require('../../../lib/recite/__fixtures__/quranWords').quranWords();
const A23 = words.verseFirstWord(27, 23);
const Q1 = words.verseFirstWord(28, 1);

const wrong = (w: number, ayah: [number, number]): Mark => ({ id: `m${w}`, w, ayah, kind: 'word', sure: 'clear', heard: 'وَأُوهِيَتْ', heardExact: false });

let dims: jest.SpyInstance | null = null;
afterEach(() => {
  dims?.mockRestore();
  dims = null;
});

function show({ fontScale = 1, to = A23 + 20, marks = [wrong(A23 + 3, [27, 23])], check = true } = {}) {
  dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 667, scale: 2, fontScale });
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
    <TakeSummarySheet
      visible
      check={check}
      words={words}
      from={A23}
      to={to}
      seconds={102}
      marks={marks}
      score={check ? { text: '96%', level: 'good' } : null}
      kept={false}
      checkOwned
      onFinding={() => undefined}
      onCheck={() => undefined}
      onAgain={() => undefined}
      onDone={() => undefined}
    />
    </SafeAreaProvider>,
  );
}

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } };
const flat = (c: unknown): string => (Array.isArray(c) ? c.map(flat).join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : '');
/** Text that grows past `max` (an icon is a Text holding one private-use glyph). */
const grows = (max: number) =>
  screen
    .UNSAFE_getAllByType(Text)
    .filter((t) => flat(t.props.children).replace(/[-]/g, '').trim() !== '')
    .filter((t) => !(typeof t.props.maxFontSizeMultiplier === 'number' && t.props.maxFontSizeMultiplier <= max))
    .map((t) => flat(t.props.children));

describe('the take summary with screen readers and the largest text', () => {
  it('at normal sizes a finding’s Arabic word sits beside its title', () => {
    show({ fontScale: 1 });
    const rowText = screen.getByTestId('take-summary-finding-text');
    expect(within(rowText).queryByTestId('take-summary-finding-arabic')).toBeNull();
    expect(screen.getByTestId('take-summary-finding-arabic')).toBeTruthy();
  });

  it(`from ${STACK_FINDINGS_AT}× it goes under the title, so the title keeps its width`, () => {
    show({ fontScale: 3.1 });
    const rowText = screen.getByTestId('take-summary-finding-text');
    expect(within(rowText).getByTestId('take-summary-finding-arabic')).toBeTruthy();
  });

  it('chrome stops growing at 1.4×, the Arabic word at 1.6×', () => {
    show({ fontScale: 3.1 });
    const arabic = words.uthmani(A23 + 3);
    expect(grows(1.4).filter((t) => t !== arabic)).toEqual([]);
    expect(grows(1.6)).toEqual([]);
  });

  it('a finding says its ayah; when the take ran into the next surah, the surah too', () => {
    expect(findingPlace(wrong(A23, [27, 23]), false)).toBe('ayah 23');
    expect(plainText(findingPlace(wrong(Q1, [28, 1]), true))).toBe('Al-Qasas, ayah 1');
    show({ to: Q1 + 4, marks: [wrong(A23 + 3, [27, 23]), wrong(Q1, [28, 1])] });
    const titles = screen.getAllByTestId('take-summary-finding-title').map((t) => plainText(flat(t.props.children)));
    expect(titles).toEqual(['Wrong word · An-Naml, ayah 23', 'Wrong word · Al-Qasas, ayah 1']);
    expect(screen.getAllByRole('button', { name: /Al-Qasas, ayah 1\. Show it on the page/ })).toHaveLength(1);
  });

  it('the score is read as one: the score and the mistakes', () => {
    show();
    expect(screen.getByLabelText('Score 96%, 1 mistake')).toBeTruthy();
  });

  it('once on screen, the summary is spoken once: the passage, the time, the score (queued after the sheet’s own focus on iOS)', async () => {
    show();
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
    await act(async () => {
      for (const m of screen.UNSAFE_getAllByType(Modal)) if (m.props.visible !== false) m.props.onShow?.();
    });
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledTimes(1);
    const [said, opts] = (AccessibilityInfo.announceForAccessibilityWithOptions as jest.Mock).mock.calls[0];
    expect(said).toMatch(/^Your recitation\. An-Naml, ayahs 23 to 2\d\. 1 minute 42 seconds\. 96%, 1 mistake$/);
    expect(opts).toEqual({ queue: true });
  });

  it('following along (no Check): the passage and the time, no score', async () => {
    show({ check: false, marks: [] });
    await act(async () => {
      for (const m of screen.UNSAFE_getAllByType(Modal)) if (m.props.visible !== false) m.props.onShow?.();
    });
    const [said] = (AccessibilityInfo.announceForAccessibilityWithOptions as jest.Mock).mock.calls.at(-1)!;
    expect(said).toMatch(/^Your recitation\. An-Naml, ayahs 23 to 2\d\. 1 minute 42 seconds$/);
  });

  it('“not clear” findings come last, each saying it isn’t counted, and the mistakes leave them out', () => {
    const unclear: Mark = { id: 'u', w: A23 + 1, ayah: [27, 23], kind: 'harakat', sure: 'likely' };
    show({ marks: [unclear, wrong(A23 + 3, [27, 23])] });
    const titles = screen.getAllByTestId('take-summary-finding-title').map((t) => plainText(flat(t.props.children)));
    expect(titles).toEqual(['Wrong word · ayah 23', 'Not clear · ayah 23']);
    expect(screen.getByText('Say it more clearly. Not counted in the score.')).toBeTruthy();
    expect(screen.getByText('1 wrong word, 1 not clear')).toBeTruthy();
    expect(screen.getByLabelText('Score 96%, 1 mistake')).toBeTruthy();
  });
});
