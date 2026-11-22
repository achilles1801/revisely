// A swipe across a row (TAB-1). Every row on Home and Read is a v2/Tap, and a Pressable presses as long
// as the finger stays inside it: a full-width row holds any swipe across it. On Android a swipe from Read
// toward Home that the tab pager didn't take reached JavaScript as a touch start, moves 350 pt to the
// right and a press, with no cancel, and the surah under the finger opened (Nov 22 2026, the E2E build's
// touch log). The touches here are the ones that log showed.
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Tap } from '../../../src/components/v2/Tap';

const at = (pageX: number, pageY = 667) => ({ nativeEvent: { pageX, pageY } });

function surahRow(open: () => void) {
  const screen = render(
    <Tap testID="surah-3" onPress={open} accessibilityRole="button">
      <Text>Āli-ʿImrān</Text>
    </Tap>,
  );
  return screen.getByTestId('surah-3');
}

/** A touch from `from` to `to` (pt across the screen), as JavaScript gets it when nothing cancels it. */
function touch(row: ReturnType<typeof surahRow>, from: number, to: number) {
  fireEvent(row, 'touchStart', at(from));
  const step = (to - from) / 4;
  for (let i = 1; i <= 4; i++) fireEvent(row, 'touchMove', at(from + step * i));
  fireEvent.press(row, at(to));
  fireEvent(row, 'touchEnd', at(to));
}

describe('A swipe across a row (TAB-1)', () => {
  it('[TAB-1] a swipe the tab pager didn’t take opens nothing under the finger', () => {
    const open = jest.fn();
    const row = surahRow(open);
    touch(row, 50, 400);
    expect(open).not.toHaveBeenCalled();
    // Leftward too, and a swipe that comes back near where it began is still a swipe.
    fireEvent(row, 'touchStart', at(340));
    fireEvent(row, 'touchMove', at(200));
    fireEvent(row, 'touchMove', at(330));
    fireEvent.press(row, at(330));
    expect(open).not.toHaveBeenCalled();
  });

  it('[TAB-1] a tap still opens the row, even one that drifts a few points', () => {
    const open = jest.fn();
    const row = surahRow(open);
    touch(row, 200, 200);
    expect(open).toHaveBeenCalledTimes(1);
    touch(row, 200, 209);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('[TAB-1] a press with no touch (VoiceOver, TalkBack) counts, even right after a swipe', async () => {
    const open = jest.fn();
    const row = surahRow(open);
    touch(row, 50, 400);
    expect(open).not.toHaveBeenCalled();
    // The swipe is over; the screen reader's activation carries no touch.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.press(row);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
