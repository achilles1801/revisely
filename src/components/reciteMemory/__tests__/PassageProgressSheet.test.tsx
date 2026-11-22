import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { quranWords } from '../../../lib/recite/__fixtures__/quranWords';
import { wordMemories } from '../../../lib/reciteMemory/memory';
import type { TakeRecord } from '../../../lib/reciteMemory/record';
import { PassageProgressSheet, takeRange } from '../PassageProgressSheet';
import { plainText } from '../../../lib/passages';
import { mixColors, paletteV2 } from '../../../theme/v2';
import { harakatClip } from '../../../../jest/arabicLines';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false, 'indigo'), isDark: false, palette: paletteV2(false, 'indigo') }) };
});

const words = quranWords();
const A87 = words.verseFirstWord(12, 87);
const A90 = words.verseRange(12, 90)[1] - 1;
const A95 = words.verseRange(12, 95)[1] - 1;
const A101 = words.verseRange(12, 101)[1] - 1;
const W = 31453;
const at = (d: number) => new Date(2026, 10, d, 20, 12).getTime();
const take = (id: string, d: number, to: number, accuracy: number, mistakes: number, over: Partial<TakeRecord> = {}): TakeRecord => ({
  id,
  kind: 'take',
  take: null,
  createdAt: at(d),
  rev: 1,
  day: `2026-11-${d}`,
  level: 'words',
  hidden: false,
  from: A87,
  to,
  secs: 60,
  mistakes,
  tajweed: 0,
  unclear: 0,
  accuracy,
  marks: mistakes ? [{ id: `${W}:word:`, w: W, ayah: [12, 88], kind: 'word', sure: 'clear' }] : [],
  passed: [],
  recordingId: null,
  ...over,
});

describe("a passage's progress sheet", () => {
  const takes = [take('a', 2, A95, 0.951, 6), take('b', 13, A95, 0.975, 3, { hidden: true }), take('c', 15, A90, 0.991, 1)];

  it('the latest take’s accuracy and the trend, the words still to fix, every take newest first', () => {
    const onOpen = jest.fn();
    render(
      <PassageProgressSheet visible words={words} from={A87} to={A90} takes={takes} memories={wordMemories(takes)} now={at(15) + 3600_000} onOpenTake={onOpen} onClose={jest.fn()} />,
    );
    expect(plainText(screen.getByTestId('progress-passage').props.children)).toBe('Yusuf, ayahs 87–90');
    expect(screen.getByTestId('progress-latest').props.children).toBe('99.1%');
    expect(screen.getByTestId('progress-line').props.children).toBe('Up from 95.1% on Mon 2 Nov · 3 takes');
    expect(screen.getByTestId('progress-chart')).toBeTruthy();
    expect(screen.getAllByTestId('progress-open-word')).toHaveLength(1);
    // The page's past shade as one solid colour, and the word whole: a line that holds every haraka (WordChip).
    const p = paletteV2(false, 'indigo');
    const chip = StyleSheet.flatten(screen.getByTestId('progress-open-word').props.style);
    expect(chip.backgroundColor).toBe(mixColors(p.sheet, p.markWord, 0.48));
    expect(chip.opacity).toBeUndefined();
    expect(harakatClip(screen.getByText(words.uthmani(W)).props.style)).toBeNull();
    const rows = screen.getAllByTestId('progress-take');
    expect(rows).toHaveLength(3);
    // Each take with its ayat, on screen and for VoiceOver, so a take of more than the passage reads as one.
    expect(rows[0].props.accessibilityLabel).toBe('Today, 8:12 PM, Ayahs 87 to 90, 99.1%, 1 mistake. Show it on the page');
    expect(rows[2].props.accessibilityLabel).toMatch(/^Mon 2 Nov, 8:12 PM, Ayahs 87 to 95, 95\.1%/);
    expect(screen.queryByTestId('progress-same-ayat')).toBeNull();
    fireEvent.press(rows[1]);
    expect(onOpen).toHaveBeenCalledWith(takes[1]);
  });

  it('names a take by its ayahs within the passage’s surah', () => {
    expect(plainText(takeRange(words, takes[0], 12))).toBe('Ayahs 87–95');
  });

  it('[RMEM-7] in Revisely Dev the score, the line and the chart compare like with like; every take is still listed, with its ayat', () => {
    // An older take of 87–101 (its mistakes may be in 91–101), then two of 87–90.
    const mixed = [take('long', 2, A101, 0.951, 6), take('b', 13, A90, 0.975, 3), take('c', 15, A90, 0.991, 1)];
    const show = (sameStretch: boolean) =>
      render(
        <PassageProgressSheet visible words={words} from={A87} to={A90} takes={mixed} memories={wordMemories(mixed)} now={at(15) + 3600_000} sameStretch={sameStretch} onClose={jest.fn()} />,
      );
    show(true);
    expect(screen.getByTestId('progress-latest').props.children).toBe('99.1%');
    expect(screen.getByTestId('progress-line').props.children).toBe('Up from 97.5% on Fri 13 Nov · 2 takes');
    expect(screen.getByTestId('progress-chart').props.accessibilityLabel).toBe('Accuracy over 2 takes');
    expect(screen.getByTestId('progress-same-ayat').props.children).toBe('The score and chart count only your takes of these ayat');
    expect(screen.getAllByTestId('progress-take')).toHaveLength(3);
    expect(screen.getByText('Ayahs 87–101 · 6 mistakes')).toBeTruthy();
    screen.unmount();
    // The store app, as before: every take that covers half of the passage.
    show(false);
    expect(screen.getByTestId('progress-line').props.children).toBe('Up from 95.1% on Mon 2 Nov · 3 takes');
    expect(screen.queryByTestId('progress-same-ayat')).toBeNull();
  });
});
