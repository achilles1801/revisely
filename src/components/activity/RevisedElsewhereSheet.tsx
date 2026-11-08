// "Revised elsewhere" (Majd, Nov 7 2026: the + sheet trimmed): the day's scheduled pages that aren't
// revised yet, each ticked; untick the ones you didn't do, then Add logs the rest for that day by
// hand. Today and yesterday only (ACT-17). It replaced the free-pick Revised sheet and the
// "From your session" card. No strength and no minutes: hand-logged pages carry neither.

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { revisedElsewhereChoices } from '../../lib/activityAdd';
import { creditedOnDay } from '../../lib/aheadCredit';
import { planDuePages } from '../../lib/carryOver';
import { manualRevisionItem } from '../../lib/manualRevision';
import { describePassage, pagesNote } from '../../lib/passages';
import { logger } from '../../lib/logger';
import { typeV2 } from '../../theme/v2';
import type { RevisionLog } from '../../types';
import { RevisedMark } from './BlockMark';
import { InfoLine } from './AddSheetParts';
import { revisedOnDay, useDayItems } from './useDayItems';

const pagesWord = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;

export function RevisedElsewhereSheet({
  visible,
  onClose,
  day,
  dayName,
  logs,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  /** "today" or "yesterday". */
  dayName: string;
  logs: RevisionLog[];
}) {
  const { user, pages } = useApp();
  const { palette } = useTheme();
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (visible) setUnticked(new Set());
  }, [visible]);

  const memorizedPages = useMemo(() => (pages ?? []).filter((p) => p.status === 'memorized'), [pages]);
  const memorized = useMemo(() => new Set(memorizedPages.map((p) => p.pageNumber)), [memorizedPages]);
  // What the day had scheduled: its session's assignment, or the plan's pages for it.
  const due = useMemo(() => {
    const assigned = [...new Set(logs.filter((l) => l.date === day).flatMap((l) => l.assignedPages ?? []))];
    if (assigned.length > 0) return assigned;
    return user ? planDuePages(user, day, memorizedPages) : [];
  }, [logs, day, user, memorizedPages]);
  const items = useDayItems(day, visible);
  const revised = useMemo(() => new Set([...creditedOnDay(logs, day), ...revisedOnDay(items, day)]), [logs, day, items]);
  const choices = revisedElsewhereChoices({ due, revised, memorized });
  const ticked = choices.filter((p) => !unticked.has(p));
  const doneOfDue = new Set(due.filter((p) => revised.has(p) || ticked.includes(p))).size;
  const canAdd = ticked.length > 0 && !saving && !!user;

  const toggle = (p: number) =>
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const handleAdd = async () => {
    if (!canAdd || !user) return;
    setSaving(true);
    try {
      await queueChange({ kind: 'revision.add', item: manualRevisionItem({ uid: user.id, day, now: Date.now(), pages: ticked, minutes: null }) });
      onClose();
    } catch (err) {
      logger.warn('Could not log the pages revised elsewhere', err);
    } finally {
      setSaving(false);
    }
  };

  const whose = dayName === 'today' ? 'today’s' : `${dayName}’s`;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Revised elsewhere"
      titleMark={<RevisedMark fraction={due.length > 0 ? doneOfDue / due.length : 0} done={due.length > 0 && doneOfDue >= due.length} size={24} />}
      headerRule="full"
      scroll
      left={{ label: 'Cancel', onPress: onClose }}
      right={{ label: saving ? 'Saving…' : 'Add', onPress: handleAdd, strong: true, accent: true, disabled: !canAdd, testID: 'add-revised-add' }}
      testID="add-revised-sheet"
    >
      <View style={styles.body}>
        {choices.length === 0 ? (
          <Text style={[typeV2.body, styles.empty, { color: palette.secondary }]} testID="add-revised-none">
            {due.length > 0 ? `All of ${whose} pages are revised.` : `Nothing was scheduled for ${dayName}.`}
          </Text>
        ) : (
          <>
            <Text style={[typeV2.meta, styles.label, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {`Untick any of ${whose} pages you didn’t revise.`}
            </Text>
            {choices.map((p, i) => {
              const on = !unticked.has(p);
              const name = describePassage([p], { form: 'compact' });
              return (
                <Tap
                  key={p}
                  onPress={() => toggle(p)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${name}, ${pagesNote([p])}`}
                  style={[styles.row, i < choices.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator }]}
                  testID={`add-revised-page-${p}`}
                >
                  <View style={styles.rowText}>
                    <Text style={[typeV2.body, { color: palette.text }]}>{name}</Text>
                    <Text style={[typeV2.meta, { color: palette.secondary }]}>{pagesNote([p])}</Text>
                  </View>
                  {on ? (
                    <View style={[styles.check, { backgroundColor: palette.primary }]}>
                      <Ionicons name="checkmark" size={15} color={palette.onPrimary} />
                    </View>
                  ) : (
                    <View style={[styles.check, styles.ring, { borderColor: palette.outline }]} />
                  )}
                </Tap>
              );
            })}
            <InfoLine
              text={
                ticked.length === 0
                  ? 'Tick the pages you revised.'
                  : `Adds ${pagesWord(ticked.length)}: ${dayName === 'today' ? 'today' : dayName} becomes ${doneOfDue} of ${due.length}.`
              }
              testID="add-revised-info"
            />
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  label: { marginTop: 12, marginBottom: 4 },
  empty: { marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowText: { flex: 1, minWidth: 0 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1.5 },
});
