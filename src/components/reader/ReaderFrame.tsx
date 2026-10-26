import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../theme/spacing';

/** Room above the page: the header with the controls, the juz and surah while reading. */
export const READER_HEADER_HEIGHT = 48;

interface ReaderFrameProps {
  /** The controls are showing (otherwise: reading, nothing but the page). */
  chromeVisible: boolean;
  /** The screen is the focused one. Only then does it set the status bar,
   *  which is app-wide: hidden here must not stay hidden on the next screen. */
  active?: boolean;
  /** A tap anywhere that isn't a control (above or below the page as well as
   *  on it): show or hide the controls. */
  onBackgroundPress?: () => void;
  background: string;
  isDark: boolean;
  /** With the controls: the header (back, title, actions). */
  header: ReactNode;
  /** While reading: a quiet line above the page (the juz, the surah). */
  quietHeader: ReactNode;
  /** With the controls: what goes under the page. */
  footer: ReactNode;
  /** The room under the page for `footer`. Kept in both states, so the page
   *  never moves and the controls never cover it. */
  footerHeight: number;
  /** While reading: centred under the page (its number). */
  pageLabel: ReactNode;
  /** While reading: what is running (a recording, a recitation), beside the page number. */
  activity?: ReactNode;
  /** While reading: a line under the page number (a first-time hint). */
  hint?: ReactNode;
  /** The pages. */
  children: ReactNode;
}

// The status bar's height where it isn't inside the safe area (iPhones without
// a notch), so the top inset is the same whether or not it shows.
const STATUS_BAR_FLOOR = Platform.OS === 'ios' ? 20 : (StatusBar.currentHeight ?? 0);

/** The largest value seen, and at least the status bar: hiding the status bar
 *  must not shrink the top inset (it does on phones without a notch), or the
 *  page would move. */
function useStableInset(value: number): number {
  const [max, setMax] = useState(value);
  useEffect(() => {
    if (value > max) setMax(value);
  }, [value, max]);
  return Math.max(value, max, STATUS_BAR_FLOOR);
}

/**
 * The mushaf with its controls overlaid. The page sits between a fixed room
 * above and below it; tapping the page swaps what those rooms show: while
 * reading, only the juz and surah above and the page number below (no status
 * bar); with the controls, the header and the footer. The page itself doesn't
 * move between the two, and nothing ever covers it.
 */
export function ReaderFrame({
  chromeVisible,
  active = true,
  onBackgroundPress,
  background,
  isDark,
  header,
  quietHeader,
  footer,
  footerHeight,
  pageLabel,
  activity,
  hint,
  children,
}: ReaderFrameProps) {
  const insets = useSafeAreaInsets();
  const top = useStableInset(insets.top);
  const shown = useRef(new Animated.Value(chromeVisible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(shown, {
      toValue: chromeVisible ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [chromeVisible, shown]);
  const quiet = shown.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const fromAbove = shown.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] });
  const fromBelow = shown.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });
  const hiddenFromReader = (hidden: boolean) =>
    ({
      accessibilityElementsHidden: hidden,
      importantForAccessibility: hidden ? 'no-hide-descendants' : 'auto',
    }) as const;

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      {active && (
        <StatusBar
          hidden={!chromeVisible}
          animated
          showHideTransition="fade"
          barStyle={isDark ? 'light-content' : 'dark-content'}
        />
      )}
      {onBackgroundPress && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onBackgroundPress}
          accessible={false}
          testID="reader-background"
        />
      )}
      <View style={[styles.pages, { top: top + READER_HEADER_HEIGHT, bottom: insets.bottom + footerHeight }]}>
        {children}
      </View>

      {/* Reading */}
      <Animated.View
        pointerEvents="none"
        style={[styles.top, { top, opacity: quiet }]}
        testID="reader-quiet-header"
        {...hiddenFromReader(chromeVisible)}
      >
        {quietHeader}
      </Animated.View>
      <Animated.View
        pointerEvents={chromeVisible ? 'none' : 'box-none'}
        style={[styles.bottom, { bottom: insets.bottom, height: footerHeight, opacity: quiet }]}
        testID="reader-quiet-footer"
        {...hiddenFromReader(chromeVisible)}
      >
        <View style={styles.quietRow} pointerEvents="box-none">
          <View style={[styles.side, styles.sideStart]} pointerEvents="box-none">
            {activity}
          </View>
          <View pointerEvents="none">{pageLabel}</View>
          <View style={styles.side} />
        </View>
        {hint ? (
          <View style={styles.hint} pointerEvents="none">
            {hint}
          </View>
        ) : null}
      </Animated.View>

      {/* The controls */}
      <Animated.View
        pointerEvents={chromeVisible ? 'box-none' : 'none'}
        style={[styles.top, { top, opacity: shown, transform: [{ translateY: fromAbove }] }]}
        testID="reader-header"
        {...hiddenFromReader(!chromeVisible)}
      >
        {header}
      </Animated.View>
      <Animated.View
        pointerEvents={chromeVisible ? 'box-none' : 'none'}
        style={[
          styles.bottom,
          { bottom: insets.bottom, height: footerHeight, opacity: shown, transform: [{ translateY: fromBelow }] },
        ]}
        testID="reader-footer"
        {...hiddenFromReader(!chromeVisible)}
      >
        {footer}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pages: { position: 'absolute', left: 0, right: 0 },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: READER_HEADER_HEIGHT,
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0 },
  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  side: { flex: 1, flexDirection: 'row' },
  hint: { alignItems: 'center', paddingTop: 2 },
  sideStart: { justifyContent: 'flex-start' },
});
