// The Note add sheet (Activity d8): a note for the day, optionally shown under one of the day's
// items (Revised, Memorized or Read). Each Add is a new note with its own id and time.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { autoId } from '../../lib/offline/apply';
import { tagFor } from '../../lib/noteTags';
import * as firestoreService from '../../services/firestoreService';
import { typeV2 } from '../../theme/v2';
import type { JournalNote } from '../../types';
import { BlockMark, type BlockKind } from './BlockMark';
import { TagChip } from './AddSheetParts';

type TagOption = { tag: string; label: string; kind: BlockKind };

/** The tags a note can hang off: the day's Revised block, each Memorized item, each timed read. */
async function tagOptionsFor(day: string): Promise<TagOption[]> {
  const items = await firestoreService.getActivityItemsForDay(day);
  return [
    ...(items.revisions.some((r) => r.countsFor === day) ? [{ tag: tagFor('revision', day), label: 'Revised', kind: 'revised' as const }] : []),
    ...items.memorized.map((m) => ({ tag: tagFor('memorization', m.id), label: 'Memorized', kind: 'memorized' as const })),
    ...items.reads.map((r) => ({ tag: tagFor('read', r.id), label: 'Read', kind: 'read' as const })),
  ];
}

const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function AddNoteSheet({
  visible,
  onClose,
  day,
  dayName = 'today',
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  /** How the sheet names the day: "today", "yesterday", "Sunday" (its stamp: "Today · 9:40 PM"). */
  dayName?: string;
}) {
  const { palette, isDark } = useTheme();
  const [text, setText] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [options, setOptions] = useState<TagOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // The tags, and the time the note is stamped with, each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    let cancelled = false;
    tagOptionsFor(day)
      .then((list) => !cancelled && setOptions(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [day, visible]);

  const trimmed = text.trim();
  const canAdd = trimmed !== '' && !saving;

  const handleAdd = async () => {
    if (!canAdd) return;
    setSaving(true);
    try {
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
    } finally {
      setSaving(false);
    }
  };

  const stamp = `${capitalized(dayName)} · ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Note"
      titleMark={<BlockMark kind="notes" size={24} />}
      headerRule="full"
      left={{ label: 'Cancel', onPress: onClose }}
      right={{ label: saving ? 'Saving…' : 'Add', onPress: handleAdd, strong: true, accent: true, disabled: !canAdd, testID: 'add-note-add' }}
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
          placeholder="Write a note"
          placeholderTextColor={palette.secondary}
          selectionColor={palette.primary}
          multiline
          autoFocus
          keyboardAppearance={isDark ? 'dark' : 'light'}
          accessibilityLabel="Note"
          style={[styles.input, { color: palette.text }]}
        />

        {options.length > 0 && (
          <View style={styles.tagRow}>
            <Text style={[typeV2.meta, styles.tagLabel, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              Show under
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
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 16 },
  tagLabel: { marginRight: 4 },
});
