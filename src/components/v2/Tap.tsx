import React, { useRef } from 'react';
import { GestureResponderEvent, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

/**
 * A press doesn't count once the finger has gone this far sideways (pt): that's a swipe. The tab
 * pager takes a sideways move from 12 pt (navigation/PagerTabs, activeOffsetX); when it misses one,
 * the row under the finger must not open (TAB-1).
 */
export const SIDEWAYS_IS_A_SWIPE = 12;

/**
 * A pressable for the new design: it dims while held (no scale, no buzz).
 * Haptics mark outcomes instead (design/haptics).
 *
 * A touch that moved more than SIDEWAYS_IS_A_SWIPE sideways presses nothing (TAB-1): a full-width row
 * contains any swipe across it, and a Pressable presses as long as the finger stays inside it, so a
 * swipe the tab pager didn't take opened the surah under the finger (Android, Nov 2026).
 */
export function Tap({
  style,
  children,
  pressedOpacity = 0.55,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pressedOpacity?: number;
}) {
  // E2E builds trace each press's stages (lib/e2e/taps); every other build drops this line (the
  // variable is inlined).
  const props =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    process.env.EXPO_PUBLIC_E2E === '1' ? (require('../../lib/e2e/taps') as typeof import('../../lib/e2e/taps')).traceTap(rest) : rest;
  const { onPress, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } = props;

  // Where this touch began and how far it has gone sideways. Cleared once the touch is over, so a
  // press that comes without a touch (VoiceOver, TalkBack, a keyboard) always counts.
  const touch = useRef<{ x: number; sideways: number } | null>(null);
  const over = () => {
    // After the release's press, which runs in the same event; never a touch that has begun since.
    const ended = touch.current;
    setTimeout(() => {
      if (touch.current === ended) touch.current = null;
    }, 0);
  };
  const xOf = (e: GestureResponderEvent) => e?.nativeEvent?.pageX;
  const travelled = (e: GestureResponderEvent) => {
    const x = xOf(e);
    if (touch.current && typeof x === 'number') {
      touch.current.sideways = Math.max(touch.current.sideways, Math.abs(x - touch.current.x));
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [style, pressed && { opacity: pressedOpacity }]}
      {...props}
      onTouchStart={(e) => {
        const x = xOf(e);
        touch.current = typeof x === 'number' ? { x, sideways: 0 } : null;
        onTouchStart?.(e);
      }}
      onTouchMove={(e) => {
        travelled(e);
        onTouchMove?.(e);
      }}
      onTouchEnd={(e) => {
        travelled(e);
        over();
        onTouchEnd?.(e);
      }}
      onTouchCancel={(e) => {
        over();
        onTouchCancel?.(e);
      }}
      onPress={
        onPress
          ? (e) => {
              travelled(e);
              if (touch.current && touch.current.sideways > SIDEWAYS_IS_A_SWIPE) return;
              onPress(e);
            }
          : undefined
      }
    >
      {children}
    </Pressable>
  );
}
