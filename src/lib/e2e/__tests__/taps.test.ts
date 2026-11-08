// The E2E build's trace of taps (src/lib/e2e/taps.ts): each stage logged, the Tap's own handlers
// still called.

import type { GestureResponderEvent } from 'react-native';
import { traceTap } from '../taps';

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
