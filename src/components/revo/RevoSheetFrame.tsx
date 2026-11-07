import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { layoutV2 } from '../../theme/v2';
import { Backdrop } from '../Backdrop';
import { shouldDismiss } from '../v2/Sheet';

/** Revo opens at about half the screen; a conversation, or a drag up, takes it to full height. */
export const REVO_MEDIUM = 0.55;
export const REVO_RADIUS = 22;
const SPRING = { damping: 24, stiffness: 300, mass: 0.8 };

/**
 * Revo's sheet: the `sheet` ground, radius 22, a 40 × 4 handle, and one soft Indigo glow at
 * the top-left. Two heights: medium (55%) and full. Dragging the handle up expands it; down
 * shrinks a full sheet, or closes a medium one (as every sheet closes: past the distance or a
 * fling). A tap on the backdrop closes it; VoiceOver's escape too. The keyboard lifts it.
 */
export function RevoSheetFrame({
  visible,
  onClose,
  full,
  onFullChange,
  children,
  testID = 'revo-sheet',
}: {
  visible: boolean;
  onClose: () => void;
  full: boolean;
  onFullChange: (full: boolean) => void;
  children: React.ReactNode;
  testID?: string;
}) {
  const { palette, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const fullHeight = height - insets.top - 8;
  const mediumHeight = Math.round(height * REVO_MEDIUM);
  const [shown, setShown] = useState(visible);

  // How far the sheet sits below its place: 0 shown, a sheet's height gone.
  const offset = useSharedValue(height);
  const sheetH = useSharedValue(full ? fullHeight : mediumHeight);
  const drag = useSharedValue(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const fullRef = useRef(onFullChange);
  fullRef.current = onFullChange;

  useEffect(() => {
    sheetH.value = reduceMotion ? withTiming(full ? fullHeight : mediumHeight, { duration: 120 }) : withSpring(full ? fullHeight : mediumHeight, SPRING);
  }, [full, fullHeight, mediumHeight, reduceMotion, sheetH]);

  useEffect(() => {
    if (visible) {
      setShown(true);
      // It rises at the height it opens at (the opt-in and a conversation at full height), rather
      // than coming up at the medium height and growing.
      sheetH.value = full ? fullHeight : mediumHeight;
      drag.value = 0;
      offset.value = height;
      offset.value = withTiming(0, { duration: 260 });
    } else if (shown) {
      offset.value = withTiming(height, { duration: 200 }, (done) => {
        if (done) runOnJS(setShown)(false);
      });
    }
    // Only `visible` drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
          drag.value = e.translationY;
        })
        .onEnd((e) => {
          const up = e.translationY < -40 || e.velocityY < -800;
          if (up) {
            drag.value = withSpring(0, SPRING);
            runOnJS(fullRef.current)(true);
            return;
          }
          if (shouldDismiss(e.translationY, e.velocityY, sheetH.value)) {
            drag.value = withSpring(0, SPRING);
            if (sheetH.value > mediumHeight + 40) runOnJS(fullRef.current)(false);
            else runOnJS(closeRef.current)();
            return;
          }
          drag.value = withSpring(0, SPRING);
        })
        .withTestId(`${testID}-drag`),
    [drag, sheetH, mediumHeight, testID],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetH.value,
    transform: [{ translateY: offset.value + Math.max(0, drag.value) + Math.min(0, drag.value) * 0.25 }],
  }));
  const dim = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, offset.value / Math.max(1, sheetH.value)) }));

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.fill}>
        <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay }, dim]}>
          <Backdrop onPress={onClose} label="Close Revo" />
        </Reanimated.View>
        <KeyboardAvoidingView style={styles.bottom} behavior="padding" pointerEvents="box-none">
          <Reanimated.View
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            style={[styles.sheet, { backgroundColor: palette.sheet, paddingBottom: Math.max(insets.bottom, 12) }, sheetStyle]}
            testID={testID}
          >
            {/* One soft glow, top-left: the primary at 10% (30% in dark). */}
            <Svg pointerEvents="none" style={styles.glow} width={420} height={260}>
              <Defs>
                <RadialGradient id="revoGlow" cx="20%" cy="0%" rx="80%" ry="100%">
                  <Stop offset="0" stopColor={palette.primary} stopOpacity={isDark ? 0.3 : 0.1} />
                  <Stop offset="1" stopColor={palette.primary} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width={420} height={260} fill="url(#revoGlow)" />
            </Svg>
            <GestureDetector gesture={pan}>
              <View
                collapsable={false}
                style={styles.grab}
                accessible
                accessibilityRole="button"
                accessibilityLabel={full ? 'Close' : 'Close. Swipe up to expand'}
                accessibilityActions={[{ name: 'activate', label: 'Close' }, { name: 'increment', label: 'Expand' }]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === 'increment') onFullChange(true);
                  else onClose();
                }}
                testID={`${testID}-handle`}
              >
                <View style={[styles.handle, { backgroundColor: palette.handle }]} />
              </View>
            </GestureDetector>
            <View style={styles.fill}>{children}</View>
          </Reanimated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: REVO_RADIUS,
    borderTopRightRadius: REVO_RADIUS,
    overflow: 'hidden',
  },
  glow: { position: 'absolute', top: 0, left: 0 },
  grab: { alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  handle: { width: layoutV2.handle.width, height: layoutV2.handle.height, borderRadius: layoutV2.handle.height / 2 },
});
