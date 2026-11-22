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
    expect(rows[0].props.accessibilityLabel).toMatch(/^Today, 8:12 PM, 99\.1%, 1 mistake/);
    fireEvent.press(rows[1]);
    expect(onOpen).toHaveBeenCalledWith(takes[1]);
  });

  it('names a take by its ayahs within the passage’s surah', () => {
    expect(plainText(takeRange(words, takes[0], 12))).toBe('Ayahs 87–95');
  });
});
