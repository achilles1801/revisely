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
import { describePageRuns, pageRuns } from '../../lib/pageRanges';
import { queueChange } from '../../lib/offline/queue';
import { logger } from '../../lib/logger';
import { typeV2 } from '../../theme/v2';
import { BlockMark, RevisedMark } from './BlockMark';
import { AddRevisedSheet } from './AddRevisedSheet';
import { AddMemorizedSheet } from './AddMemorizedSheet';
import { AddNoteSheet } from './AddNoteSheet';

type Log = { date: string; pagesRevised: number[]; pagesSkipped: number[]; assignedPages?: number[] };

/** "p. 556–557", "p. 12": the mock's short page form. */
const shortPages = (pages: number[]) => describePageRuns(pageRuns(pages)).replace(/^Pages? /, 'p. ');

export function AddToDaySheet({
  visible,
  onClose,
  day,
  title,
  logs,
  onRead,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  /** "Add to today", "Add to Sunday". */
  title: string;
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
  const missed = log ? missedFromSession(log, memorized) : [];
  const assigned = log ? (log.assignedPages && log.assignedPages.length > 0 ? log.assignedPages.length : log.pagesRevised.length + log.pagesSkipped.length) : 0;
  const fraction = log && assigned > 0 ? log.pagesRevised.length / assigned : 0;

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
      mark: <RevisedMark fraction={fraction} done={log != null && assigned > 0 && log.pagesRevised.length >= assigned} />,
      label: 'Revised',
      subtitle: 'Pages you revised outside a session',
      onPress: () => then('revised'),
    },
    { key: 'memorized', mark: <BlockMark kind="memorized" />, label: 'Memorized', subtitle: 'New pages you learned', onPress: () => then('memorized') },
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
      <Sheet visible={visible} onClose={onClose} title={title} testID="activity-add-menu">
        <View style={styles.body}>
          {missed.length > 0 && (
            <View style={[styles.session, { backgroundColor: palette.accentSubtle }]} testID="add-from-session">
              <Ionicons name="sparkles" size={22} color={palette.accentText} />
              <View style={styles.sessionText}>
                <Text style={[typeV2.name, { color: palette.accentText }]}>From your session</Text>
                <Text style={[typeV2.body, { color: palette.text }]}>
                  {`${shortPages(missed)} ${missed.length === 1 ? 'was' : 'were'} skipped. Revised ${missed.length === 1 ? 'it' : 'them'} another way?`}
                </Text>
              </View>
              <Tap
                onPress={addMissed}
                disabled={adding}
                accessibilityRole="button"
                accessibilityLabel={`Add ${shortPages(missed)} as revised`}
                style={[styles.addPill, { backgroundColor: palette.primary }]}
                testID="add-from-session-add"
              >
                <Text style={[typeV2.name, { color: palette.onPrimary }]}>Add</Text>
              </Tap>
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
              <Ionicons name="chevron-forward" size={20} color={palette.secondary} />
            </Tap>
          ))}
        </View>
      </Sheet>
      <AddRevisedSheet visible={open === 'revised'} onClose={() => setOpen(null)} day={day} logs={logs} />
      <AddMemorizedSheet visible={open === 'memorized'} onClose={() => setOpen(null)} day={day} />
      <AddNoteSheet visible={open === 'note'} onClose={() => setOpen(null)} day={day} />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 8 },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, paddingVertical: 14, paddingLeft: 14, paddingRight: 12, marginBottom: 8 },
  sessionText: { flex: 1, gap: 2 },
  addPill: { height: 32, borderRadius: 16, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3 },
});
