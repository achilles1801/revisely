// Insights' range (ACT-22) as one chip and its menu: 7 days, 30 days (at first), 3 months or All time, kept on the phone.
// The range is one for the whole of Activity: the store below keeps every chip on show (the sections' list, a section's own
// page, ACT-35) on the same choice, so a change on a section's page is there when Back comes to the list.

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActionSheet } from '../v2/ActionSheet';
import { ChoiceChip } from './ChoiceChip';
import { dayAndMonth, INSIGHTS_RANGE_KEY, INSIGHTS_RANGES, parseRange, rangeLabel, type InsightsRange } from '../../lib/insightsRange';
import { t } from '../../i18n';

let current: InsightsRange = 30;
// A choice made since launch: what the phone holds is that choice (being saved), so it isn't read back over it.
let chosen = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function setRange(next: InsightsRange) {
  current = next;
  chosen = true;
  notify();
  AsyncStorage.setItem(INSIGHTS_RANGE_KEY, String(next)).catch(() => undefined);
}

/** The range every chip shows and every section reads, and the way to change it. */
export function useInsightsRange(): [InsightsRange, (next: InsightsRange) => void] {
  // Read on each mount, as each screen read it before; a choice made since launch wins over what is stored.
  useEffect(() => {
    if (chosen) return;
    AsyncStorage.getItem(INSIGHTS_RANGE_KEY)
      .then((v) => {
        if (chosen) return;
        const stored = parseRange(v);
        if (stored !== current) {
          current = stored;
          notify();
        }
      })
      .catch(() => undefined);
  }, []);
  const range = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  return [range, setRange];
}

/** For tests: as a fresh launch has it. */
export function resetInsightsRangeForTests(): void {
  current = 30;
  chosen = false;
}

export function InsightsRangeChip({ firstDay, testID = 'insights-range' }: { firstDay?: string | null; testID?: string }) {
  const [range, change] = useInsightsRange();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ChoiceChip
        label={rangeLabel(range)}
        onPress={() => setOpen(true)}
        accessibilityLabel={t('activity.blocks.insightsFor', { range: rangeLabel(range) })}
        accessibilityHint={t('activity.blocks.chooseRange')}
        size="md"
        testID={testID}
      />
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('activity.blocks.insightsForTitle')}
        actions={INSIGHTS_RANGES.map((r) => ({
          key: `range-${r}`,
          label: rangeLabel(r),
          // All time names where it starts ("Since 9 September").
          subtitle: r === 'all' && firstDay ? t('activity.blocks.since', { day: dayAndMonth(firstDay) }) : undefined,
          selected: r === range,
          onPress: () => change(r),
        }))}
        testID={`${testID}-menu`}
      />
    </>
  );
}
