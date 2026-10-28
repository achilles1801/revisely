import React, { ReactNode, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { speedLabel } from '../../lib/playbackPlan';
import type { RecitationState } from '../../lib/recitation';
import type { Anchor } from './SpeedMenu';

/** Height of the capsule; the reader keeps this much free under the page. */
export const CAPSULE_HEIGHT = 52;

/** What the capsule needs from the verse actions (useVerseActions().player). */
export interface PlayerControls {
  /** This screen's recitation (idle when nothing of its own plays). */
  state: RecitationState;
  /** Who recites (reciter and style). */
  voiceName: string;
  /** Playback speed (1 = normal). */
  speed: number;
  /** Recite from the top of a page. */
  onPlayPage: (page: number) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  /** Previous / next verse; omitted at the edge of the range. */
  onPrevious?: () => void;
  onNext?: () => void;
  onPickReciter: () => void;
  /** The speed chip: its menu opens above `anchor`. */
  onSpeed: (anchor: Anchor) => void;
  /** Audio Options (reciter, speed, the ayahs to play, repeats, pauses). */
  onOptions: () => void;
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
  /** Its surface, from the reader's palette. */
  surface: { background: string; border: string };
}

/**
 * The reader's one control capsule, under the page (never over it). Idle: ▶
 * from the top of the page, the reciter, and Audio Options. While reciting:
 * stop · speed · previous · play/pause · next · Audio Options (the verse
 * itself is highlighted on the page). Then recording and the timer.
 */
export function PlayerCapsule({ player, page, record, timer, trailing, compact, surface }: PlayerCapsuleProps) {
  const { theme } = useTheme();
  const { state } = player;
  const active = state.status !== 'idle' && state.verse != null;
  const playing = state.status === 'playing';
  const failed = state.status === 'error';
  const chip = useRef<View>(null);

  const iconBtn = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: (() => void) | undefined,
    size = 18,
    testID?: string,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      style={styles.iconBtn}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      testID={testID}
    >
      <Ionicons name={icon} size={size} color={onPress ? theme.textPrimary : theme.textMuted} />
    </Pressable>
  );

  const openSpeed = () =>
    chip.current?.measureInWindow((x, y, width, height) => player.onSpeed({ x, y, width, height }));

  const playPause = (
    <Pressable
      onPress={playing ? player.onPause : player.onResume}
      hitSlop={6}
      style={[styles.playBtn, { backgroundColor: theme.accent }]}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : failed ? 'Retry' : 'Play'}
      testID="player-play-pause"
    >
      {state.status === 'loading' ? (
        <ActivityIndicator size="small" color={theme.onAccent} />
      ) : (
        <Ionicons
          name={playing ? 'pause' : failed ? 'refresh' : 'play'}
          size={18}
          color={theme.onAccent}
          style={!playing && !failed ? styles.playIcon : undefined}
        />
      )}
    </Pressable>
  );

  const options = iconBtn('options-outline', 'Audio options', player.onOptions, 20, 'player-options');

  return (
    <View
      style={[
        styles.capsule,
        { backgroundColor: surface.background, borderColor: surface.border, borderWidth: StyleSheet.hairlineWidth },
      ]}
      testID="player-capsule"
    >
      {active ? (
        <>
          {iconBtn('stop', 'Stop', player.onStop, 15, 'player-stop')}
          {failed ? (
            <Text
              style={[typography.caption, styles.text, { color: theme.error }]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.2}
              accessibilityLiveRegion="polite"
            >
              Couldn’t play. Check your connection.
            </Text>
          ) : (
            <>
              <Pressable
                ref={chip}
                onPress={openSpeed}
                hitSlop={6}
                style={[styles.speed, { borderColor: theme.border }]}
                accessibilityRole="button"
                accessibilityLabel={`Speed ${speedLabel(player.speed)}. Change speed`}
                testID="player-speed"
              >
                <Text style={[typography.caption, styles.speedText, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.2}>
                  {speedLabel(player.speed)}
                </Text>
              </Pressable>
              <View style={styles.spacer} />
              {!compact && iconBtn('play-back', 'Previous verse', player.onPrevious, 20, 'player-previous')}
            </>
          )}
          {playPause}
          {!failed && !compact && iconBtn('play-forward', 'Next verse', player.onNext, 20, 'player-next')}
          {!failed && <View style={styles.spacer} />}
          {options}
        </>
      ) : (
        <>
          <Pressable
            onPress={() => player.onPlayPage(page)}
            hitSlop={6}
            style={[styles.playBtn, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Play from this page"
            testID="player-play-page"
          >
            <Ionicons name="play" size={18} color={theme.onAccent} style={styles.playIcon} />
          </Pressable>
          <Pressable
            style={styles.text}
            onPress={player.onPickReciter}
            accessibilityRole="button"
            accessibilityLabel={`${player.voiceName}. Choose reciter`}
          >
            <View style={styles.voiceRow}>
              <Text style={[typography.bodySmall, { color: theme.textPrimary, flexShrink: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {player.voiceName}
              </Text>
              <Ionicons name="chevron-down" size={12} color={theme.textMuted} />
            </View>
          </Pressable>
          {options}
        </>
      )}
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
  spacer: { flex: 1, minWidth: 0 },
  speed: {
    minWidth: 40,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedText: { fontWeight: '600' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  // The play triangle looks centred a point to the right.
  playIcon: { marginLeft: 2 },
  divider: { width: StyleSheet.hairlineWidth * 2, height: 22, marginHorizontal: 2 },
});
