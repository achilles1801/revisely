// One sheet at a time (SHEET-1, v2/modalTurn). iOS refuses a modal asked to present while another is
// up, and the refused one's host then took every touch on Home (Nov 9 2026). React Native's jest
// Modal never reports a dismissal, as a modal that iOS never showed doesn't: the fallback ends it.
import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});

import { DISMISS_FALLBACK_MS, Sheet } from '../Sheet';
import { modalShowing, resetModalTurnsForTests } from '../modalTurn';

function Sheets({ a, b, inside = false, onHiddenA }: { a: boolean; b: boolean; inside?: boolean; onHiddenA?: () => void }) {
  const second = (
    <Sheet visible={b} onClose={() => undefined} title="Second" testID="b">
      <Text>Second body</Text>
    </Sheet>
  );
  return (
    <>
      <Sheet visible={a} onClose={() => undefined} onHidden={onHiddenA} title="First" testID="a">
        <Text>First body</Text>
        {inside ? second : null}
      </Sheet>
      {inside ? null : second}
    </>
  );
}

const showing = (text: string) => screen.queryByText(text) != null;
const advance = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });
/** Past a sheet's closing (180 ms), then the wait for its dismissal: each step's timers start once React has run the last one's updates. */
const untilGone = () => {
  advance(250);
  advance(DISMISS_FALLBACK_MS + 50);
  advance(50);
};

beforeEach(() => {
  jest.useFakeTimers();
  resetModalTurnsForTests();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('one sheet at a time (SHEET-1)', () => {
  it('[SHEET-1] a sheet asked to open while another is up waits, and opens once that one has gone', () => {
    const view = render(<Sheets a b={false} />);
    advance(10);
    expect(showing('First body')).toBe(true);

    view.rerender(<Sheets a b />);
    advance(500);
    expect(showing('Second body')).toBe(false);

    view.rerender(<Sheets a={false} b />);
    untilGone();
    expect(showing('First body')).toBe(false);
    expect(showing('Second body')).toBe(true);
  });

  it('[SHEET-1] a sheet opened inside another shows over it at once', () => {
    const view = render(<Sheets a b={false} inside />);
    advance(10);
    view.rerender(<Sheets a b inside />);
    advance(10);
    expect(showing('First body')).toBe(true);
    expect(showing('Second body')).toBe(true);
  });

  it('[SHEET-1] a sheet closed while it waited holds nothing: the next one opens', () => {
    const view = render(<Sheets a b />);
    advance(10);
    view.rerender(<Sheets a b={false} />);
    view.rerender(<Sheets a={false} b={false} />);
    untilGone();
    expect(modalShowing()).toBe(false);
    view.rerender(<Sheets a={false} b />);
    advance(10);
    expect(showing('Second body')).toBe(true);
  });

  it('[SHEET-1] a modal whose dismissal never reports back is removed anyway; onHidden runs once', () => {
    const onHidden = jest.fn();
    const view = render(<Sheets a b={false} onHiddenA={onHidden} />);
    advance(10);
    view.rerender(<Sheets a={false} b={false} onHiddenA={onHidden} />);
    advance(200);
    // Closed, but iOS hasn't said it has gone: it still holds its turn.
    expect(onHidden).not.toHaveBeenCalled();
    expect(modalShowing()).toBe(true);
    advance(DISMISS_FALLBACK_MS);
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(modalShowing()).toBe(false);
    expect(screen.queryByTestId('a')).toBeNull();
  });
});
