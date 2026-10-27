import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../context/ThemeContext';
import { layoutV2 } from '../theme/v2';

type IconName = keyof typeof Ionicons.glyphMap;

// Icon-only: outline when idle, filled when selected.
const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Read: { active: 'book', inactive: 'book-outline' },
  Insights: { active: 'stats-chart', inactive: 'stats-chart-outline' },
};

const BAR_HEIGHT = 52;

function useBottomGap() {
  const insets = useSafeAreaInsets();
  return insets.bottom > 0 ? insets.bottom : 14;
}

/**
 * Vertical space the tab bar occupies at the bottom of the screen.
 * Use to leave clearance at the bottom of scrollable content.
 */
export function useTabBarFootprint() {
  return BAR_HEIGHT + useBottomGap();
}

function isHidden(tabBarStyle: unknown): boolean {
  if (!tabBarStyle) return false;
  const flat = StyleSheet.flatten(tabBarStyle as StyleProp<ViewStyle>) as ViewStyle | undefined;
  return flat?.display === 'none';
}

type TabBarProps = BottomTabBarProps & {
  /** Hide the Insights tab from the visible tab bar (it's still registered as a route). */
  showInsightsTab?: boolean;
  /** When set, tapping the Insights tab calls this instead of navigating to the route. */
  onInsightsTabPress?: () => void;
};

/**
 * The bottom bar: solid ground, a hairline on top, edge to edge, icon-only.
 */
export function TabBar({ state, descriptors, navigation, showInsightsTab = true, onInsightsTabPress }: TabBarProps) {
  const { palette } = useTheme();
  const bottomGap = useBottomGap();

  // Routes the user can actually see in the bar. The Insights route is still
  // registered in the navigator even when hidden; we just don't render its tab.
  const visibleRoutes = showInsightsTab ? state.routes : state.routes.filter((r) => r.name !== 'Insights');
  const focusedRoute = state.routes[state.index];

  // Hide when the focused screen opts out via setOptions({ tabBarStyle: { display: 'none' } }).
  if (isHidden(descriptors[focusedRoute.key].options.tabBarStyle)) return null;

  return (
    <View
      style={[styles.bar, { backgroundColor: palette.bg, borderTopColor: palette.separator, paddingBottom: bottomGap }]}
      testID="tab-bar-v2"
    >
      {visibleRoutes.map((route) => (
        <Tab
          key={route.key}
          routeName={route.name}
          routeKey={route.key}
          focused={route.key === focusedRoute.key}
          onPressOverride={route.name === 'Insights' ? onInsightsTabPress : undefined}
          navigation={navigation}
        />
      ))}
    </View>
  );
}

/**
 * A bar of actions in the tab bar's place (e.g. Memorization's Cancel and Save
 * while marking): the same ground, hairline and height. Hide the tab bar on
 * that screen so the two don't stack.
 */
export function ActionBar({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  const bottomGap = useBottomGap();
  return (
    <View style={[styles.bar, { backgroundColor: palette.bg, borderTopColor: palette.separator, paddingBottom: bottomGap }]}>
      <View style={styles.actionRow}>{children}</View>
    </View>
  );
}

/** A tab: no bubble, no buzz (the screen changing is the feedback). */
function Tab({
  routeName,
  routeKey,
  focused,
  onPressOverride,
  navigation,
}: {
  routeName: string;
  routeKey: string;
  focused: boolean;
  onPressOverride?: () => void;
  navigation: BottomTabBarProps['navigation'];
}) {
  const { palette } = useTheme();
  const icons = TAB_ICONS[routeName] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
  const onPress = () => {
    if (onPressOverride) {
      onPressOverride();
      return;
    }
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName as never);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={routeName}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.tab, pressed && { opacity: 0.55 }]}
      testID={`tab-${routeName}`}
    >
      <Ionicons name={focused ? icons.active : icons.inactive} size={26} color={focused ? palette.accentText : palette.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'stretch',
    flexDirection: 'row',
    borderTopWidth: layoutV2.hairline,
    paddingHorizontal: 12,
  },
  actionRow: {
    flex: 1,
    flexDirection: 'row',
    height: BAR_HEIGHT,
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  tab: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
