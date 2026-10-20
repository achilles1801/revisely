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
/** Height of the status line (in the screen's breadcrumb row). */
export const RECITE_STATUS_HEIGHT = 26;

interface ReciteStatusProps {
  phase: RecitePhase;
  /** Listening, but the reciter's place hasn't been found yet. */
  finding: boolean;
  /** Where the reciter is. */
  verse: WordRef | null;
  mistakes: number;
}

/** What the status line says, by phase. */
export function reciteStatusText(phase: RecitePhase, finding: boolean, verse: WordRef | null): string {
  if (phase === 'starting') return 'Getting ready…';
  if (phase === 'finishing') return 'Finishing…';
  if (finding || !verse) return 'Listening · start reciting';
  const surah = getSurahDisplay(verse.sura)?.nameDisplay ?? `Surah ${verse.sura}`;
  return `${surah} · Verse ${verse.ayah}`;
}

/**
 * Where the reciter is and the mistakes so far, in place of the screen's
 * breadcrumb (Juz · Hizb, surah) while checking: a row of its own, so a surah's
 * name is never cut short, nothing crowds the controls or the timer in the
 * bottom bar, and the page keeps its size.
 */
export function ReciteStatus({ phase, finding, verse, mistakes }: ReciteStatusProps) {
  const { theme } = useTheme();
  const placed = phase === 'listening' && !finding && !!verse;
  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      <Text
        style={[typography.bodySmall, { color: theme.textPrimary, fontWeight: '600', flexShrink: 1 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {reciteStatusText(phase, finding, verse)}
      </Text>
      {placed && (
        <View
          style={[
            styles.badge,
            mistakes > 0 ? { backgroundColor: RECITE_COLORS.wrong } : { backgroundColor: theme.textMuted + '26' },
          ]}
        >
          <Text style={[styles.badgeText, mistakes === 0 && { color: theme.textMuted }]}>
            {mistakes === 0 ? 'No mistakes' : `${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}`}
          </Text>
        </View>
      )}
    </View>
  );
}

interface ReciteBarProps {
  phase: RecitePhase;
  /** Listening, but the reciter's place hasn't been found yet. */
  finding: boolean;
  /** Read on every frame for the level ring (no re-render). */
  levelDb: () => number;
  speaking: () => boolean;
  hidden: boolean;
  onToggleHide: () => void;
  onHint: () => void;
  onStop: () => void;
  palette: ReadPalette;
}

/**
 * The controls while checking recitation, in the screen's bottom bar: a mic that
 * moves with the voice, then a hint (while words are hidden), hide or show the
 * words, and stop. Where the reciter is goes on the status line above
 * (ReciteStatus), so the bar fits beside the timer on any phone.
 */
export function ReciteBar({
  phase,
  finding,
  levelDb,
  speaking,
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

  const placed = phase === 'listening' && !finding;

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
      <View style={styles.spacer} />
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
  spacer: { flex: 1 },
  status: {
    flex: 1,
    height: RECITE_STATUS_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badge: { height: 20, borderRadius: 10, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
