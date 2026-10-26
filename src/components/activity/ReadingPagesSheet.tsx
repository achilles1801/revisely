import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { summarizeRevisedPages } from '../../lib/journal';
import { formatDuration, formatPageRanges, parsePageRanges } from '../../lib/readingTimer';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { ReadingSession } from '../../types';

/** Assign pages to a session: free-form ranges plus a one-tap suggestion. */
export function ReadingPagesSheet({
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
            <GlassCard surface="chrome" style={StyleSheet.absoluteFillObject} />
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
