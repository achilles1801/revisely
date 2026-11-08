// The E2E build's trace of taps (src/lib/e2e/taps.ts): each stage logged, the Tap's own handlers
// still called.

import type { GestureResponderEvent } from 'react-native';
import { touchLine, traceTap } from '../taps';

const touch = { nativeEvent: { pageX: 38.4, pageY: 112.6 } } as unknown as GestureResponderEvent;

let lines: string[];
beforeEach(() => {
  lines = [];
  jest.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line);
  });
});

it('logs in, out and press for a Tap with a testID, then calls its own handlers', () => {
  const onPress = jest.fn();
  const onPressIn = jest.fn();
  const props = traceTap({ testID: 'revo-back', onPress, onPressIn, accessibilityLabel: 'Back' });
  props.onPressIn?.(touch);
  props.onPressOut?.(touch);
  props.onPress?.(touch);
  expect(lines).toEqual(['[e2e] tap revo-back in at (38, 113)', '[e2e] tap revo-back out at (38, 113)', '[e2e] tap revo-back press at (38, 113)']);
  expect(onPressIn).toHaveBeenCalledWith(touch);
  expect(onPress).toHaveBeenCalledWith(touch);
  expect(props.accessibilityLabel).toBe('Back');
});

it('leaves a Tap without a testID as it was', () => {
  const props = { onPress: jest.fn() };
  expect(traceTap(props)).toBe(props);
});

it('says where a touch is, what it landed on and how many touches JavaScript holds as down', () => {
  // The Text inside a PillButton: its own props have no testID; the Pressable's above it does.
  const button = { memoizedProps: { testID: 'journey-continue' }, return: null };
  const text = { memoizedProps: { children: 'Continue' }, return: { memoizedProps: {}, return: button } };
  const e = {
    target: { __internalInstanceHandle: text },
    nativeEvent: { pageX: 200.6, pageY: 834.2, target: 1234, touches: [{}, {}], changedTouches: [{}] },
  } as unknown as GestureResponderEvent;
  expect(touchLine('start', e)).toBe('[e2e] touch start at (201, 834) on journey-continue, 2 down, 1 changed');
});

it('names the native tag when nothing above the view has a testID', () => {
  const e = { target: {}, nativeEvent: { pageX: 1, pageY: 2, target: 77, touches: [{}], changedTouches: [{}] } } as unknown as GestureResponderEvent;
  expect(touchLine('end', e)).toBe('[e2e] touch end at (1, 2) on #77, 1 down, 1 changed');
});
