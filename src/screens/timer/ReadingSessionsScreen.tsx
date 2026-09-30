import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useReadingTimer } from '../../context/ReadingTimerContext';
import * as firestoreService from '../../services/firestoreService';
import { getCurrentRevisionDay } from '../../lib/algorithm';
import { formatJournalDayRelative, shiftDay, summarizeRevisedPages } from '../../lib/journal';
import {
  formatDuration,
  formatPageRanges,
  parsePageRanges,
} from '../../lib/readingTimer';
import { logger } from '../../lib/logger';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { ReadingSession } from '../../types';

function formatTimeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function ReadingSessionsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useApp();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { timer } = useReadingTimer();

  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<ReadingSession | null>(null);

  const today = getCurrentRevisionDay(user);

  const load = useCallback(async () => {
    try {
      setSessions(await firestoreService.getReadingSessions());
    } catch (err) {
      logger.error('Failed to load reading sessions', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const totals = useMemo(() => {
    const weekFrom = shiftDay(today, -6);
    let all = 0;
    let week = 0;
    for (const s of sessions) {
      all += s.durationSeconds;
      if (s.date >= weekFrom) week += s.durationSeconds;
    }
    return { all, week };
  }, [sessions, today]);

  const byDay = useMemo(() => {
    const groups: { date: string; items: ReadingSession[] }[] = [];
    for (const s of sessions) {
      const last = groups[groups.length - 1];
      if (last && last.date === s.date) last.items.push(s);
      else groups.push({ date: s.date, items: [s] });
    }
    return groups;
  }, [sessions]);

  const savePages = async (session: ReadingSession, pages: number[]) => {
    setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, pages } : s)));
    setEditing(null);
    try {
      await firestoreService.updateReadingSessionPages(session.id, pages);
    } catch (err) {
      logger.error('Failed to update session pages', err);
      Alert.alert("Couldn't save pages", 'Please try again.');
      load();
    }
  };

  const remove = (session: ReadingSession) => {
    Alert.alert('Delete session?', `${formatDuration(session.durationSeconds)} of reading will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setEditing(null);
          setSessions((prev) => prev.filter((s) => s.id !== session.id));
          try {
            await firestoreService.deleteReadingSession(session.id);
          } catch (err) {
            logger.error('Failed to delete reading session', err);
            load();
          }
        },
      },
    ]);
  };

  const tint = isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          haptic="light"
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </PressableScale>
        <Text style={styles.title}>Reading sessions</Text>
        <PressableScale
          onPress={() => navigation.navigate('ReadingTimer')}
          haptic="light"
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="Open timer"
        >
          <Ionicons
            name={timer ? 'stopwatch' : 'stopwatch-outline'}
            size={22}
            color={timer ? theme.accent : theme.textPrimary}
          />
        </PressableScale>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={theme.textSecondary}
            />
          }
        >
          <GlassCard glassStyle="clear" specular tintColor={tint} style={styles.summary}>
            <Stat label="This week" value={formatDuration(totals.week)} theme={theme} />
            <Stat label="All time" value={formatDuration(totals.all)} theme={theme} emphasize />
            <Stat label="Sessions" value={`${sessions.length}`} theme={theme} />
          </GlassCard>

          {sessions.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="stopwatch-outline" size={36} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>No reading sessions yet</Text>
              <Text style={styles.emptyBody}>
                Start the timer when you sit down to read. Each session is logged here with its
                date and length.
              </Text>
              <PressableScale
                onPress={() => navigation.navigate('ReadingTimer')}
                haptic="medium"
                style={styles.emptyBtn}
              >
                <Text style={styles.emptyBtnText}>Start a session</Text>
              </PressableScale>
            </View>
          ) : (
            byDay.map((group) => (
              <View key={group.date} style={styles.dayGroup}>
                <Text style={styles.dayLabel}>
                  {formatJournalDayRelative(group.date, today).toUpperCase()}
                </Text>
                <View style={styles.group}>
                  <GlassCard style={StyleSheet.absoluteFillObject} />
                  {group.items.map((s, i) => (
                    <PressableScale
                      key={s.id}
                      onPress={() => setEditing(s)}
                      onLongPress={() => remove(s)}
                      haptic="light"
                      scale={0.99}
                    >
                      <View
                        style={[styles.row, i < group.items.length - 1 && styles.rowDivider]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowDuration}>{formatDuration(s.durationSeconds)}</Text>
                          <Text style={styles.rowMeta}>
                            {formatTimeOfDay(s.startedAt)} – {formatTimeOfDay(s.endedAt)}
                            {s.mode !== 'stopwatch' && s.targetSeconds
                              ? ` · ${Math.round(s.targetSeconds / 60)} min timer`
                              : ''}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.rowPages,
                            s.pages.length === 0 && { color: theme.accent },
                          ]}
                          numberOfLines={1}
                        >
                          {s.pages.length > 0 ? `p. ${formatPageRanges(s.pages)}` : 'Add pages'}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                      </View>
                    </PressableScale>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <PagesSheet
        session={editing}
        onClose={() => setEditing(null)}
        onSave={savePages}
        onDelete={remove}
        theme={theme}
      />
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  theme,
  emphasize,
}: {
  label: string;
  value: string;
  theme: ThemeColors;
  emphasize?: boolean;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text
        style={[
          typography.titleLarge,
          { fontWeight: '700', color: emphasize ? theme.accent : theme.textPrimary },
        ]}
      >
        {value}
      </Text>
      <Text style={[typography.caption, { color: theme.textMuted, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

/** Assign pages to a session: free-form ranges plus a one-tap suggestion. */
function PagesSheet({
  session,
  onClose,
  onSave,
  onDelete,
  theme,
}: {
  session: ReadingSession | null;
  onClose: () => void;
  onSave: (session: ReadingSession, pages: number[]) => void;
  onDelete: (session: ReadingSession) => void;
  theme: ThemeColors;
}) {
  const styles = useMemo(() => makeSheetStyles(theme), [theme]);
  const [text, setText] = useState('');
  const [lastId, setLastId] = useState<string | null>(null);

  // Reset the field whenever a different session is opened.
  if (session && session.id !== lastId) {
    setLastId(session.id);
    setText(formatPageRanges(session.pages));
  }
  if (!session && lastId !== null) setLastId(null);

  const parsed = parsePageRanges(text);
  const suggestion = session ? formatPageRanges(session.pagesVisited) : '';

  return (
    <Modal visible={!!session} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {session && (
          <View style={styles.sheet}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            <View style={styles.sheetHeader}>
              <PressableScale onPress={onClose} haptic="light" hitSlop={8}>
                <Text style={styles.cancel}>Cancel</Text>
              </PressableScale>
              <Text style={styles.sheetTitle}>Pages read</Text>
              <PressableScale
                onPress={() => parsed && onSave(session, parsed)}
                haptic="medium"
                hitSlop={8}
                disabled={!parsed}
              >
                <Text style={[styles.done, !parsed && { opacity: 0.4 }]}>Done</Text>
              </PressableScale>
            </View>

            <Text style={styles.meta}>
              {formatDuration(session.durationSeconds)} ·{' '}
              {new Date(session.startedAt).toLocaleDateString([], {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </Text>

            <View style={styles.inputWrap}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="e.g. 45–52, 60"
                placeholderTextColor={theme.textMuted}
                keyboardType="numbers-and-punctuation"
                autoFocus={session.pages.length === 0 && session.pagesVisited.length === 0}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={() => parsed && onSave(session, parsed)}
              />
              {text.length > 0 && (
                <PressableScale onPress={() => setText('')} haptic="light" hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                </PressableScale>
              )}
            </View>
            <Text style={[styles.help, !parsed && { color: theme.error }]}>
              {!parsed
                ? 'Use page numbers 1–604, like 45–52, 60'
                : parsed.length > 0
                  ? summarizeRevisedPages(parsed)
                  : 'Page numbers or ranges, separated by commas'}
            </Text>

            {suggestion !== '' && suggestion !== formatPageRanges(parsed ?? []) && (
              <PressableScale
                onPress={() => setText(suggestion)}
                haptic="selection"
                style={styles.suggestion}
              >
                <Ionicons name="book-outline" size={16} color={theme.accent} />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  Opened in reader: {suggestion}
                </Text>
                <Text style={styles.suggestionUse}>Use</Text>
              </PressableScale>
            )}

            <PressableScale
              onPress={() => onDelete(session)}
              haptic="light"
              style={styles.deleteBtn}
            >
              <Text style={styles.deleteText}>Delete session</Text>
            </PressableScale>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    title: { ...typography.titleMedium, color: theme.textPrimary },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    summary: {
      flexDirection: 'row',
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    dayGroup: { marginBottom: spacing.md },
    dayLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    group: { borderRadius: radius.md, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 56,
      gap: spacing.sm,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowDuration: {
      ...typography.titleSmall,
      color: theme.textPrimary,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    rowMeta: { ...typography.caption, color: theme.textMuted, marginTop: 2 },
    rowPages: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      maxWidth: '45%',
    },
    empty: { alignItems: 'center', paddingTop: spacing.xl, gap: spacing.sm },
    emptyTitle: { ...typography.titleMedium, color: theme.textPrimary },
    emptyBody: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
    },
    emptyBtn: {
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: theme.accent,
    },
    emptyBtnText: { ...typography.titleSmall, color: theme.textInverse, fontWeight: '600' },
  });

const makeSheetStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
      overflow: 'hidden',
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    sheetTitle: { ...typography.titleMedium, color: theme.textPrimary },
    cancel: { ...typography.bodyLarge, color: theme.textSecondary },
    done: { ...typography.bodyLarge, color: theme.accent, fontWeight: '600' },
    meta: {
      ...typography.caption,
      color: theme.textMuted,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      minHeight: 52,
      gap: spacing.xs,
    },
    input: {
      flex: 1,
      ...typography.bodyLarge,
      color: theme.textPrimary,
      paddingVertical: spacing.sm,
    },
    help: {
      ...typography.caption,
      color: theme.textMuted,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.md,
      padding: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: theme.accent + '22',
    },
    suggestionText: { ...typography.bodySmall, color: theme.textPrimary, flex: 1 },
    suggestionUse: { ...typography.bodySmall, color: theme.accent, fontWeight: '700' },
    deleteBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.md },
    deleteText: { ...typography.bodyMedium, color: theme.error },
  });
