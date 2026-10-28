import React from 'react';
import { ScrollView, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { touchHandlingAncestor } from '../../../../jest/scrollable';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});

import { DISMISS_DISTANCE, DISMISS_VELOCITY, Sheet, shouldDismiss } from '../Sheet';

function show(onClose = jest.fn()) {
  render(
    <Sheet visible onClose={onClose} title="Audio Options" scroll testID="t">
      <Text>Body</Text>
      <ScrollView testID="inner-scroll" />
    </Sheet>,
  );
  return onClose;
}

/** A drag of the handle or header, as Gesture Handler reports it. */
async function drag(translationY: number, velocityY = 0) {
  act(() => {
    fireGestureHandler(getByGestureTestId('t-drag'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: Math.sign(translationY) * 12 },
      { state: State.ACTIVE, translationY },
      { state: State.END, translationY, velocityY },
    ]);
  });
  // runOnJS hands the close back to the JS thread a moment later.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('dragging a sheet down to close it', () => {
  it('past the distance it closes', async () => {
    const onClose = show();
    await drag(DISMISS_DISTANCE + 40);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a short drag springs back: still open', async () => {
    const onClose = show();
    await drag(50, 200);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a short fling down closes it', async () => {
    const onClose = show();
    await drag(40, DISMISS_VELOCITY + 400);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dragging up does nothing', async () => {
    const onClose = show();
    await drag(-160, -1500);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the threshold: 120pt, or 30% of a short sheet', () => {
    expect(shouldDismiss(121, 0, 800)).toBe(true);
    expect(shouldDismiss(119, 0, 800)).toBe(false);
    // A 300pt sheet (the timer) closes at 90pt.
    expect(shouldDismiss(95, 0, 300)).toBe(true);
    expect(shouldDismiss(85, 0, 300)).toBe(false);
    // A fling needs to have moved a little.
    expect(shouldDismiss(20, 1200, 800)).toBe(true);
    expect(shouldDismiss(5, 1200, 800)).toBe(false);
  });

  it('only the handle and the header drag: the content (its scroll views, pickers) is outside it and keeps its touches', () => {
    show();
    const grab = screen.getByTestId('t-grab', { includeHiddenElements: true });
    const scroll = screen.getByTestId('inner-scroll', { includeHiddenElements: true });
    let node: { parent: unknown } | null = scroll as unknown as { parent: unknown };
    let insideGrab = false;
    while (node) {
      if (node === (grab as unknown)) insideGrab = true;
      node = (node as { parent: { parent: unknown } | null }).parent;
    }
    expect(insideGrab).toBe(false);
    expect(touchHandlingAncestor(scroll)).toBeNull();
    for (const s of screen.UNSAFE_getAllByType(ScrollView)) expect(touchHandlingAncestor(s)).toBeNull();
    // The header is in the drag area.
    expect(screen.getByText('Audio Options')).toBeTruthy();
  });

  it('VoiceOver: the handle is a Close button, and the escape gesture closes the sheet', () => {
    const onClose = show();
    const handle = screen.getByTestId('sheet-handle');
    expect(handle.props.accessibilityRole).toBe('button');
    expect(handle.props.accessibilityLabel).toBe('Close');
    expect(handle.props.accessibilityActions).toEqual([{ name: 'activate', label: 'Close' }]);
    fireEvent(handle, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.getByTestId('t').props.onAccessibilityEscape();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('a tap on the backdrop still closes it', () => {
    const onClose = show();
    fireEvent.press(screen.getByTestId('backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
