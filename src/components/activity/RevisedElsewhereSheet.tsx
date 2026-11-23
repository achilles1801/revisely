// "Revised elsewhere" (ACT-5): the day's scheduled pages that aren't revised yet, each ticked (untick the ones you
// didn't do), and any other memorized pages, From and To (Majd, Nov 23 2026: "independent of the schedule and what a
// user needs to revise that day"). Add logs them for that day by hand. A logged page on the day's schedule ticks it
// off; any other never changes the schedule or "N of 20". Today and yesterday only (ACT-17). No strength and no minutes.

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { PageRangeFields } from './PageRangeFields';
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
import { InfoLine, dayWords } from './AddSheetParts';
import { revisedOnDay, useDayItems } from './useDayItems';
import { t } from '../../i18n';

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
  const { user, pages, refreshPageStates } = useApp();
  const { palette } = useTheme();
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  // Any other memorized pages: a From and To, open once asked for.
  const [other, setOther] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    if (visible) {
      setUnticked(new Set());
      setOther(null);
    }
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
  const bounds = memorized.size > 0 ? { lo: Math.min(...memorized), hi: Math.max(...memorized) } : null;
  // Of the range, the memorized pages not revised for the day yet.
  const others: number[] = [];
  if (other) for (let p = other.from; p <= other.to; p++) if (memorized.has(p) && !revised.has(p)) others.push(p);
  const logging = [...new Set([...ticked, ...others])].sort((a, b) => a - b);
  const doneOfDue = new Set(due.filter((p) => revised.has(p) || logging.includes(p))).size;
  const canAdd = logging.length > 0 && !saving && !!user;

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
      await queueChange({ kind: 'revision.add', item: manualRevisionItem({ uid: user.id, day, now: Date.now(), pages: logging, minutes: null }) });
      onClose();
      // Each page's last revised day and count take the log at once (ACT-16), not at the next launch.
      refreshPageStates?.().catch((err) => logger.warn('Could not re-derive the pages after a log', err));
    } catch (err) {
      logger.warn('Could not log the pages revised elsewhere', err);
    } finally {
      setSaving(false);
    }
  };

  const dayText = dayWords(dayName);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('activity.elsewhere.title')}
      titleMark={<RevisedMark fraction={due.length > 0 ? doneOfDue / due.length : 0} done={due.length > 0 && doneOfDue >= due.length} size={24} />}
      headerRule="full"
      scroll
      left={{ label: t('common.cancel'), onPress: onClose }}
      right={{ label: saving ? t('common.saving') : t('activity.add.add'), onPress: handleAdd, strong: true, accent: true, disabled: !canAdd, testID: 'add-revised-add' }}
      testID="add-revised-sheet"
    >
      <View style={styles.body}>
        {choices.length === 0 ? (
          other ? null : <Text style={[typeV2.body, styles.empty, { color: palette.secondary }]} testID="add-revised-none">
            {due.length > 0 ? t('activity.elsewhere.allRevised', { day: dayText }) : t('activity.elsewhere.nothingScheduled', { day: dayText })}
          </Text>
        ) : (
          <>
            <Text style={[typeV2.meta, styles.label, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {t('activity.elsewhere.untick', { day: dayText })}
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
          </>
        )}
        {bounds && other ? (
          <View style={styles.other} testID="add-revised-other">
            <Text style={[typeV2.meta, styles.label, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {t('activity.elsewhere.otherPages')}
            </Text>
            <PageRangeFields
              from={other.from}
              to={other.to}
              lo={bounds.lo}
              hi={bounds.hi}
              onFrom={(from) => setOther((o) => ({ from, to: Math.max(from, o?.to ?? from) }))}
              onTo={(to) => setOther((o) => ({ from: o?.from ?? to, to }))}
              testIDs={{ from: 'add-revised-from', to: 'add-revised-to' }}
            />
            <Text style={[typeV2.body, styles.otherName, { color: others.length > 0 ? palette.text : palette.secondary }]} testID="add-revised-other-name">
              {others.length > 0 ? describePassage(others) : t('activity.elsewhere.otherNone')}
            </Text>
          </View>
        ) : bounds ? (
          <PillButton
            title={t('activity.elsewhere.addOther')}
            variant="outline"
            size="sm"
            icon="add"
            onPress={() => setOther({ from: bounds.lo, to: bounds.lo })}
            style={styles.addOther}
            testID="add-revised-add-other"
          />
        ) : null}
        {choices.length > 0 || other ? (
          <InfoLine
            text={
              logging.length === 0
                ? t('activity.elsewhere.tick')
                : due.length > 0
                  ? t('activity.elsewhere.adds', { pages: t('common.pages', { count: logging.length }), day: dayText, done: doneOfDue, due: due.length })
                  : t('activity.elsewhere.addsNoPlan', { pages: t('common.pages', { count: logging.length }), day: dayText })
            }
            testID="add-revised-info"
          />
        ) : null}
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
  other: { marginTop: 4 },
  otherName: { marginTop: 10 },
  addOther: { alignSelf: 'flex-start', marginTop: 12 },
});
