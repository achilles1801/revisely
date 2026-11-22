// Voweled Arabic never clips (Majd, Nov 22 2026, on a mistake's card: "the two lines have the expected vs recited have
// their arabic cut off so for example u cant even see if theres a dumma or fatha on the top"). A Text draws only inside
// its own box, on iOS and Android, so its line must hold Amiri's ink: up to 1.481× the font size above the baseline and
// 0.950× below, measured over every word of the Qur'an (scripts/measure-amiri-ink.swift). arabicV2's 1.6× line left
// 0.97× above on iOS: a fatha reaches 1.04×.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Dimensions } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  AMIRI_INK,
  AMIRI_LINE,
  ARABIC_FULL_LINE,
  amiriRoom,
  arabicFullV2,
  arabicV2,
} from '../../theme/v2';
import { arabicLines, clippedArabic, harakatClip } from '../../../jest/arabicLines';
import { MarkBlock } from '../../components/reciteLive/MarkCard';
import { Phrase } from '../../components/reciteLive/MarkParts';
import { WordChip } from '../../components/reciteLive/WordChip';
import { ReciteCheckNotice } from '../../components/reciteCheck/ReciteCheckNotice';
import { SimilarPhrasesSheet } from '../../components/reciteLive/SimilarPhrasesSheet';
import { TakeSummarySheet } from '../../components/reciteLive/TakeSummarySheet';
import { BAR_ROOM, BAR_WORDS, BAR_WORDS_MAX_SCALE } from '../../components/reciteLive/ReciteBar';
import { CAPSULE_HEIGHT } from '../../components/reader/PlayerCapsule';
import type { Mark } from '../../lib/reciteLive/contract';

const mockPalette = require('../../theme/v2').paletteV2(false, 'indigo');
jest.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

const ROOT = path.resolve(__dirname, '../../..');
const words = require('../../lib/recite/__fixtures__/quranWords').quranWords();
const A23 = words.verseFirstWord(27, 23);
const METRICS = { frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } };

/** The font's unitsPerEm and its hhea ascender and descender, read from the TTF itself. */
function fontLine(file: string) {
  const b = fs.readFileSync(file);
  const tables: Record<string, number> = {};
  for (let i = 0; i < b.readUInt16BE(4); i++) tables[b.toString('latin1', 12 + i * 16, 16 + i * 16)] = b.readUInt32BE(20 + i * 16);
  return { upm: b.readUInt16BE(tables.head + 18), ascent: b.readInt16BE(tables.hhea + 4), descent: b.readInt16BE(tables.hhea + 6) };
}

const SIZES = [12, 14, 16, 18, 19, 20, 21, 24, 28, 32, 40];
/** React Native scales the font and its line together, up to the Text's maxFontSizeMultiplier. */
const SCALES = [1, 1.2, 1.3, 1.4, 1.6, 2, 3.1];

describe('Amiri’s line', () => {
  it('is the font’s own: the ascent and descent the helper builds on are the TTF’s', () => {
    const f = fontLine(path.join(ROOT, 'assets/fonts/Amiri-Regular.ttf'));
    expect(f.ascent / f.upm).toBe(AMIRI_LINE.ascent);
    expect(-f.descent / f.upm).toBe(AMIRI_LINE.descent);
  });

  it('arabicFullV2 holds every haraka above and below, at every size and text scale', () => {
    expect(ARABIC_FULL_LINE).toBeCloseTo(2.512, 3);
    for (const size of SIZES) {
      for (const scale of SCALES) {
        const s = arabicFullV2(size);
        const room = amiriRoom((s.fontSize as number) * scale, (s.lineHeight as number) * scale);
        expect(room.above).toBeGreaterThanOrEqual(AMIRI_INK.above * size * scale);
        expect(room.below).toBeGreaterThanOrEqual(AMIRI_INK.below * size * scale);
        expect(harakatClip(s)).toBeNull();
      }
    }
  });

  it('arabicV2 does not: why the card cut its fatha and damma off', () => {
    // A fatha over a short letter reaches 1.036× the size above the baseline; arabicV2 leaves 0.966× on iOS.
    const s = arabicV2(21);
    expect(amiriRoom(21, s.lineHeight as number).above).toBeLessThan(1.036 * 21);
    expect(harakatClip(s)).not.toBeNull();
    // Nor does the font's own line: stacked marks over a lam reach past its ascent.
    expect(harakatClip({ fontFamily: 'Amiri-Regular', fontSize: 18 })).not.toBeNull();
  });
});

