import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { getSurahDisplay } from '../../lib/quranData';
import type { ReadPalette } from '../../theme/readPalette';
import type { WordRef } from '../../lib/recite/quranWords';
import type { RecitePhase } from './useRecitationCheck';
import { RECITE_COLORS } from './wordLayers';

/** Height of the bar (the same as the verse player's). */
export const RECITE_BAR_HEIGHT = 52;

interface ReciteBarProps {
  phase: RecitePhase;
  /** Listening, but the reciter's place hasn't been found yet. */
  finding: boolean;
  /** Read on every frame for the level ring (no re-render). */
  levelDb: () => number;
  speaking: () => boolean;
  /** Where the reciter is. */
  verse: WordRef | null;
  mistakes: number;
  hidden: boolean;
  onToggleHide: () => void;
  onHint: () => void;
  onStop: () => void;
  palette: ReadPalette;
}

/**
 * The controls while checking recitation, in the screen's bottom bar: a mic that
 * moves with the voice, where the reciter is and the mistakes so far, hide words,
 * a hint (while hidden), and stop.
 */
export function ReciteBar({
  phase,
  finding,
  levelDb,
  speaking,
  verse,
  mistakes,
  hidden,
  onToggleHide,
  onHint,
  onStop,
}: ReciteBarProps) {
  const { theme } = useTheme();
  const level = useSharedValue(0);
  const listening = phase === 'listening';

  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => {
      // -55 dBFS (quiet) .. -15 dBFS (loud) as 0..1.
      const v = Math.max(0, Math.min(1, (levelDb() + 55) / 40));
      level.value = withTiming(speaking() ? v : v * 0.4, { duration: 90 });
    }, 90);
    return () => clearInterval(id);
  }, [listening, levelDb, speaking, level]);

  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + level.value * 0.45 }],
    opacity: 0.25 + level.value * 0.5,
  }));

  const surah = verse ? getSurahDisplay(verse.sura)?.nameDisplay ?? '' : '';
  const placed = phase === 'listening' && !finding && !!verse;
  const title =
    phase === 'starting'
      ? 'Getting ready…'
      : phase === 'finishing'
        ? 'Finishing…'
        : placed
          ? surah
          : 'Start reciting';
  const subtitle = phase !== 'listening' ? ' ' : placed ? `Verse ${verse.ayah}` : 'Listening…';

  const icon = (name: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, active = false) => (
    <Pressable
      onPress={onPress}
      disabled={!listening}
      hitSlop={6}
      style={[styles.iconBtn, active && { backgroundColor: theme.accent + '22' }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled: !listening }}
    >
      <Ionicons name={name} size={19} color={active ? theme.accent : theme.textPrimary} />
    </Pressable>
  );

  return (
    <View style={styles.inner}>
      <GlassCard elevated style={StyleSheet.absoluteFillObject} />
      <View style={styles.mic}>
        <Animated.View style={[styles.ring, { backgroundColor: theme.accent }, ring]} />
        <View style={[styles.micDisc, { backgroundColor: theme.accent }]}>
          {listening ? (
            <Ionicons name="mic" size={17} color="#fff" />
          ) : (
            <ActivityIndicator size="small" color="#fff" />
          )}
        </View>
      </View>
      <View style={styles.text} accessibilityLiveRegion="polite">
        <View style={styles.titleRow}>
          <Text
            style={[typography.bodySmall, { color: theme.textPrimary, fontWeight: '600', flexShrink: 1 }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {placed && mistakes > 0 && (
            <View
              style={[styles.badge, { backgroundColor: RECITE_COLORS.wrong }]}
              accessibilityLabel={`${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}`}
            >
              <Text style={styles.badgeText}>{mistakes}</Text>
            </View>
          )}
        </View>
        <Text style={[typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {/* A hint needs a place: the next word. */}
      {hidden && placed && icon('bulb-outline', 'Show the next word', onHint)}
      {icon(hidden ? 'eye-off' : 'eye-outline', hidden ? 'Show the words' : 'Hide the words', onToggleHide, hidden)}
      <Pressable
        onPress={onStop}
        disabled={phase === 'finishing'}
        hitSlop={8}
        style={[styles.stopBtn, { borderColor: theme.border, backgroundColor: theme.glass }]}
        accessibilityRole="button"
        accessibilityLabel="Stop and see mistakes"
      >
        <View style={[styles.stopSquare, { backgroundColor: theme.textPrimary }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    height: RECITE_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.xs + 2,
    paddingRight: spacing.sm,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  mic: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 40, height: 40, borderRadius: 20 },
  micDisc: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, paddingHorizontal: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stopBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  stopSquare: { width: 12, height: 12, borderRadius: 2.5 },
});
