// What's new 1.0.5's first card as a moment: a take plays by itself, Skip goes to its end, and Reduce Motion and VoiceOver
// go there at once (lib/whatsNew/reciteMoment is its clock).

import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
let mockReduce = false;
jest.mock('../../../design/motion', () => ({ ...jest.requireActual('../../../design/motion'), useReduceMotion: () => mockReduce }));

import { ReciteMoment } from '../ReciteMoment';
import { TAKE } from '../pictures';
import { momentLength } from '../../../lib/whatsNew/reciteMoment';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DesignProvider } from '../../../design/DesignContext';

const onNext = jest.fn();
async function show() {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <ReciteMoment step={1} total={5} title="Recite, and see your mistakes" words={null} closable onNext={onNext} />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}
const length = momentLength({ order: TAKE.lines.flat().map((x) => x.w), marks: TAKE.marks });

beforeEach(() => {
  mockReduce = false;
  onNext.mockClear();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => jest.useRealTimers());

describe('<ReciteMoment />', () => {
  it('plays by itself: listening, then following, then the card’s words and Next', async () => {
    jest.useFakeTimers();
    await show();
    expect(screen.getByTestId('recite-moment-caption', { includeHiddenElements: true }).props.children).toBe('Listening…');
    expect(screen.queryByTestId('whats-new-next')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(length + 200);
    });
    expect(screen.queryByTestId('recite-moment-skip')).toBeNull();
    expect(screen.getByTestId('whats-new-title').props.accessibilityLabel).toBe('Step 1 of 5. Recite, and see your mistakes');
    fireEvent.press(screen.getByTestId('whats-new-next'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('Skip goes to its end at once, where the title shows (it never takes flex: in the column it would collapse)', async () => {
    await show();
    fireEvent.press(screen.getByTestId('recite-moment-skip'));
    expect(screen.getByTestId('whats-new-next')).toBeTruthy();
    // CI's capture (run 43978262904) found the title at no height: a flex text in a column without a height.
    expect(StyleSheet.flatten(screen.getByTestId('whats-new-title').props.style).flex).toBeUndefined();
  });

  it('Skip stays at its end: the clock stops, so no later tick takes it back into the take', async () => {
    jest.useFakeTimers();
    await show();
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    fireEvent.press(screen.getByTestId('recite-moment-skip'));
    expect(screen.getByTestId('whats-new-title')).toBeTruthy();
    // The clock's next ticks, well before the take would have ended by itself: still the end, with Next.
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId('recite-moment-skip')).toBeNull();
    expect(screen.getByTestId('whats-new-title')).toBeTruthy();
    expect(screen.getByTestId('whats-new-next')).toBeTruthy();
  });

  it('with Reduce Motion, and with VoiceOver, it starts at its end', async () => {
    mockReduce = true;
    await show();
    expect(screen.getByTestId('whats-new-next')).toBeTruthy();
    screen.unmount();
    mockReduce = false;
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await show();
    expect(screen.getByTestId('whats-new-next')).toBeTruthy();
  });
});
