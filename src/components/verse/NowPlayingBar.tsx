import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { getSurahDisplay } from '../../lib/quranData';
import { RECITERS, RecitationState } from '../../lib/recitation';

interface NowPlayingBarProps {
  state: RecitationState;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  bottom: number;
}

/** Floating controls while a verse recitation is playing, paused or failed. */
export function NowPlayingBar({ state, onPause, onResume, onStop, bottom }: NowPlayingBarProps) {
  const { theme } = useTheme();
  if (state.status === 'idle' || !state.verse) return null;
  const surah = getSurahDisplay(state.verse.sura)?.nameDisplay ?? '';
  const failed = state.status === 'error';

  return (
    <View style={[styles.bar, { bottom }]} pointerEvents="box-none">
      <View style={styles.inner}>
        <GlassCard elevated style={StyleSheet.absoluteFillObject} />
        <Pressable
          onPress={state.status === 'playing' ? onPause : onResume}
          hitSlop={8}
          style={[styles.btn, { backgroundColor: theme.accent }]}
          accessibilityLabel={state.status === 'playing' ? 'Pause' : failed ? 'Retry' : 'Play'}
        >
          {state.status === 'loading' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name={state.status === 'playing' ? 'pause' : failed ? 'refresh' : 'play'}
              size={18}
              color="#fff"
            />
          )}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyMedium, { color: theme.textPrimary }]} numberOfLines={1}>
            {surah} {state.verse.sura}:{state.verse.ayah}
          </Text>
          <Text style={[typography.caption, { color: failed ? theme.error : theme.textMuted }]} numberOfLines={1}>
            {failed ? "Couldn't play. Check your connection." : RECITERS[0].name}
          </Text>
        </View>
        <Pressable onPress={onStop} hitSlop={10} accessibilityLabel="Stop">
          <Ionicons name="close" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: spacing.md, right: spacing.md },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  btn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
