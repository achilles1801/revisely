import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useMiniPlayer } from '../../lib/nowPlaying';
import { getRecitation, resolveVoice, shortVoiceLabel, verseTitle } from '../../lib/recitation';
import type { VerseKey } from '../../lib/verses';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';

export const MINI_PLAYER_HEIGHT = 52;
/** Between the mini player and the tab bar. */
export const MINI_PLAYER_GAP = 8;

/**
 * The recitation, while it plays somewhere you aren't looking: ▶/❚❚, the verse
 * and reciter on one line, ✕ to stop and › back to the reader at that verse.
 * Just above the tab bar; nothing else (no speed, options or timer: those are
 * in the reader).
 */
export function MiniPlayer({ bottom, onOpen }: { bottom: number; onOpen: (verse: VerseKey) => void }) {
  const { palette, isDark } = useTheme();
  const { state, visible } = useMiniPlayer();
  if (!visible || !state.verse) return null;

  const recitation = getRecitation();
  const verse = state.verse;
  const loading = state.status === 'loading';
  const failed = state.status === 'error';
  const playing = state.status === 'playing' || loading;
  const title = verseTitle(verse);
  const reciter = shortVoiceLabel(resolveVoice(recitation.getVoice()));
  const detail = failed ? 'Couldn’t play' : reciter;

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(160)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom }]}
      testID="mini-player"
    >
      <View
        style={[
          styles.capsule,
          {
            backgroundColor: palette.sheet,
            borderColor: palette.outline,
            shadowColor: palette.shadow,
            shadowOpacity: isDark ? 0 : 0.1,
          },
        ]}
      >
        <Pressable
          onPress={() => (playing ? recitation.pause() : recitation.resume())}
          hitSlop={6}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={failed ? 'Try again' : playing ? 'Pause recitation' : 'Play recitation'}
          testID="mini-play-pause"
        >
          {loading ? (
            <ActivityIndicator size="small" color={palette.text} />
          ) : (
            <Ionicons name={failed ? 'refresh' : playing ? 'pause' : 'play'} size={22} color={palette.text} />
          )}
        </Pressable>
        <Pressable
          onPress={() => onOpen(verse)}
          style={({ pressed }) => [styles.label, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${detail}. Open in the reader`}
          testID="mini-label"
        >
          <Text style={[typeV2.body, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {title}
            <Text style={{ color: failed ? palette.red : palette.secondary }}>{`  ·  ${detail}`}</Text>
          </Text>
        </Pressable>
        <Pressable
          onPress={() => recitation.stop()}
          hitSlop={6}
          style={({ pressed }) => [styles.small, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Stop recitation"
          testID="mini-stop"
        >
          <Ionicons name="close" size={18} color={palette.secondary} />
        </Pressable>
        <Pressable
          onPress={() => onOpen(verse)}
          hitSlop={6}
          style={({ pressed }) => [styles.small, styles.chevron, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open in the reader"
          testID="mini-open"
        >
          <Ionicons name="chevron-forward" size={20} color={palette.secondary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: layoutV2.gutter - 4, right: layoutV2.gutter - 4 },
  capsule: {
    height: MINI_PLAYER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radiusV2.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
    elevation: 6,
  },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, minWidth: 0, paddingHorizontal: 6, height: 40, justifyContent: 'center' },
  small: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  chevron: { marginRight: 2 },
  pressed: { opacity: 0.55 },
});
