import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated as RNAnimated, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../context/ThemeContext';
import { fonts, typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { getHizbForPage, getJuzForPage, getSurahDisplay } from '../../lib/quranData';
import type { WordRef } from '../../lib/recite/quranWords';
import type { RecitePhase } from './useRecitationCheck';
import { RECITE_COLORS } from './wordLayers';

/** Height of the status line (in the screen's breadcrumb row). */
export const RECITE_STATUS_HEIGHT = 26;
/** The stop button. */
const FAB = 56;
/** Height of the panel (figures row, controls row and their spacing), for
 *  anything a screen shows above it while checking (e.g. an undo toast). */
export const RECITE_PANEL_HEIGHT = 30 + spacing.xs + FAB + spacing.sm * 2 + spacing.sm;

// ---------------------------------------------------------------------------
// Status line (the breadcrumb row while checking)
// ---------------------------------------------------------------------------

interface ReciteStatusProps {
  phase: RecitePhase;
  /** Listening, but the reciter's place hasn't been found yet. */
  finding: boolean;
  /** Where the reciter is. */
  verse: WordRef | null;
  /** The page on screen. */
  page: number;
}

/** What the status line says: the surah (or the phase) and where on the page. */
export function reciteStatusText(
  phase: RecitePhase,
  finding: boolean,
  verse: WordRef | null,
  page: number,
): { title: string; detail: string } {
  const where = `Page ${page} · Juz ${getJuzForPage(page)} · Hizb ${getHizbForPage(page)}`;
  if (phase === 'starting') return { title: 'Getting ready…', detail: where };
  if (phase === 'finishing') return { title: 'Finishing…', detail: where };
  if (finding || !verse) return { title: 'Start reciting', detail: where };
  const surah = getSurahDisplay(verse.sura)?.nameDisplay ?? `Surah ${verse.sura}`;
  return { title: surah, detail: `${where} · ${verse.sura}:${verse.ayah}` };
}

/**
 * Where the reciter is, in place of the screen's breadcrumb (Juz · Hizb, surah)
 * while checking, as Tarteel does: the surah, then page, juz, hizb and verse.
 * A row of its own, so nothing is cut short and the page keeps its size.
 */
export function ReciteStatus({ phase, finding, verse, page }: ReciteStatusProps) {
  const { theme } = useTheme();
  const { title, detail } = reciteStatusText(phase, finding, verse, page);
  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      <Text
        style={[typography.bodySmall, { color: theme.textPrimary, fontWeight: '600', flexShrink: 0 }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text
        style={[typography.caption, styles.detail, { color: theme.textMuted }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {detail}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Panel (the bottom of the screen while checking)
// ---------------------------------------------------------------------------

/** 0:42, 12:05, 1:02:09. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

interface RecitePanelProps {
  phase: RecitePhase;
  /** Listening, but the reciter's place hasn't been found yet. */
  finding: boolean;
  /** Read on a timer for the level ring and clock (no re-render needed). */
  levelDb: () => number;
  speaking: () => boolean;
  elapsedMs: () => number;
  /** The last words heard, as recognised (Arabic). */
  lastHeard: string;
  mistakes: number;
  /** Mistakes per page recited, and accuracy (per cent). */
  perPage: number;
  accuracy: number;
  hidden: boolean;
  onToggleHide: () => void;
  onHint: () => void;
  /** Back to the start of the verse (or the one before, at a verse's start). */
  onBack: () => void;
  onStop: () => void;
}

/**
 * The controls while checking recitation, as Tarteel lays them out: a row of
 * figures (mistakes, mistakes per page and accuracy, time) with the last words
 * heard, then hide or show the words, back a verse, a hint, and one large stop
 * button. It takes the whole bottom of the screen (the floating timer steps
 * aside meanwhile), so nothing is cut short or overlaps.
 */
export function RecitePanel({
  phase,
  finding,
  levelDb,
  speaking,
  elapsedMs,
  lastHeard,
  mistakes,
  perPage,
  accuracy,
  hidden,
  onToggleHide,
  onHint,
  onBack,
  onStop,
}: RecitePanelProps) {
  const { theme } = useTheme();
  const level = useSharedValue(0);
  const listening = phase === 'listening';
  const placed = listening && !finding;
  const [, tick] = useState(0);

  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => {
      // -55 dBFS (quiet) .. -15 dBFS (loud) as 0..1.
      const v = Math.max(0, Math.min(1, (levelDb() + 55) / 40));
      level.value = withTiming(speaking() ? v : v * 0.4, { duration: 90 });
    }, 90);
    const clock = setInterval(() => tick((t) => t + 1), 1000);
    return () => {
      clearInterval(id);
      clearInterval(clock);
    };
  }, [listening, levelDb, speaking, level]);

  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + level.value * 0.35 }],
    opacity: 0.2 + level.value * 0.45,
  }));

  // "Hidden verses: on / off" for a moment after the eye is tapped.
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new RNAnimated.Value(0)).current;
  const toggleHide = () => {
    onToggleHide();
    setToast(hidden ? 'Hidden verses: off' : 'Hidden verses: on');
    toastOpacity.stopAnimation();
    toastOpacity.setValue(1);
    RNAnimated.timing(toastOpacity, { toValue: 0, duration: 400, delay: 1200, useNativeDriver: true }).start(
      ({ finished }) => finished && setToast(null),
    );
  };

  const chip = (children: React.ReactNode, label: string) => (
    <View
      style={[styles.chip, { backgroundColor: theme.glass, borderColor: theme.border }]}
      accessible
      accessibilityLabel={label}
    >
      {children}
    </View>
  );
  const small = (
    name: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
    { active = false, enabled = listening } = {},
  ) => (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={6}
      style={[
        styles.smallBtn,
        { borderColor: theme.border, backgroundColor: active ? theme.accent + '22' : theme.glass },
        !enabled && { opacity: 0.4 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled: !enabled }}
    >
      <Ionicons name={name} size={19} color={active ? theme.accent : theme.textPrimary} />
    </Pressable>
  );

  const textStyle = [styles.chipText, { color: theme.textPrimary }];
  return (
    <View style={styles.panel}>
      {toast && (
        <RNAnimated.View
          pointerEvents="none"
          style={[styles.toast, { backgroundColor: theme.textPrimary, opacity: toastOpacity }]}
        >
          <Text style={[styles.toastText, { color: theme.bg }]}>{toast}</Text>
        </RNAnimated.View>
      )}
      <View style={styles.figures}>
        {chip(
          <>
            <Ionicons name="alert-circle" size={14} color={mistakes > 0 ? RECITE_COLORS.wrong : theme.textMuted} />
            <Text style={textStyle}>{mistakes}</Text>
          </>,
          `${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}`,
        )}
        {chip(
          <Text style={textStyle}>
            {formatPerPage(perPage)}
            <Text style={{ color: theme.textMuted }}> /pg · </Text>
            {accuracy}%
          </Text>,
          `${formatPerPage(perPage)} mistakes a page, ${accuracy}% accurate`,
        )}
        {chip(
          <>
            <View style={[styles.recDot, { backgroundColor: listening ? RECITE_COLORS.wrong : theme.textMuted }]} />
            <Text style={textStyle}>{formatElapsed(elapsedMs())}</Text>
          </>,
          `Listening for ${formatElapsed(elapsedMs())}`,
        )}
        <Text
          style={[styles.heard, { color: theme.textSecondary }]}
          numberOfLines={1}
          ellipsizeMode="head"
          accessibilityLabel={lastHeard ? `Heard: ${lastHeard}` : undefined}
        >
          {lastHeard}
        </Text>
      </View>
      <View style={styles.controls}>
        <GlassCard elevated style={StyleSheet.absoluteFillObject} />
        {small(hidden ? 'eye-off' : 'eye-outline', hidden ? 'Show the words' : 'Hide the words', toggleHide, {
          active: hidden,
        })}
        {small('play-back', 'Back a verse', onBack, { enabled: placed })}
        {/* A hint needs a place: the next word, while words are hidden. */}
        {small('bulb-outline', 'Show the next word', onHint, { enabled: placed && hidden })}
        <View style={styles.spacer} />
        <View style={styles.fabWrap}>
          <Animated.View style={[styles.fabRing, { backgroundColor: theme.accent }, ring]} />
          <Pressable
            onPress={onStop}
            disabled={phase === 'finishing'}
            style={[styles.fab, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Stop and see mistakes"
          >
            {listening ? <View style={styles.stopSquare} /> : <ActivityIndicator color="#fff" />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** 0, 1.5, 12. */
function formatPerPage(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const styles = StyleSheet.create({
  status: {
    flex: 1,
    height: RECITE_STATUS_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detail: { flex: 1, textAlign: 'right' },
  panel: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  figures: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 9,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  recDot: { width: 7, height: 7, borderRadius: 3.5 },
  heard: { flex: 1, fontFamily: fonts.arabic, fontSize: 17, textAlign: 'right', writingDirection: 'rtl' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: FAB + spacing.sm * 2,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    overflow: 'visible',
  },
  smallBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  spacer: { flex: 1 },
  fabWrap: { width: FAB, height: FAB, alignItems: 'center', justifyContent: 'center' },
  fabRing: { position: 'absolute', width: FAB, height: FAB, borderRadius: FAB / 2 },
  fab: { width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 18, height: 18, borderRadius: 3.5, backgroundColor: '#fff' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    top: -40,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    zIndex: 1,
  },
  toastText: { fontSize: 13, fontWeight: '600' },
});