describe('Recite’s Arabic', () => {
  // Recite's screens: the mark card, the take summary, Similar phrases, the bar, Test me, the notice, Recite's memory
  // (the past card, Still to fix, Your progress) and Insights' Recitation.
  const FILES = [
    ...['src/components/reciteLive', 'src/components/reciteMemory', 'src/components/reciteCheck'].flatMap((dir) =>
      fs
        .readdirSync(path.join(ROOT, dir))
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => `${dir}/${f}`),
    ),
    'src/components/activity/RecitationInsights.tsx',
  ];

  it('styles every Arabic line with arabicFullV2, never arabicV2 or Amiri by hand', () => {
    expect(FILES.length).toBeGreaterThan(20);
    const found = FILES.flatMap((f) =>
      fs
        .readFileSync(path.join(ROOT, f), 'utf8')
        .split('\n')
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(({ line }) => !/^\s*(\/\/|\*)/.test(line) && /\barabicV2\(|fontsV2\.arabic|['"]Amiri/.test(line))
        .map(({ f, i, line }) => `${f}:${i}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
  });

  it('the mark card: Expected and Recited, a slip, a tajweed note’s word', () => {
    const wrong: Mark = { id: 'm1', w: A23 + 3, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'وَأُوهِيَتْ', heardExact: false };
    const slip: Mark = { id: 'm2', w: A23 + 3, ayah: [27, 23], kind: 'harakat', sure: 'clear', heard: 'وَأُوتِيَتُ', heardExact: true };
    const tajweed = { id: 'm3', w: A23 + 3, ayah: [27, 23], kind: 'tajweed', sure: 'clear', rule: 'madd_lazim', got: 2 } as Mark;
    render(
      <>
        <MarkBlock mark={wrong} words={words} onDismiss={jest.fn()} first />
        <MarkBlock mark={slip} words={words} onDismiss={jest.fn()} first={false} />
        <MarkBlock mark={tajweed} words={words} onDismiss={jest.fn()} first={false} />
      </>,
    );
    const lines = arabicLines(screen.UNSAFE_root as never);
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(clippedArabic(screen.UNSAFE_root as never)).toEqual([]);
  });

  it('a phrase and a word chip (the past card, Still to fix, Your progress, Insights)', () => {
    render(
      <>
        <Phrase parts={[{ role: 'context', text: 'إِنِّى' }, { role: 'expected', text: 'وَجَدتُّ' }]} fill={mockPalette.markWord} />
        <WordChip text="ظَمَأٌۭ" fill={mockPalette.markWord} />
        <WordChip text="عَظِيمٌۭ" fill={mockPalette.markWord} size={22} maxScale={1.5} />
      </>,
    );
    expect(arabicLines(screen.UNSAFE_root as never)).toHaveLength(3);
    expect(clippedArabic(screen.UNSAFE_root as never)).toEqual([]);
  });

  it('the AI notice', () => {
    render(<ReciteCheckNotice />);
    expect(arabicLines(screen.UNSAFE_root as never)).toHaveLength(1);
    expect(clippedArabic(screen.UNSAFE_root as never)).toEqual([]);
  });

  it('Similar phrases', () => {
    const w = A23 + 3;
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <SimilarPhrasesSheet
          visible
          words={words}
          here={w}
          places={[{ sura: 27, ayah: 16, w: words.verseFirstWord(27, 16) + 5, from: words.verseFirstWord(27, 16) + 2, to: words.verseFirstWord(27, 16) + 8, same: [] }]}
          onOpen={jest.fn()}
          onClose={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(arabicLines(screen.UNSAFE_root as never).length).toBeGreaterThanOrEqual(2);
    expect(clippedArabic(screen.UNSAFE_root as never)).toEqual([]);
  });

  it('the take summary: findings, peeked words and the words cleared, at normal and the largest text', () => {
    for (const fontScale of [1, 3.1]) {
      const dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 667, scale: 2, fontScale });
      const { unmount } = render(
        <SafeAreaProvider initialMetrics={METRICS}>
          <TakeSummarySheet
            visible
            check
            words={words}
            from={A23}
            to={A23 + 20}
            seconds={102}
            marks={[{ id: 'm1', w: A23 + 3, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'وَأُوهِيَتْ', heardExact: false }]}
            score={{ text: '96%', level: 'good' }}
            checkOwned
            memory={{ cleared: ['فَتَحَسَّسُوا۟', 'بِبِضَـٰعَةٍۢ'], trend: [0.95, 0.99], line: null }}
            peeked={[{ ayah: [27, 23], words: [A23 + 5, A23 + 6] }]}
            onFinding={jest.fn()}
            onCheck={jest.fn()}
            onAgain={jest.fn()}
            onDone={jest.fn()}
          />
        </SafeAreaProvider>,
      );
      expect(arabicLines(screen.UNSAFE_root as never).length).toBeGreaterThanOrEqual(3);
      expect(clippedArabic(screen.UNSAFE_root as never)).toEqual([]);
      unmount();
      dims.mockRestore();
    }
  });

  it('the bar: its words’ whole line fits the capsule, which clips what overflows it, at any text size', () => {
    expect(harakatClip(BAR_WORDS)).toBeNull();
    expect(BAR_WORDS_MAX_SCALE).toBeGreaterThanOrEqual(1);
    expect(BAR_ROOM).toBeLessThan(CAPSULE_HEIGHT);
    expect((BAR_WORDS.lineHeight as number) * BAR_WORDS_MAX_SCALE).toBeLessThanOrEqual(BAR_ROOM);
  });
});
