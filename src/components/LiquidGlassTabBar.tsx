import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import type { MainTabParamList } from '../navigation/MainNavigator';

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Read: { active: 'book', inactive: 'book-outline' },
  Insights: { active: 'sparkles', inactive: 'sparkles-outline' },
  Progress: { active: 'bookmarks', inactive: 'bookmarks-outline' },
};

const FULL_SCREEN_ROUTES = new Set<string>([
  'ActiveRevision',
  'Memorization',
  'PlanEdit',
  'QuranReader',
]);

const PILL_HEIGHT = 52;
const BUBBLE_SIZE = 40;
const PILL_PADDING_H = 6;
const SIDE_MARGIN = 24;

// Mirrors SwiftUI `interactiveSpring(response: 0.3, dampingFraction: 0.7)`.
const SPRING_CONFIG = { damping: 26, stiffness: 320, mass: 0.7 };

const NATIVE_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * Vertical space the floating tab bar / action bar visually occupies.
 * Use to leave clearance at the bottom of scrollable content.
 */
export function useTabBarFootprint() {
  const insets = useSafeAreaInsets();
  const bottomGap = insets.bottom > 0 ? insets.bottom : 14;
  return PILL_HEIGHT + bottomGap;
}

function isHidden(tabBarStyle: unknown): boolean {
  if (!tabBarStyle) return false;
  const flat = StyleSheet.flatten(tabBarStyle as StyleProp<ViewStyle>) as
    | ViewStyle
    | undefined;
  return flat?.display === 'none';
}

type LiquidGlassTabBarProps = BottomTabBarProps & {
  /** Hide the Insights tab from the visible tab bar (it's still registered as a route). */
  showInsightsTab?: boolean;
  /** Pulse a halo behind the Insights tab icon as a one-time discovery hook. */
  glowInsightsTab?: boolean;
  /** When set, tapping the Insights tab calls this instead of navigating to the route. */
  onInsightsTabPress?: () => void;
};

export function LiquidGlassTabBar({
  state,
  descriptors,
  navigation,
  showInsightsTab = true,
  glowInsightsTab = false,
  onInsightsTabPress,
}: LiquidGlassTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  // Routes the user can actually see in the bar. The Insights route is still
  // registered in the navigator even when hidden — we just don't render its
  // tab item, and all index math (indicator, focus) uses the visible list.
  const visibleRoutes = showInsightsTab
    ? state.routes
    : state.routes.filter((r) => r.name !== 'Insights');

  const focusedRoute = state.routes[state.index];
  const visibleFocusedIndex = Math.max(
    0,
    visibleRoutes.findIndex((r) => r.key === focusedRoute.key),
  );

  const indicatorPos = useSharedValue(visibleFocusedIndex);

  useEffect(() => {
    indicatorPos.value = withSpring(visibleFocusedIndex, SPRING_CONFIG);
  }, [visibleFocusedIndex, indicatorPos]);

  const tabSlot = trackWidth > 0 ? trackWidth / visibleRoutes.length : 0;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          indicatorPos.value * tabSlot + (tabSlot - BUBBLE_SIZE) / 2,
      },
    ],
  }));

  const focusedTabRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedTabRoute.key].options;

  // Hide for full-screen nested routes (ActiveRevision, EditJuz).
  const nestedFocused = getFocusedRouteNameFromRoute(
    focusedTabRoute as RouteProp<MainTabParamList>,
  );
  if (nestedFocused && FULL_SCREEN_ROUTES.has(nestedFocused)) {
    return null;
  }

  // Hide when the focused screen opts out via setOptions({ tabBarStyle: { display: 'none' } }).
  // Screens use this to swap the tab bar out for a contextual action bar.
  if (isHidden(focusedOptions.tabBarStyle)) {
    return null;
  }

  const bottomGap = insets.bottom > 0 ? insets.bottom : 14;

  const renderTabs = () => (
    <View
      style={styles.row}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {visibleRoutes.map((route) => (
        <TabItem
          key={route.key}
          routeName={route.name}
          routeKey={route.key}
          focused={route.key === focusedRoute.key}
          glowing={glowInsightsTab && route.name === 'Insights'}
          onPressOverride={
            route.name === 'Insights' ? onInsightsTabPress : undefined
          }
          theme={theme}
          isDark={isDark}
          navigation={navigation}
        />
      ))}
    </View>
  );

  const indicator = tabSlot > 0 && (
    <Animated.View
      pointerEvents="none"
      style={[styles.indicatorWrap, indicatorStyle]}
    >
      {NATIVE_GLASS ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={isDark ? 'dark' : 'light'}
          tintColor={theme.accent}
          style={styles.indicatorSurface}
        />
      ) : (
        <View
          style={[
            styles.indicatorSurface,
            styles.indicatorFallback,
            { backgroundColor: theme.accent },
          ]}
        />
      )}
    </Animated.View>
  );

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(120)}
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: bottomGap }]}
    >
      {NATIVE_GLASS ? (
        <GlassContainer spacing={24} style={styles.pillSlot}>
          <GlassView
            glassEffectStyle="clear"
            colorScheme={isDark ? 'dark' : 'light'}
            tintColor={
              isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.30)'
            }
            style={styles.pillBackground}
          />
          {indicator}
          {renderTabs()}
          <View pointerEvents="none" style={styles.specular} />
        </GlassContainer>
      ) : (
        <View
          style={[
            styles.pillSlot,
            styles.pillFallback,
            {
              borderColor: isDark
                ? 'rgba(255,255,255,0.10)'
                : 'rgba(255,255,255,0.45)',
            },
          ]}
        >
          <BlurView
            intensity={70}
            tint={isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
            style={styles.pillBackground}
          />
          {indicator}
          {renderTabs()}
          <View pointerEvents="none" style={styles.specular} />
        </View>
      )}
    </Animated.View>
  );
}

