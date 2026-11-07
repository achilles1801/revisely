// The day view's + (mock d5): "Add to today", the session's skipped pages on top when there are
// any ("From your session", added in one tap), then one row per kind, each opening its own sheet.
// The marks are the day blocks' own (BlockMark, RevisedMark), so a row looks like the block it adds to.

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { missedFromSession } from '../../lib/activityAdd';
import { manualRevisionItem } from '../../lib/manualRevision';
import { describePassage } from '../../lib/passages';
import { queueChange } from '../../lib/offline/queue';
import { logger } from '../../lib/logger';
import { typeV2 } from '../../theme/v2';
import { BlockMark, RevisedMark } from './BlockMark';
import { AddRevisedSheet } from './AddRevisedSheet';
import { AddMemorizedSheet } from './AddMemorizedSheet';
import { AddNoteSheet } from './AddNoteSheet';
import { Suggestion } from './AddSheetParts';
import { revisedOnDay, useDayItems } from './useDayItems';

type Log = { date: string; pagesRevised: number[]; pagesSkipped: number[]; assignedPages?: number[] };

/** The skipped pages by surah (Majd, Nov 7 2026): "At-Taghabun", "Al-Baqarah, ayahs 142–176". */
const passage = (pages: number[]) => describePassage(pages);

export function AddToDaySheet({
  visible,
  onClose,
  day,
  dayName,
  logs,
  onRead,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  /** How the menu and its sheets name the day: "today", "yesterday", "Sunday" ("Add to today"). */
  dayName: string;
  logs: Log[];
  /** Read: time it in the reader. */
  onRead: () => void;
}) {
  const { user, pages } = useApp();
  const { palette } = useTheme();
  const [open, setOpen] = useState<'revised' | 'memorized' | 'note' | null>(null);
  const [adding, setAdding] = useState(false);

  const memorized = useMemo(() => new Set((pages ?? []).filter((p) => p.status === 'memorized').map((p) => p.pageNumber)), [pages]);
  const log = logs.find((l) => l.date === day);
  // The day's items while the menu is open: pages already added by hand are revised already, so the
  // session's suggestion leaves them out (offered again, a second Add counted them twice).
  const alreadyRevised = revisedOnDay(useDayItems(day, visible), day);
  const missed = log ? missedFromSession(log, memorized, alreadyRevised) : [];
  const assignedPages = log ? (log.assignedPages && log.assignedPages.length > 0 ? log.assignedPages : [...log.pagesRevised, ...log.pagesSkipped]) : [];
  const assigned = new Set(assignedPages).size;
  const doneSet = new Set([...(log?.pagesRevised ?? []), ...alreadyRevised]);
  const doneCount = new Set(assignedPages.filter((p) => doneSet.has(p))).size;
  const fraction = assigned > 0 ? doneCount / assigned : 0;

  // The sheets open once this one has gone (one modal at a time).
  const then = (next: 'revised' | 'memorized' | 'note') => {
    onClose();
    setTimeout(() => setOpen(next), 350);
  };

  const addMissed = async () => {
    if (!user || missed.length === 0 || adding) return;
    setAdding(true);
    try {
      const item = manualRevisionItem({ uid: user.id, day, now: Date.now(), pages: missed, minutes: null });
      await queueChange({ kind: 'revision.add', item });
      onClose();
    } catch (err) {
      logger.warn('Could not add the session’s skipped pages', err);
    } finally {
      setAdding(false);
    }
  };

  const rows: { key: string; mark: React.ReactNode; label: string; subtitle: string; onPress: () => void }[] = [
    {
      key: 'revised',
      mark: <RevisedMark fraction={fraction} done={assigned > 0 && doneCount >= assigned} />,
      label: 'Revised',
      subtitle: 'Pages you revised outside a session',
      onPress: () => then('revised'),
    },
    {
      key: 'memorized',
      mark: <BlockMark kind="memorized" />,
      label: 'Memorized',
      subtitle: dayName === 'today' ? 'New pages you learned today' : 'New pages you learned',
      onPress: () => then('memorized'),
    },
    {
      key: 'read',
      mark: <BlockMark kind="read" />,
      label: 'Read',
      subtitle: 'Time it in the reader',
      onPress: () => {
        onClose();
        onRead();
      },
    },
    { key: 'note', mark: <BlockMark kind="notes" />, label: 'Note', subtitle: 'A thought, or a mistake to watch', onPress: () => then('note') },
  ];

  return (
    <>
      <Sheet visible={visible} onClose={onClose} title={`Add to ${dayName}`} headerRule="none" testID="activity-add-menu">
        <View style={styles.body}>
          {missed.length > 0 && (
            <View style={styles.session}>
              <Suggestion
                label="From your session"
                text={`You skipped ${passage(missed)}. Revised it another way?`}
                action="Add"
                onAction={addMissed}
                disabled={adding}
                accessibilityLabel={`Add ${passage(missed)} as revised`}
                testID="add-from-session"
              />
            </View>
          )}
          {rows.map((r, i) => (
            <Tap
              key={r.key}
              onPress={r.onPress}
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
      <AddRevisedSheet visible={open === 'revised'} onClose={() => setOpen(null)} day={day} dayName={dayName} logs={logs} />
      <AddMemorizedSheet visible={open === 'memorized'} onClose={() => setOpen(null)} day={day} dayName={dayName} />
      <AddNoteSheet visible={open === 'note'} onClose={() => setOpen(null)} day={day} dayName={dayName} />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  session: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3 },
});
