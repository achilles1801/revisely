import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from '../v2/Tap';

export type ReciteMicMode = 'record' | 'recite' | 'check';

const SIZE = 40;

export const MIC_LABEL: Record<ReciteMicMode, string> = {
  record: 'Record',
  recite: 'Recite',
  check: 'Check your recitation',
};

/** Check's mark: a tick on its own gradient (palette.premium), with a lock while it isn't the account's. */
export function CheckMark({ size = 24, locked = false }: { size?: number; locked?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient
        colors={palette.premium as unknown as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Ionicons name="checkmark-done" size={Math.round(size * 0.62)} color={palette.onPremium} />
      </LinearGradient>
      {locked ? (
        <View style={[styles.lock, { backgroundColor: palette.sheet }]} testID="check-locked">
          <Ionicons name="lock-closed" size={9} color={palette.premium[0]} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The reader's one mic (Revisely Dev). A tap starts the mode it shows; held, it opens the choice of Record, Recite
 * and Check. A small badge says which: none for Recite, a red dot for Record, Check's mark for Check.
 */
export function ReciteMic({
  mode,
  starting,
  onPress,
  onLongPress,
}: {
  mode: ReciteMicMode;
  starting?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      disabled={starting}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={MIC_LABEL[mode]}
      accessibilityHint="Hold to choose Record, Recite or Check"
      accessibilityActions={[{ name: 'longpress', label: 'Choose Record, Recite or Check' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'longpress') onLongPress();
      }}
      testID="recite-mic"
    >
      <View style={[styles.mic, { backgroundColor: palette.primary }]}>
        {starting ? (
          <ActivityIndicator size="small" color={palette.onPrimary} />
        ) : (
          <Ionicons name="mic" size={20} color={palette.onPrimary} />
        )}
      </View>
      {mode === 'record' ? (
        <View style={[styles.badge, { backgroundColor: palette.bg }]} testID="recite-mic-badge-record">
          <View style={[styles.dot, { backgroundColor: palette.red }]} />
        </View>
      ) : mode === 'check' ? (
        <View style={[styles.badge, { backgroundColor: palette.bg }]} testID="recite-mic-badge-check">
          <CheckMark size={14} />
        </View>
      ) : null}
    </Tap>
  );
}

const styles = StyleSheet.create({
  mic: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  mark: { alignItems: 'center', justifyContent: 'center' },
  lock: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
