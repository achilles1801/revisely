// The card over the reader while a past take shows on its page (RMEM-5). In Revisely Dev a tap on it opens the take's
// summary (RMEM-8; Majd, Nov 22 2026: "make that take card clickable and have it open that days summary popup sheet");
// Done keeps its own.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ShownTakeBar } from '../ShownTakeBar';
import type { TakeRecord } from '../../../lib/reciteMemory/record';

const mockPalette = require('../../../theme/v2').paletteV2(false, 'indigo');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
// No recording on this phone: no ▶.
jest.mock('../../../lib/reciteMemory/takeAudio', () => ({ useTakeRecording: () => null }));

const AT = new Date(2026, 10, 15, 19, 51).getTime();
const SURFACE = { background: mockPalette.fill, border: mockPalette.separator };
const take: TakeRecord = {
  id: 'take1',
  kind: 'take',
  take: null,
  createdAt: AT,
  rev: AT,
  day: '2026-11-15',
  level: 'words',
  hidden: true,
  from: 31413,
  to: 31458,
  secs: 100,
  mistakes: 1,
  tajweed: 0,
  unclear: 0,
  accuracy: 1 - 1 / 124,
  marks: [],
  passed: [],
  recordingId: null,
};

describe('[RECITE-25] the shown take’s card fits the room under the page', () => {
  it('the capsule’s height, one line each at most 1.2× text, so it never grows over the page at any size', () => {
    const { StyleSheet } = require('react-native');
    const { CAPSULE_HEIGHT } = require('../../reader/PlayerCapsule');
    render(<ShownTakeBar take={take} now={AT} surface={SURFACE} onDone={() => undefined} onOpen={() => undefined} />);
    const bar = StyleSheet.flatten(screen.getByTestId('shown-take-bar').props.style);
    expect(bar.height).toBe(CAPSULE_HEIGHT);
    expect(bar.position).toBeUndefined();
    for (const id of ['shown-take-title', 'shown-take-line']) {
      const text = screen.getByTestId(id);
      expect(text.props.numberOfLines).toBe(1);
      expect(text.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.2);
    }
  });
});

describe('[RMEM-8] the shown take’s card', () => {
  it('a tap opens its summary, and says so to VoiceOver; Done still ends showing it', () => {
    const onOpen = jest.fn();
    const onDone = jest.fn();
    render(<ShownTakeBar take={take} now={AT} surface={SURFACE} onDone={onDone} onOpen={onOpen} />);
    const card = screen.getByTestId('shown-take-open');
    expect(card.props.accessibilityLabel).toBe('Your take, Today, 7:51 PM: 99.1% · 1 mistake · recited with the page hidden. Open its summary');
    fireEvent.press(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('shown-take-done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('without a summary to open (the store app until the release) it is the card as before', () => {
    render(<ShownTakeBar take={take} now={AT} surface={SURFACE} onDone={() => undefined} />);
    expect(screen.queryByTestId('shown-take-open')).toBeNull();
    expect(screen.getByTestId('shown-take-line').props.children).toBe('99.1% · 1 mistake · page hidden');
  });
});