type TabItemProps = {
  routeName: string;
  routeKey: string;
  focused: boolean;
  glowing: boolean;
  /** If set, called instead of dispatching tabPress / navigating. */
  onPressOverride?: () => void;
  theme: ThemeColors;
  isDark: boolean;
  navigation: BottomTabBarProps['navigation'];
};

function TabItem({
  routeName,
  routeKey,
  focused,
  glowing,
  onPressOverride,
  theme,
  isDark,
  navigation,
}: TabItemProps) {
  const icons = TAB_ICONS[routeName] ?? {
    active: 'ellipse',
    inactive: 'ellipse-outline',
  };
  const inactiveColor = isDark ? theme.textMuted : theme.textSecondary;

  const pulse = useSharedValue(0);

  useEffect(() => {
    if (glowing) {
      pulse.value = withRepeat(
        withTiming(1, {
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [glowing, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.25, 0.7]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.85, 1.25]) }],
  }));

  const onPress = () => {
    if (onPressOverride) {
      Haptics.selectionAsync();
      onPressOverride();
      return;
    }
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      Haptics.selectionAsync();
      navigation.navigate(routeName as never);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={routeName}
      onPress={onPress}
      hitSlop={6}
      style={styles.tabItem}
    >
      {glowing && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowHalo,
            { backgroundColor: theme.accent },
            glowStyle,
          ]}
        />
      )}
      <Ionicons
        name={focused ? icons.active : icons.inactive}
        size={22}
        color={focused ? '#FFFFFF' : inactiveColor}
      />
    </Pressable>
  );
}

/**
 * Floating contextual action bar that matches the tab bar exactly — same
 * shape, same material, same position. Use to replace the tab bar in
 * edit / selection modes (Mail/Photos pattern).
 *
 * Pair with `navigation.setOptions({ tabBarStyle: { display: 'none' } })`
 * on the active screen so the two bars swap cleanly instead of stacking.
 */
export function LiquidGlassActionBar({
  children,
}: {
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const bottomGap = insets.bottom > 0 ? insets.bottom : 14;

  const content = (
    <>
      <View style={styles.actionRow}>{children}</View>
      <View pointerEvents="none" style={styles.specular} />
    </>
  );

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(120)}
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: bottomGap }]}
    >
      {NATIVE_GLASS ? (
        <GlassView
          glassEffectStyle="clear"
          colorScheme={isDark ? 'dark' : 'light'}
          tintColor={
            isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.30)'
          }
          style={styles.pillSlot}
        >
          {content}
        </GlassView>
      ) : (
        <View
          style={[
            styles.pillSlot,
            styles.pillFallback,
            {
              borderColor: isDark
                ? 'rgba(255,255,255,0.10)'
                : 'rgba(255,255,255,0.45)',
            },
          ]}
        >
          <BlurView
            intensity={70}
            tint={isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
            style={styles.pillBackground}
          />
          {content}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'stretch',
  },
  pillSlot: {
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    marginHorizontal: SIDE_MARGIN,
    paddingHorizontal: PILL_PADDING_H,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  pillFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pillBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PILL_HEIGHT / 2,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    height: PILL_HEIGHT,
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    height: PILL_HEIGHT,
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  tabItem: {
    flex: 1,
    height: PILL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowHalo: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  indicatorWrap: {
    position: 'absolute',
    top: (PILL_HEIGHT - BUBBLE_SIZE) / 2,
    left: PILL_PADDING_H,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
  },
  indicatorSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BUBBLE_SIZE / 2,
  },
  indicatorFallback: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  specular: {
    position: 'absolute',
    left: PILL_PADDING_H * 2,
    right: PILL_PADDING_H * 2,
    top: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 1,
  },
});
