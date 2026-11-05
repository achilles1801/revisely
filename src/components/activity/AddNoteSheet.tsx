// The Note add sheet (Activity d8): a note for the day, optionally shown under one of the day's
// items (Revised, Memorized or Read). Each Add is a new note with its own id and time.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { autoId } from '../../lib/offline/apply';
import { tagFor } from '../../lib/noteTags';
import * as firestoreService from '../../services/firestoreService';
import { typeV2 } from '../../theme/v2';
import type { JournalNote } from '../../types';

type TagOption = { tag: string; label: string };

/** The tags a note can hang off: the day's Revised block, each Memorized item, each timed read. */
async function tagOptionsFor(day: string): Promise<TagOption[]> {
  const items = await firestoreService.getActivityItemsForDay(day);
  return [
    ...(items.revisions.some((r) => r.countsFor === day) ? [{ tag: tagFor('revision', day), label: 'Revised' }] : []),
    ...items.memorized.map((m) => ({ tag: tagFor('memorization', m.id), label: 'Memorized' })),
    ...items.reads.map((r) => ({ tag: tagFor('read', r.id), label: 'Read' })),
  ];
}

export function AddNoteSheet({ visible, onClose, day }: { visible: boolean; onClose: () => void; day: string }) {
  const { palette } = useTheme();
  const [text, setText] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [options, setOptions] = useState<TagOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    tagOptionsFor(day)
      .then((list) => !cancelled && setOptions(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [day]);

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

  const stamp = `${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Note"
      left={{ label: 'Cancel', onPress: onClose }}
      right={{ label: saving ? 'Saving…' : 'Add', onPress: handleAdd, strong: true, disabled: !canAdd }}
      keyboard
      testID="add-note-sheet"
    >
      <View style={styles.body}>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{`${day === toDay(now) ? 'Today' : day} · ${stamp}`}</Text>
        <TextInput
          testID="add-note-text"
          value={text}
          onChangeText={setText}
          placeholder="Write a note"
          placeholderTextColor={palette.secondary}
          multiline
          autoFocus
          accessibilityLabel="Note"
          style={[typeV2.body, styles.input, { color: palette.text }]}
        />

        {options.length > 0 && (
          <View style={styles.tagRow}>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>Show under</Text>
            {options.map((o) => {
              const on = tag === o.tag;
              return (
                <Tap
                  key={o.tag}
                  testID={`add-note-tag-${o.label.toLowerCase()}`}
                  onPress={() => setTag(on ? null : o.tag)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={o.label}
                  style={[styles.chip, { backgroundColor: on ? palette.primary : palette.fill }]}
                >
                  <Text style={[typeV2.meta, { color: on ? palette.onPrimary : palette.text, fontWeight: '600' }]}>{o.label}</Text>
                </Tap>
              );
            })}
          </View>
        )}
      </View>
    </Sheet>
  );
}

const toDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const styles = StyleSheet.create({
  body: { gap: 12, paddingVertical: 8 },
  input: { minHeight: 120, textAlignVertical: 'top', padding: 0 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
});
