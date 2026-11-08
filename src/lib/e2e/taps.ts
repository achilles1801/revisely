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

/**
 * Every touch that reaches JavaScript on the app's root (not a Modal's, which has a root of its own),
 * in the app's log: where, and how many touches JavaScript holds as down. With the taps' own trace
 * (traceTap above) it says where a tap the app ignored was lost: no "touch start" (iOS delivered it, by
 * device.log, and React Native never passed it to JavaScript), or a start with more touches down
 * than fingers (one JavaScript thinks is still down keeps the next tap from reaching a button).
 */
export function touchLine(kind: string, e: GestureResponderEvent): string {
  const n = e.nativeEvent;
  const where = typeof n.pageX === 'number' ? ` at (${Math.round(n.pageX)}, ${Math.round(n.pageY)})` : '';
  return `[e2e] touch ${kind}${where} on ${targetName(e)}, ${n.touches?.length ?? '?'} down, ${n.changedTouches?.length ?? '?'} changed`;
}

type Fiber = { memoizedProps?: { testID?: unknown } | null; return?: Fiber | null };

/**
 * What a touch landed on: the nearest testID at or above the view under the finger, through the
 * component behind React Native's public instance (`__internalInstanceHandle`, on both kinds Fabric
 * gives), else the view's native tag. A touch on a button that never pressed then names the button.
 */
export function targetName(e: GestureResponderEvent): string {
  try {
    let fiber = (e.target as unknown as { __internalInstanceHandle?: Fiber } | null)?.__internalInstanceHandle ?? null;
    for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return ?? null) {
      const id = fiber.memoizedProps?.testID;
      if (typeof id === 'string' && id) return id;
    }
  } catch {
    // The tag below.
  }
  const tag = (e.nativeEvent as { target?: unknown }).target;
  return typeof tag === 'number' ? `#${tag}` : '?';
}
