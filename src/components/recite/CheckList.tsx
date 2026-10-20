import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import {
  CheckRecord,
  checksForDay,
  deleteCheck,
  dismissMistakes,
  onChecksChanged,
} from '../../lib/recite/checkHistory';
import { checkStats, rangeLabel } from '../../lib/recite/checkSummary';
import { loadQuranWords, QuranWords } from '../../lib/recite/quranWords';
import { formatRecordingTime } from '../../lib/recordingFormat';
import { logger } from '../../lib/logger';
import { CheckSummarySheet } from './CheckSummarySheet';
import { RECITE_COLORS } from './wordLayers';

interface CheckListProps {
  day: string;
  /** Shown above the list, only when there are checks. */
  header?: React.ReactNode;
}

const timeOfDay = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** A day's recitation checks; tap one for its mistakes. Nothing when there are none. */
export function CheckList({ day, header }: CheckListProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [checks, setChecks] = useState<CheckRecord[]>([]);
  const [words, setWords] = useState<QuranWords | null>(null);
  const [open, setOpen] = useState<CheckRecord | null>(null);

  const load = useCallback(() => {
    checksForDay(day)
      .then(async (list) => {
        setChecks([...list].reverse());
        if (list.length > 0) setWords(await loadQuranWords());
      })
      .catch((err) => logger.warn('Could not load recitation checks', err));
  }, [day]);

  useEffect(() => {
    load();
    return onChecksChanged(load);
  }, [load]);

  if (checks.length === 0 || !words) return null;

  const confirmDelete = (c: CheckRecord) =>
    Alert.alert('Delete this check?', 'Its mistakes will no longer be marked on the page.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCheck(c.id) },
    ]);

  return (
    <>
      {header}
      <View style={styles.group}>
        <GlassCard style={StyleSheet.absoluteFillObject} />
        {checks.map((c, i) => {
          const { mistakes } = checkStats(c);
          return (
            <PressableScale
              key={c.id}
              onPress={() => setOpen(c)}
              onLongPress={() => confirmDelete(c)}
              haptic="light"
              scale={0.99}
              accessibilityLabel={`Recitation check, ${rangeLabel(c, words)}, ${mistakes} mistakes`}
            >
              <View style={[styles.row, i < checks.length - 1 && styles.rowDivider]}>
                <View style={[styles.icon, { backgroundColor: theme.accent + '20' }]}>
                  <Ionicons name="mic" size={15} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {rangeLabel(c, words)}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {timeOfDay(c.startedAt)} · {formatRecordingTime(c.durationMs)} · {c.recited} words
                  </Text>
                </View>
                <Text style={[styles.value, { color: mistakes > 0 ? RECITE_COLORS.wrong : theme.success }]}>
                  {mistakes === 0 ? 'No mistakes' : `${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}`}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </View>
            </PressableScale>
          );
        })}
      </View>
      <CheckSummarySheet
        record={open}
        words={words}
        onDismissMistake={(w) => {
          if (!open) return;
          dismissMistakes(open.id, [w]).catch((err) => logger.warn('Could not update check', err));
          setOpen({ ...open, mistakes: open.mistakes.filter((m) => m.w !== w) });
        }}
        onShowWord={() => setOpen(null)}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    group: { borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.lg },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    title: { ...typography.bodyMedium, color: theme.textPrimary, fontWeight: '600' },
    meta: { ...typography.caption, color: theme.textMuted, marginTop: 2 },
    value: { ...typography.bodySmall, fontWeight: '600' },
  });
