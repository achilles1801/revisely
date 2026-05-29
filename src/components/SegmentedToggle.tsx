import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedToggleProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const SPRING = { damping: 18, stiffness: 200, mass: 0.7 };
const TRACK_HEIGHT = 40;
const TRACK_PADDING = 4;

export function SegmentedToggle<T extends string = string>({
  options,
  value,
  onChange,
}: SegmentedToggleProps<T>) {
  const { theme, isDark } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme, isDark), [theme, isDark]);
  const [trackWidth, setTrackWidth] = useState(0);

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const indicatorPos = useSharedValue(selectedIndex);

  useEffect(() => {
    indicatorPos.value = withSpring(selectedIndex, SPRING);
  }, [selectedIndex, indicatorPos]);

  const segmentWidth =
    trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / options.length : 0;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPos.value * segmentWidth }],
    width: segmentWidth,
  }));

  return (
    <View
      style={styles.track}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 && (
        <Animated.View style={[styles.indicator, indicatorStyle]} />
      )}
      {options.map((opt, i) => {
        const isActive = i === selectedIndex;
        return (
          <PressableScale
            key={opt.value}
            haptic="selection"
            scale={0.97}
            onPress={() => onChange(opt.value)}
            style={styles.segment}
          >
            <Text
              style={[
                styles.label,
                { color: isActive ? theme.textPrimary : theme.textSecondary },
              ]}
            >
              {opt.label}
              {opt.count !== undefined && (
                <Text style={[styles.count, { color: theme.textMuted }]}>
                  {' '}
                  ({opt.count})
                </Text>
              )}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      height: TRACK_HEIGHT,
      padding: TRACK_PADDING,
      borderRadius: radius.full,
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    indicator: {
      position: 'absolute',
      top: TRACK_PADDING,
      left: TRACK_PADDING,
      height: TRACK_HEIGHT - TRACK_PADDING * 2,
      borderRadius: radius.full,
      backgroundColor: theme.surface,
      ...shadows.sm,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      ...typography.titleSmall,
      fontSize: 14,
    },
    count: {
      ...typography.caption,
      fontSize: 11,
      fontWeight: '400',
    },
  });
