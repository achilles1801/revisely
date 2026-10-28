import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { Box, placeMenu } from './menuPlacement';

type IconName = keyof typeof Ionicons.glyphMap;

interface VerseMenuProps {
  /** Where the finger pressed (window coordinates); null hides the menu. */
  point: { x: number; y: number } | null;
  /** The held verse's lines on screen: the menu goes beside them, not over them. */
  anchor?: Box | null;
  onPlay: () => void;
  /** Under "Play": who recites, and how far. */
  playSubtitle?: string;
  onTranslation: () => void;
  /** The verse's Arabic and its reference, to the clipboard. */
  onCopy: () => void;
  /** The same text, to the share sheet. */
  onShare: () => void;
  onClose: () => void;
  /** The held verse ("Al-Baqarah 2:255"), for VoiceOver. */
  verseLabel?: string;
}

export const MENU_WIDTH = 264;
const SPRING = { damping: 18, stiffness: 320, mass: 0.7 };

interface Row {
  key: string;
  label: string;
  icon: IconName;
  subtitle?: string;
  onPress: () => void;
}

/**
 * The menu on a held verse: Play, Translation, Copy and Share, in a small card
 * next to the verse (below it, or above it near the bottom) rather than a sheet
 * over half the page. Nothing is dimmed: the page stays as it is and the verse
 * stays highlighted. A touch anywhere else closes it.
 *
 * It is a view in the screen, not a native modal, so a choice can open the
 * verse sheet or the share sheet at once (iOS can't present one modal while
 * another is going away). The parent closes it when a row is chosen.
 */
export function VerseMenu({
  point,
  anchor,
  onPlay,
  playSubtitle,
  onTranslation,
  onCopy,
  onShare,
  onClose,
  verseLabel,
}: VerseMenuProps) {
  const { palette, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const visible = point != null;

  // What it was opened with stays while it closes.
  const last = useRef({ point, anchor, playSubtitle, verseLabel });
  if (visible) last.current = { point, anchor, playSubtitle, verseLabel };
  const shown = last.current;

  const [mounted, setMounted] = useState(visible);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [frame, setFrame] = useState({ x: 0, y: 0, width: windowSize.width, height: windowSize.height });
  const container = useRef<View>(null);
  const firstRow = useRef<View>(null);
  const progress = useSharedValue(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const finishClose = useCallback(() => {
    if (!visibleRef.current) setMounted(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    progress.value = withTiming(0, { duration: 120 }, (done) => {
      if (done) runOnJS(finishClose)();
    });
  }, [visible, progress, finishClose]);

  // Where the overlay sits in the window: the press is in window coordinates.
  const onContainerLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setFrame((f) => ({ ...f, width, height }));
    container.current?.measureInWindow?.((x, y) => {
      if (Number.isFinite(x) && Number.isFinite(y)) setFrame({ x, y, width, height });
    });
  };

  const placement =
    size && shown.point
      ? placeMenu({
          menu: size,
          verse: shown.anchor ? { ...shown.anchor, x: shown.anchor.x - frame.x, y: shown.anchor.y - frame.y } : null,
          point: { x: shown.point.x - frame.x, y: shown.point.y - frame.y },
          screen: { width: frame.width, height: frame.height },
          insets: {
            top: Math.max(0, insets.top - frame.y),
            bottom: Math.max(0, insets.bottom - (windowSize.height - frame.y - frame.height)),
            left: insets.left,
            right: insets.right,
          },
        })
      : null;
  const placed = placement != null;

  // In once it has a place: a quick spring out of the finger's side.
  useEffect(() => {
    if (!visible || !placed) return;
    progress.value = 0;
    progress.value = withSpring(1, SPRING);
    // VoiceOver moves into the menu.
    const t = setTimeout(() => {
      if (firstRow.current) AccessibilityInfo.sendAccessibilityEvent(firstRow.current, 'focus');
    }, 50);
    return () => clearTimeout(t);
  }, [visible, placed, point, progress]);

  const card = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35], [0, 1], 'clamp'),
    transform: reduceMotion ? [] : [{ scale: interpolate(progress.value, [0, 1], [0.6, 1]) }],
  }));

  if (!mounted) return null;

  const of = shown.verseLabel ? ` ${shown.verseLabel}` : '';
  const groups: Row[][] = [
    [
      { key: 'play', label: 'Play', icon: 'play', subtitle: shown.playSubtitle ?? 'to the end of the juz', onPress: onPlay },
      { key: 'translation', label: 'Translation', icon: 'language-outline', onPress: onTranslation },
    ],
    [
      { key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: onCopy },
      { key: 'share', label: 'Share', icon: 'share-outline', onPress: onShare },
    ],
  ];
  // VoiceOver hears which verse: there is no title.
  const spoken: Record<string, string> = {
    play: `Play${of}`,
    translation: of ? `Translation of${of}` : 'Translation',
    copy: `Copy${of}`,
    share: `Share${of}`,
  };

  return (
    <View
      ref={container}
      style={StyleSheet.absoluteFill}
      pointerEvents={visible ? 'box-none' : 'none'}
      onLayout={onContainerLayout}
      // VoiceOver stays in the menu; the escape gesture closes it.
      accessibilityViewIsModal={visible}
      onAccessibilityEscape={onClose}
      testID="verse-menu"
    >
      {/* No dimming: the page stays as it is. Any touch outside closes the
          menu at once: a tap, or the start of a swipe. */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onClose}
        accessible={false}
        testID="verse-menu-backdrop"
      />
      <Animated.View
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (!size || size.width !== width || size.height !== height) setSize({ width, height });
        }}
        style={[
          styles.card,
          {
            backgroundColor: palette.sheet,
            borderColor: palette.outline,
            shadowColor: palette.shadow,
            shadowOpacity: isDark ? 0 : 0.14,
            left: placement?.left ?? 0,
            top: placement?.top ?? 0,
          },
          placement ? { transformOrigin: [placement.origin.x, placement.origin.y, 0] } : styles.unplaced,
          card,
        ]}
        testID="verse-menu-card"
      >
        {/* Clips the rows to the corners; the card itself keeps its shadow. */}
        <View style={styles.clip}>
          {groups.map((rows, g) => (
            <View key={g}>
              {g > 0 ? (
                <View style={[styles.groupGap, { backgroundColor: palette.fill, borderColor: palette.separator }]} />
              ) : null}
              {rows.map((r, i) => (
                <View key={r.key}>
                  {i > 0 ? <View style={[styles.separator, { backgroundColor: palette.separator }]} /> : null}
                  <Pressable
                    ref={g === 0 && i === 0 ? firstRow : undefined}
                    onPress={r.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={[spoken[r.key], r.subtitle].filter(Boolean).join(', ')}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.fill }]}
                    testID={`verse-menu-${r.key}`}
                  >
                    <Ionicons name={r.icon} size={20} color={palette.text} style={styles.icon} />
                    <View style={styles.label}>
                      <Text style={[typeV2.body, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                        {r.label}
                      </Text>
                      {r.subtitle ? (
                        <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                          {r.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const RADIUS = radiusV2.cancel - 2;

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 8,
  },
  clip: { borderRadius: RADIUS, overflow: 'hidden' },
  // Measured before it is shown.
  unplaced: { opacity: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  icon: { marginRight: 12, width: 22, textAlign: 'center' },
  label: { flex: 1 },
  separator: { height: layoutV2.hairline, marginLeft: 48 },
  groupGap: { height: 6, borderTopWidth: layoutV2.hairline, borderBottomWidth: layoutV2.hairline },
});
