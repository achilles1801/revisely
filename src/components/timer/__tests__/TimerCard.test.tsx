import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

// Shared values that last across renders, as on a device (the stock mock makes
// a new one every render), and animations that finish at once.
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const { useRef } = require('react');
  return {
    ...mock,
    useSharedValue: (init: unknown) => {
      const ref = useRef(null);
      if (!ref.current) ref.current = mock.useSharedValue(init);
      return ref.current;
    },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../TimerControls', () => {
  const { Text } = require('react-native');
  return { TimerControls: () => <Text>controls</Text> };
});
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});

import { cardPlace, TimerCard } from '../TimerCard';

const origin = { x: 380, y: 840, width: 36, height: 36 };

async function show(props: Partial<React.ComponentProps<typeof TimerCard>> = {}) {
  const onClose = jest.fn();
  const onHidden = jest.fn();
  const ui = (visible: boolean) => (
    <TimerCard visible={visible} origin={origin} onClose={onClose} onHidden={onHidden} {...props} />
  );
  render(ui(true));
  await act(async () => {});
  // The controls are laid out: the card knows its height and grows.
  fireEvent(screen.getByText('controls').parent!.parent!, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 260 } },
  });
  return { onClose, onHidden, rerender: (visible: boolean) => screen.rerender(ui(visible)) };
}

const drag = (dy: number, velocityY = 0) =>
  act(() => {
    fireGestureHandler(getByGestureTestId('timer-card-drag'), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationY: 12 },
      { state: State.ACTIVE, translationY: dy },
      { state: State.END, translationY: dy, velocityY },
    ]);
  });

describe('TimerCard: the chip grown into a card', () => {
  it('the timer’s controls in a card, with a handle that VoiceOver can close it with', async () => {
    const { onClose } = await show();
    expect(screen.getByTestId('timer-card')).toBeTruthy();
    expect(screen.getByText('controls')).toBeTruthy();
    const handle = screen.getByTestId('timer-card-handle');
    expect(handle.props.accessibilityLabel).toBe('Close');
    handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.getByTestId('timer-card').props.onAccessibilityEscape();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('a tap outside closes it', async () => {
    const { onClose } = await show();
    // Hidden from VoiceOver behind the card (which escapes instead), but tappable.
    fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('dragged down far enough (or flicked) it closes; a little, and it stays', async () => {
    const { onClose } = await show();
    drag(40);
    expect(onClose).not.toHaveBeenCalled();
    drag(140);
    expect(onClose).toHaveBeenCalledTimes(1);
    drag(30, 1200);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closed, it shrinks back and then lets the chip show again', async () => {
    const { onHidden, rerender } = await show();
    expect(onHidden).not.toHaveBeenCalled();
    rerender(false);
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('timer-card')).toBeNull();
  });
});

describe('where the card sits: grown out of the timer button, never over its bar', () => {
  const screenSize = { width: 440, height: 956 };
  const insets = { top: 62, bottom: 38 };
  const width = 416;

  it('the reader’s and the session’s bars: just above the button, its right edge near the button’s', () => {
    // The stopwatch at the right end of the reader's controls.
    const p = cardPlace({ x: 380, y: 878, width: 36, height: 36 }, screenSize, width, insets);
    expect(p.above).toBe(true);
    expect(p.edge).toBe(878 - 10);
    expect(p.left + width).toBeLessThanOrEqual(440 - 12);
    expect(p.left).toBeGreaterThanOrEqual(12);
  });

  it('Home’s top bar: it drops down from the chip, on the chip’s side', () => {
    const p = cardPlace({ x: 16, y: 68, width: 65, height: 36 }, screenSize, width, insets);
    expect(p.above).toBe(false);
    expect(p.edge).toBe(68 + 36 + 10);
    expect(p.left).toBe(12);
  });

  it('never higher than the status bar', () => {
    expect(cardPlace({ x: 380, y: 878, width: 36, height: 36 }, screenSize, width, insets).minTop).toBe(62 + 12);
  });
});
