// The day view's + (Majd, Nov 7 2026: "yes trim it"): for today and yesterday, "Add to today" lists
// Revised elsewhere (the day's pages not revised yet), Memorized and Note, each opening its own
// sheet. An older day offers only a note, so history and streaks can't be rewritten (ACT-17): its +
// opens the Note sheet straight away. Read is gone: the reader logs reading by itself.
// The marks are the day blocks' own (BlockMark, RevisedMark), so a row looks like the block it adds to.

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import type { RevisionLog } from '../../types';
import { BlockMark, RevisedMark } from './BlockMark';
import { RevisedElsewhereSheet } from './RevisedElsewhereSheet';
import { AddMemorizedSheet } from './AddMemorizedSheet';
import { AddNoteSheet } from './AddNoteSheet';
import { revisedOnDay, useDayItems } from './useDayItems';

type Row = 'revised' | 'memorized' | 'note';

export function AddToDaySheet({
  visible,
  onClose,
  day,
  dayName,
  logs,
  noteOnly = false,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  /** How the menu and its sheets name the day: "today", "yesterday", "Sunday" ("Add to today"). */
  dayName: string;
  logs: RevisionLog[];
  /** A day before yesterday: only a note can be added, and the + opens it at once (ACT-17). */
  noteOnly?: boolean;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<Row | null>(null);
  // The Revised row's ring: how much of the day's assignment is revised, by its session or by hand.
  const items = useDayItems(day, visible && !noteOnly);
  const log = logs.find((l) => l.date === day);
  const assignedPages = log ? (log.assignedPages && log.assignedPages.length > 0 ? log.assignedPages : [...log.pagesRevised, ...log.pagesSkipped]) : [];
  const assigned = new Set(assignedPages).size;
  const doneSet = new Set([...(log?.pagesRevised ?? []), ...revisedOnDay(items, day)]);
  const doneCount = new Set(assignedPages.filter((p) => doneSet.has(p))).size;

  if (noteOnly) return <AddNoteSheet visible={visible} onClose={onClose} day={day} dayName={dayName} />;

  // The sheets open once this one has gone (one modal at a time).
  const then = (next: Row) => {
    onClose();
    setTimeout(() => setOpen(next), 350);
  };

  const whose = dayName === 'today' ? 'Today’s' : `${dayName.charAt(0).toUpperCase()}${dayName.slice(1)}’s`;
  const rows: { key: Row; mark: React.ReactNode; label: string; subtitle: string }[] = [
    { key: 'revised', mark: <RevisedMark fraction={assigned > 0 ? doneCount / assigned : 0} done={assigned > 0 && doneCount >= assigned} />, label: 'Revised elsewhere', subtitle: `${whose} pages, revised away from a session` },
    { key: 'memorized', mark: <BlockMark kind="memorized" />, label: 'Memorized', subtitle: dayName === 'today' ? 'New pages you learned today' : `New pages you learned ${dayName}` },
    { key: 'note', mark: <BlockMark kind="notes" />, label: 'Note', subtitle: 'A thought, or a mistake to watch' },
  ];

  return (
    <>
      <Sheet visible={visible} onClose={onClose} title={`Add to ${dayName}`} headerRule="none" testID="activity-add-menu">
        <View style={styles.body}>
          {rows.map((r, i) => (
            <Tap
              key={r.key}
              onPress={() => then(r.key)}
              accessibilityRole="button"
              accessibilityLabel={`${r.label}, ${r.subtitle}`}
              style={[styles.row, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator }]}
              testID={`sheet-action-${r.key}`}
            >
              {r.mark}
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: palette.text }]}>{r.label}</Text>
                <Text style={[typeV2.meta, { color: palette.secondary }]}>{r.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.secondary} />
            </Tap>
          ))}
        </View>
      </Sheet>
      <RevisedElsewhereSheet visible={open === 'revised'} onClose={() => setOpen(null)} day={day} dayName={dayName} logs={logs} />
      <AddMemorizedSheet visible={open === 'memorized'} onClose={() => setOpen(null)} day={day} dayName={dayName} />
      <AddNoteSheet visible={open === 'note'} onClose={() => setOpen(null)} day={day} dayName={dayName} />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3 },
});
