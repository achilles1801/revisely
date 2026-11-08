// The E2E build's trace of taps (E2E builds only, .maestro/README.md): a `v2/Tap` with a testID
// writes each stage of a press to the build's log (lib/e2e/log): "in" when JavaScript gets the
// touch, "out" when it lets go, "press" when the press counts.
//
// Twice on a CI iOS Simulator (#328's runs, Nov 7 2026) a Tap in a sheet got Maestro's touch, by
// the device log, and never pressed: Add to today's Memorized, and the ‹ in Revo's History. The
// stages say where such a tap was lost: no "in" (JavaScript never had it), or "in" and "out"
// with no "press" (the press was cancelled).

import type { GestureResponderEvent, PressableProps } from 'react-native';

type Handlers = Pick<PressableProps, 'onPress' | 'onPressIn' | 'onPressOut' | 'testID'>;

function say(testID: string, stage: string, e: GestureResponderEvent): void {
  const n = e?.nativeEvent;
  const where = n && typeof n.pageX === 'number' ? ` at (${Math.round(n.pageX)}, ${Math.round(n.pageY)})` : '';
  // eslint-disable-next-line no-console
  console.log(`[e2e] tap ${testID} ${stage}${where}`);
}

/** The props with each press handler wrapped to say its stage first (only with a testID). */
export function traceTap<P extends Handlers>(props: P): P & Handlers {
  const { testID } = props;
  if (!testID) return props;
  return {
    ...props,
    onPressIn: (e: GestureResponderEvent) => {
      say(testID, 'in', e);
      props.onPressIn?.(e);
    },
    onPressOut: (e: GestureResponderEvent) => {
      say(testID, 'out', e);
      props.onPressOut?.(e);
    },
    onPress: (e: GestureResponderEvent) => {
      say(testID, 'press', e);
      props.onPress?.(e);
    },
  };
}
