// The Note sheet (Activity d8): a note for the day, optionally shown under one of the day's items
// (Revised, Memorized or Read). Each Add is a new note with its own id and time. Given a `note`, the
// same sheet edits it (ACT-6): its text and where it shows, or an older Revised or Memorized log
// entry's text and minutes. Its id, kind and time stay.

import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { autoId } from '../../lib/offline/apply';
import { tagFor } from '../../lib/noteTags';
import { JOURNAL_ENTRIES_PER_DAY, journalTextMax, parseMinutesInput } from '../../lib/journal';
import { logger } from '../../lib/logger';
import { westernDigits } from '../../i18n/digits';
import * as firestoreService from '../../services/firestoreService';
import { typeV2 } from '../../theme/v2';
import type { JournalNote } from '../../types';
import { BlockMark, type BlockKind } from './BlockMark';
import { TagChip, dayWords } from './AddSheetParts';
import { formatTime, t } from '../../i18n';

type TagOption = { tag: string; label: string; kind: BlockKind };

/** The tags a note can hang off: the day's Revised block, each Memorized item, each timed read. */
async function tagOptionsFor(day: string): Promise<TagOption[]> {
  const items = await firestoreService.getActivityItemsForDay(day);
  return [
    ...(items.revisions.some((r) => r.countsFor === day) ? [{ tag: tagFor('revision', day), label: t('activity.day.revised'), kind: 'revised' as const }] : []),
    ...items.memorized.map((m) => ({ tag: tagFor('memorization', m.id), label: t('activity.day.memorized'), kind: 'memorized' as const })),
    ...items.reads.map((r) => ({ tag: tagFor('read', r.id), label: t('activity.day.read'), kind: 'read' as const })),
  ];
}

const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function AddNoteSheet({
  visible,
  onClose,
  day,
  dayName = 'today',
  note = null,
  noteCount = 0,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  /** How the sheet names the day: "today", "yesterday", "Sunday" (its stamp: "Today · 9:40 PM"). */
  dayName?: string;
  /** The entry to edit; without one the sheet adds a new note. */
  note?: JournalNote | null;
  /** How many entries the day holds: a full day takes no more (JOURNAL_ENTRIES_PER_DAY). */
  noteCount?: number;
}) {
  const { palette, isDark } = useTheme();
  const [text, setText] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [options, setOptions] = useState<TagOption[]>([]);
  const [minutes, setMinutes] = useState('');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const kind = note?.kind ?? 'note';

  // The tags, and the time the note is stamped with, each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setNow(note ? new Date(note.at) : new Date());
    if (note) {
      setText(note.text);
      setTag(note.tag ?? null);
      setMinutes(note.minutes?.toString() ?? '');
    }
    let cancelled = false;
    tagOptionsFor(day)
      .then((list) => !cancelled && setOptions(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [day, visible, note]);

  const trimmed = text.trim();
  const minutesNow = kind === 'note' ? null : parseMinutesInput(minutes);
  const edited =
    note != null && (trimmed !== note.text.trim() || (tag ?? null) !== (note.tag ?? null) || minutesNow !== (note.minutes ?? null));
  // An edit keeps something in the entry: Delete, in its menu, is how one goes.
  const canAdd = (note ? edited && (trimmed !== '' || minutesNow != null) : trimmed !== '') && !saving;

  const saveEdit = async (original: JournalNote) => {
    const { tag: _old, ...rest } = original;
    const entry: JournalNote = {
      ...rest,
      text: trimmed.slice(0, journalTextMax(original.kind)),
      minutes: minutesNow,
      ...(original.kind === 'note' ? (tag ? { tag } : {}) : original.tag ? { tag: original.tag } : {}),
    };
    await queueChange({ kind: 'journal.entry.edit', date: day, entry });
    onClose();
  };

  const handleAdd = async () => {
    if (!canAdd) return;
    if (!note && noteCount >= JOURNAL_ENTRIES_PER_DAY) {
      Alert.alert(t('journal.full.title'), t('journal.full.body', { count: JOURNAL_ENTRIES_PER_DAY }));
      return;
    }
    setSaving(true);
    try {
      if (note) {
        await saveEdit(note);
        return;
      }
      // Each Add is a new note with its own id and time: Add never replaces one.
      const entry: JournalNote = {
        id: autoId(),
        at: Date.now(),
        kind: 'note',
        text: trimmed,
        minutes: null,
        ...(tag ? { tag } : {}),
      };
      await queueChange({ kind: 'journal.entry.add', date: day, entry });
      setText('');
      setTag(null);
      onClose();
    } catch (err) {
      logger.error('Failed to save a note', err);
      Alert.alert(t('journal.saveFailed'), t('common.pleaseTryAgain'));
    } finally {
      setSaving(false);
    }
  };

  const stamp = `${capitalized(dayWords(dayName))} · ${formatTime(now)}`;
  const title = !note
    ? t('activity.add.note')
    : note.kind === 'revision'
      ? t('activity.add.editRevised')
      : note.kind === 'memorization'
        ? t('activity.add.editMemorized')
        : t('activity.add.editNote');

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      titleMark={<BlockMark kind="notes" size={24} />}
      headerRule="full"
      left={{ label: t('common.cancel'), onPress: onClose }}
      right={{ label: saving ? t('common.saving') : note ? t('common.save') : t('activity.add.add'), onPress: handleAdd, strong: true, accent: true, disabled: !canAdd, testID: 'add-note-add' }}
      keyboard
      testID="add-note-sheet"
    >
      <View style={styles.body}>
        <Text style={[typeV2.meta, typeV2.numeral, styles.stamp, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="add-note-stamp">
          {stamp}
        </Text>
        <TextInput
          testID="add-note-text"
          value={text}
          onChangeText={setText}
          placeholder={t('activity.add.writeNote')}
          placeholderTextColor={palette.secondary}
          selectionColor={palette.primary}
          multiline
          maxLength={journalTextMax(kind)}
          autoFocus
          keyboardAppearance={isDark ? 'dark' : 'light'}
          accessibilityLabel={t('activity.add.note')}
          style={[styles.input, { color: palette.text }]}
        />

        {/* An older Revised or Memorized log entry keeps its minutes. */}
        {kind !== 'note' ? (
          <TextInput
            testID="add-note-minutes"
            value={minutes}
            onChangeText={(v) => setMinutes(westernDigits(v).replace(/[^0-9]/g, ''))}
            placeholder={t('activity.add.minutes')}
            placeholderTextColor={palette.secondary}
            selectionColor={palette.primary}
            keyboardType="number-pad"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            accessibilityLabel={t('activity.add.minutes')}
            style={[styles.minutes, { color: palette.text, borderColor: palette.separator }]}
          />
        ) : null}

        {kind === 'note' && options.length > 0 && (
          <View style={styles.tagRow}>
            <Text style={[typeV2.meta, styles.tagLabel, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {t('activity.add.showUnder')}
            </Text>
            {options.map((o) => (
              <TagChip
                key={o.tag}
                kind={o.kind}
                label={o.label}
                on={tag === o.tag}
                onPress={() => setTag(tag === o.tag ? null : o.tag)}
                testID={`add-note-tag-${o.label.toLowerCase()}`}
              />
            ))}
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 12 },
  stamp: { marginTop: 8 },
  input: { marginTop: 6, minHeight: 72, padding: 0, fontSize: 17, lineHeight: 24, textAlignVertical: 'top' },
  minutes: { marginTop: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, fontSize: 17 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 16 },
  tagLabel: { marginRight: 4 },
});
