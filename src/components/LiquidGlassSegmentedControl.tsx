import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';

const NATIVE_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

const HEIGHT = 36;
const PADDING = 3;
const RADIUS = HEIGHT / 2;

// Same spring as the tab bar — SwiftUI interactiveSpring(0.3, 0.7).
const SPRING_CONFIG = { damping: 26, stiffness: 320, mass: 0.7 };

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function LiquidGlassSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  const { theme, isDark } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  const index = Math.max(
    options.findIndex((o) => o.value === value),
    0,
  );
  const indicatorPos = useSharedValue(index);

  useEffect(() => {
    indicatorPos.value = withSpring(index, SPRING_CONFIG);
  }, [index, indicatorPos]);

  const slot =
    trackWidth > 0 ? (trackWidth - PADDING * 2) / options.length : 0;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPos.value * slot }],
  }));

  const segments = (
    <View
      style={styles.row}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {options.map((option) => {
        const focused = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={styles.segment}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            onPress={() => {
              if (option.value !== value) {
                Haptics.selectionAsync();
                onChange(option.value);
              }
            }}
          >
            {option.icon && (
              <Ionicons
                name={option.icon}
                size={15}
                color={focused ? theme.textPrimary : theme.textSecondary}
                style={{ marginRight: 5 }}
              />
            )}
            <Text
              style={[
                styles.label,
                { color: focused ? theme.textPrimary : theme.textSecondary },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const indicator = slot > 0 && (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.indicator,
        { width: slot },
        indicatorStyle,
      ]}
    >
      {NATIVE_GLASS ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={isDark ? 'dark' : 'light'}
          tintColor={
            isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.65)'
          }
          style={styles.indicatorSurface}
        />
      ) : (
        <View
          style={[
            styles.indicatorSurface,
            styles.indicatorFallback,
            { backgroundColor: theme.surface },
          ]}
        />
      )}
    </Animated.View>
  );

  if (NATIVE_GLASS) {
    return (
      // spacing=16 lets the indicator bond with the track surface on iOS 26.
      <GlassContainer spacing={16} style={styles.track}>
        <GlassView
          glassEffectStyle="clear"
          colorScheme={isDark ? 'dark' : 'light'}
          tintColor={
            isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.22)'
          }
          style={styles.trackBackground}
        />
        {indicator}
        {segments}
      </GlassContainer>
    );
  }

  return (
    <View style={[styles.track, styles.trackFallback]}>
      <BlurView
        intensity={50}
        tint={isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
        style={styles.trackBackground}
      />
      {indicator}
      {segments}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: HEIGHT,
    borderRadius: RADIUS,
    justifyContent: 'center',
  },
  trackFallback: {
    overflow: 'hidden',
  },
  trackBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    height: HEIGHT,
    paddingHorizontal: PADDING,
    // Ensure tap-target row + icons paint above the animated indicator pill
    // regardless of tree order in the GlassContainer.
    zIndex: 1,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  indicator: {
    position: 'absolute',
    top: PADDING,
    left: PADDING,
    height: HEIGHT - PADDING * 2,
    borderRadius: RADIUS - PADDING,
  },
  indicatorSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS - PADDING,
  },
  indicatorFallback: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
