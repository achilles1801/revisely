import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { useNow, useReadingTimer } from '../context/ReadingTimerContext';
import { displayMs, formatClock } from '../lib/readingTimer';

/**
 * Stopwatch entry point. Idle: a plain icon. While a session is going it
 * becomes a pill with the live clock, so the timer is visible from anywhere.
 */
export function TimerButton({
  onPress,
  color,
  activeColor,
  activeBg,
  idle,
}: {
  onPress: () => void;
  /** Icon color when idle. */
  color: string;
  activeColor: string;
  activeBg: string;
  /** Custom idle rendering (e.g. wrapped in a glass circle). */
  idle?: React.ReactNode;
}) {
  const { timer } = useReadingTimer();
  const now = useNow(timer?.runningSince != null);

  if (!timer) {
    return (
      <PressableScale
        onPress={onPress}
        haptic="light"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Reading timer"
      >
        {idle ?? <Ionicons name="stopwatch-outline" size={20} color={color} />}
      </PressableScale>
    );
  }

  const paused = timer.runningSince == null;
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel="Reading timer running"
    >
      <View style={[styles.pill, { backgroundColor: activeBg }]}>
        <Ionicons name={paused ? 'pause' : 'stopwatch'} size={14} color={activeColor} />
        <Text style={[styles.time, { color: activeColor }]}>
          {formatClock(displayMs(timer, now))}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  time: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
