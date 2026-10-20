import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { typography, fonts } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { getSurahDisplay } from '../../lib/quranData';
import type { CheckMistake, CheckRecord } from '../../lib/recite/checkHistory';
import type { QuranWords } from '../../lib/recite/quranWords';
import { formatRecordingTime } from '../../lib/recordingFormat';
import { RECITE_COLORS } from './wordLayers';
import { checkStats, groupMistakes, rangeLabel } from '../../lib/recite/checkSummary';

interface CheckSummarySheetProps {
  /** The check to show; null hides the sheet. */
  record: CheckRecord | null;
  words: QuranWords | null;
  /** The user says a word was right after all. */
  onDismissMistake: (word: number) => void;
  /** Show a word on its page. */
  onShowWord: (word: number) => void;
  onClose: () => void;
}

/** After a check: how it went, and each mistake in its verse. */
export function CheckSummarySheet({ record, words, onDismissMistake, onShowWord, onClose }: CheckSummarySheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const groups = useMemo(() => (record && words ? groupMistakes(record, words) : []), [record, words]);
  if (!record || !words) return null;
  const stats = checkStats(record);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessible={false} onPress={onClose}>
        <Pressable
          accessible={false}
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text style={[typography.titleLarge, { color: theme.textPrimary }]}>
            {stats.mistakes === 0 ? 'No mistakes' : 'Recitation check'}
          </Text>
          <Text style={[typography.bodySmall, { color: theme.textMuted, marginTop: 2 }]}>
            {rangeLabel(record, words)} · {formatRecordingTime(record.durationMs)}
          </Text>

          <View style={styles.stats}>
            <Stat label="Words" value={String(record.recited)} />
            <Stat
              label={stats.mistakes === 1 ? 'Mistake' : 'Mistakes'}
              value={String(stats.mistakes)}
              color={stats.mistakes > 0 ? RECITE_COLORS.wrong : theme.success}
            />
            <Stat label="Accuracy" value={`${stats.accuracy}%`} />
          </View>

          <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
            {groups.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: theme.glass, borderColor: theme.border }]}>
                <Ionicons name="checkmark-circle" size={28} color={theme.success} />
                <Text style={[typography.bodyMedium, { color: theme.textPrimary, flex: 1 }]}>
                  Every word you recited was right.
                </Text>
              </View>
            ) : (
              groups.map((g) => {
                const surah = getSurahDisplay(g.sura)?.nameDisplay ?? '';
                return (
                  <View key={`${g.sura}:${g.ayah}`} style={[styles.card, { backgroundColor: theme.glass, borderColor: theme.border }]}>
                    <View style={styles.cardHead}>
                      <Text style={[typography.label, { color: theme.textMuted, flex: 1 }]}>
                        {surah} · {g.ayah}
                      </Text>
                      <Pressable
                        onPress={() => onShowWord(g.mistakes[0].w)}
                        hitSlop={8}
                        style={styles.show}
                        accessibilityRole="button"
                        accessibilityLabel={`Show ${surah} ${g.ayah} on the page`}
                      >
                        <Text style={[typography.caption, { color: theme.accent, fontWeight: '600' }]}>Show</Text>
                        <Ionicons name="chevron-forward" size={12} color={theme.accent} />
                      </Pressable>
                    </View>
                    <Text style={[styles.verse, { color: theme.textPrimary }]}>
                      {g.words.map((w, i) => {
                        const m = g.byWord.get(w);
                        return (
                          <Text key={w} style={m ? { color: colorOf(m), textDecorationLine: m.k === 'missed' && !m.c ? 'underline' : 'none' } : undefined}>
                            {words.uthmani(w)}
                            {i < g.words.length - 1 ? ' ' : ''}
                          </Text>
                        );
                      })}
                    </Text>
                    {g.skipped ? (
                      <MistakeRow label="Skipped verse" color={RECITE_COLORS.missed} />
                    ) : (
                      g.mistakes.map((m) => (
                        <MistakeRow
                          key={m.w}
                          word={words.uthmani(m.w)}
                          label={describe(m)}
                          color={colorOf(m)}
                          onDismiss={() => onDismissMistake(m.w)}
                        />
                      ))
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          <PressableScale
            onPress={onClose}
            haptic="light"
            scale={0.98}
            style={[styles.done, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
          >
            <Text style={styles.doneText}>Done</Text>
          </PressableScale>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function colorOf(m: CheckMistake): string {
  if (m.c) return RECITE_COLORS.corrected;
  return m.k === 'wrong' ? RECITE_COLORS.wrong : RECITE_COLORS.missed;
}

function describe(m: CheckMistake): string {
  const what = m.k === 'wrong' ? (m.h ? `Heard “${m.h}”` : 'Wrong word') : 'Missed';
  return m.c ? `${what}, then corrected` : what;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.glass, borderColor: theme.border }]}>
      <Text style={[typography.titleLarge, { color: color ?? theme.textPrimary }]}>{value}</Text>
      <Text style={[typography.caption, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

function MistakeRow({
  word,
  label,
  color,
  onDismiss,
}: {
  word?: string;
  label: string;
  color: string;
  onDismiss?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      {word ? <Text style={[styles.word, { color: theme.textPrimary }]}>{word}</Text> : null}
      <Text style={[typography.bodySmall, { color: theme.textSecondary, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      {onDismiss && (
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Not a mistake">
          <Text style={[typography.caption, { color: theme.textMuted }]}>Not a mistake</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    overflow: 'hidden',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  list: { flexGrow: 0, marginBottom: spacing.md },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  show: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  verse: {
    fontFamily: fonts.arabic,
    fontSize: 21,
    lineHeight: 40,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  word: { fontFamily: fonts.arabic, fontSize: 18 },
  done: { height: 50, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
