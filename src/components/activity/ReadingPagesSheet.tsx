import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../PressableScale';
import { summarizeRevisedPages } from '../../lib/journal';
import { formatDuration, formatPageRanges, parsePageRanges } from '../../lib/readingTimer';
import { ThemeColors } from '../../theme/v2';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { ReadingSession } from '../../types';
import { Sheet } from '../v2/Sheet';

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

  const save = () => session && parsed && onSave(session, parsed);
  const body = session ? (
    <>
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
          onSubmitEditing={save}
        />
        {text.length > 0 && (
          <PressableScale onPress={() => setText('')} hitSlop={8}>
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
        style={styles.deleteBtn}
      >
        <Text style={styles.deleteText}>Delete session</Text>
      </PressableScale>
    </>
  ) : null;

  return (
    <Sheet
      visible={!!session}
      onClose={onClose}
      title="Pages read"
      left={{ label: 'Cancel', onPress: onClose }}
      right={{ label: 'Done', onPress: save, strong: true, disabled: !parsed }}
      keyboard
      testID="reading-pages-sheet"
    >
      {body}
    </Sheet>
  );
}

const makeSheetStyles = (theme: ThemeColors) =>
  StyleSheet.create({
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
      backgroundColor: theme.accentSoft,
    },
    suggestionText: { ...typography.bodySmall, color: theme.textPrimary, flex: 1 },
    suggestionUse: { ...typography.bodySmall, color: theme.accent, fontWeight: '700' },
    deleteBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.md },
    deleteText: { ...typography.bodyMedium, color: theme.error },
  });
