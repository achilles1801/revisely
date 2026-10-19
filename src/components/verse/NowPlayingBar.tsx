import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { getSurahDisplay } from '../../lib/quranData';
import { RecitationState } from '../../lib/recitation';

/** Height of the bar; screens reserve this much under the page for it. */
export const NOW_PLAYING_HEIGHT = 52;

interface NowPlayingBarProps {
  state: RecitationState;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  /** Previous / next verse; omitted when there is none (start or end of range). */
  onPrevious?: () => void;
  onNext?: () => void;
  /** Who is reciting (reciter and style). */
  voiceName: string;
  /** Tap on the reciter's name: choose another. */
  onPickReciter: () => void;
}

/**
 * Recitation controls, laid out in the screen's bottom bar (never over the
 * page): stop, the verse and reciter (tap to change reciter), previous,
 * play/pause, next.
 */
export function NowPlayingBar({
  state,
  onPause,
  onResume,
  onStop,
  onPrevious,
  onNext,
  voiceName,
  onPickReciter,
}: NowPlayingBarProps) {
  const { theme } = useTheme();
  if (state.status === 'idle' || !state.verse) return null;
  const surah = getSurahDisplay(state.verse.sura)?.nameDisplay ?? '';
  const failed = state.status === 'error';
  const playing = state.status === 'playing';

  const skip = (icon: 'play-skip-back' | 'play-skip-forward', label: string, onPress?: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      style={styles.iconBtn}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
    >
      <Ionicons name={icon} size={18} color={onPress ? theme.textPrimary : theme.textMuted} />
    </Pressable>
  );

  return (
    <View style={styles.inner}>
      <GlassCard elevated style={StyleSheet.absoluteFillObject} />
      <Pressable onPress={onStop} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Stop">
        <Ionicons name="stop" size={16} color={theme.textSecondary} />
      </Pressable>
      <Pressable
        style={styles.text}
        onPress={onPickReciter}
        accessibilityRole="button"
        accessibilityLabel={`${surah} ${state.verse.sura}:${state.verse.ayah}, ${voiceName}. Choose reciter`}
      >
        <Text style={[typography.bodySmall, { color: theme.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
          {surah} {state.verse.sura}:{state.verse.ayah}
        </Text>
        <View style={styles.voiceRow}>
          <Text
            style={[typography.caption, { color: failed ? theme.error : theme.textMuted, flexShrink: 1 }]}
            numberOfLines={1}
          >
            {failed ? "Couldn't play. Check your connection." : voiceName}
          </Text>
          {!failed && <Ionicons name="chevron-down" size={12} color={theme.textMuted} />}
        </View>
      </Pressable>
      {skip('play-skip-back', 'Previous verse', onPrevious)}
      <Pressable
        onPress={playing ? onPause : onResume}
        hitSlop={8}
        style={[styles.playBtn, { backgroundColor: theme.accent }]}
        accessibilityLabel={playing ? 'Pause' : failed ? 'Retry' : 'Play'}
      >
        {state.status === 'loading' ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name={playing ? 'pause' : failed ? 'refresh' : 'play'} size={18} color="#fff" />
        )}
      </Pressable>
      {skip('play-skip-forward', 'Next verse', onNext)}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    height: NOW_PLAYING_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  text: { flex: 1, paddingHorizontal: spacing.xs },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
