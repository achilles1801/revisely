import React, { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { getSurahDisplay } from '../../lib/quranData';
import type { RecitationState } from '../../lib/recitation';

/** Height of the capsule; the reader keeps this much free under the page. */
export const CAPSULE_HEIGHT = 52;

/** What the capsule needs from the verse actions (useVerseActions().player). */
export interface PlayerControls {
  /** This screen's recitation (idle when nothing of its own plays). */
  state: RecitationState;
  /** Who recites (reciter and style). */
  voiceName: string;
  /** Recite from the top of a page. */
  onPlayPage: (page: number) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  /** Previous / next verse; omitted at the edge of the range. */
  onPrevious?: () => void;
  onNext?: () => void;
  onPickReciter: () => void;
}

interface PlayerCapsuleProps {
  player: PlayerControls;
  /** The page on screen (▶ recites from its top). */
  page: number;
  /** The record control. */
  record?: ReactNode;
  /** The timer chip. */
  timer?: ReactNode;
  /** After everything (e.g. a revision session's Submit). */
  trailing?: ReactNode;
  /** Narrow, or crowded: no previous / next. */
  compact?: boolean;
  /** A solid surface (the reader's palette: glass disappears on a black page). */
  surface?: { background: string; border: string };
}

/**
 * The reader's one control capsule, under the page (never over it): the
 * recitation (▶ from the top of the page and the reciter, or, while reciting,
 * stop · the verse · previous · play/pause · next), then recording and the
 * timer.
 */
export function PlayerCapsule({ player, page, record, timer, trailing, compact, surface }: PlayerCapsuleProps) {
  const { theme } = useTheme();
  const { state } = player;
  const active = state.status !== 'idle' && state.verse != null;
  const playing = state.status === 'playing';
  const failed = state.status === 'error';

  const iconBtn = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: (() => void) | undefined,
    size = 18,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      style={styles.iconBtn}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
    >
      <Ionicons name={icon} size={size} color={onPress ? theme.textPrimary : theme.textMuted} />
    </Pressable>
  );

  const surah = active ? (getSurahDisplay(state.verse!.sura)?.nameDisplay ?? '') : '';

  return (
    <View
      style={[
        styles.capsule,
        surface && { backgroundColor: surface.background, borderColor: surface.border, borderWidth: StyleSheet.hairlineWidth },
      ]}
      testID="player-capsule"
    >
      {!surface && <GlassCard surface="chrome" elevated style={StyleSheet.absoluteFillObject} />}
      {active && iconBtn('stop', 'Stop', player.onStop, 15)}
      {!active && (
        <Pressable
          onPress={() => player.onPlayPage(page)}
          hitSlop={6}
          style={[styles.playBtn, { backgroundColor: theme.accent }]}
          accessibilityRole="button"
          accessibilityLabel="Play from this page"
        >
          <Ionicons name="play" size={18} color="#fff" style={styles.playIcon} />
        </Pressable>
      )}
      <Pressable
        style={styles.text}
        onPress={player.onPickReciter}
        accessibilityRole="button"
        accessibilityLabel={`${active ? `${surah} ${state.verse!.sura}:${state.verse!.ayah}, ` : ''}${player.voiceName}. Choose reciter`}
      >
        {active && (
          <Text
            style={[typography.bodySmall, styles.verse, { color: theme.textPrimary }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            {state.verse!.sura}:{state.verse!.ayah} · {surah}
          </Text>
        )}
        <View style={styles.voiceRow}>
          <Text
            style={[
              active ? typography.caption : typography.bodySmall,
              { color: failed ? theme.error : active ? theme.textSecondary : theme.textPrimary, flexShrink: 1 },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            {failed ? 'Couldn’t play. Check your connection.' : player.voiceName}
          </Text>
          {!failed && <Ionicons name="chevron-down" size={12} color={theme.textMuted} />}
        </View>
      </Pressable>
      {active && !compact && iconBtn('play-skip-back', 'Previous verse', player.onPrevious)}
      {active && (
        <Pressable
          onPress={playing ? player.onPause : player.onResume}
          hitSlop={6}
          style={[styles.playBtn, { backgroundColor: theme.accent }]}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : failed ? 'Retry' : 'Play'}
        >
          {state.status === 'loading' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name={playing ? 'pause' : failed ? 'refresh' : 'play'}
              size={18}
              color="#fff"
              style={!playing && !failed ? styles.playIcon : undefined}
            />
          )}
        </Pressable>
      )}
      {active && !compact && iconBtn('play-skip-forward', 'Next verse', player.onNext)}
      {(record || timer || trailing) && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
      {record}
      {timer}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    height: CAPSULE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  text: { flex: 1, paddingHorizontal: spacing.xs, justifyContent: 'center', minWidth: 0 },
  verse: { fontWeight: '600' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  // The play triangle looks centred a point to the right.
  playIcon: { marginLeft: 2 },
  divider: { width: StyleSheet.hairlineWidth * 2, height: 22, marginHorizontal: 2 },
});
