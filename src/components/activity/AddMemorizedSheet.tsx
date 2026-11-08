// The Memorized add sheet (Activity d7): pages the user has memorized, for the day. Adding marks
// the pages memorized (the same two writes the composer makes) and records a Memorized item for
// the day, with its minutes when given (ACT-5). "From your reading" offers the pages read that day
// that are not memorized yet.

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { RangePickerSheet } from '../memorization/RangePickerSheet';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { memorizeSuggestion } from '../../lib/activityAdd';
import { parsePageRange } from '../../lib/memorizationLog';
import { describePassage } from '../../lib/passages';
import * as firestoreService from '../../services/firestoreService';
import { getRevisionDayForUser } from '../../lib/fajrBoundary';
import { typeV2 } from '../../theme/v2';
import type { UserPage } from '../../types';
import { BlockMark } from './BlockMark';
import { FormLabel, InfoLine, DismissArea, MinutesField, PageRangeFields, Segmented, Suggestion } from './AddSheetParts';

type What = 'pages' | 'surah';

/** "this morning" (before noon), "this afternoon", "this evening"; "that morning" on another day. */
export function partOfDay(at: number, today: boolean): string {
  const h = new Date(at).getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `${today ? 'this' : 'that'} ${part}`;
}

export function AddMemorizedSheet({
  visible,
  onClose,
  day,
  dayName = 'today',
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  /** How the sheet names the day: "today", "yesterday", "Sunday". */
  dayName?: string;
}) {
  const { user, pages, updatePages } = useApp();
  const { palette } = useTheme();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minutes, setMinutes] = useState('');
  const [what, setWhat] = useState<What>('pages');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [readings, setReadings] = useState<{ pages: number[]; startedAt: number }[]>([]);
  // The pages read, as used: exactly those, not every page from the first to the last (Nov 2026).
  const [usedReading, setUsedReading] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);

  // The pages read that day (timed sessions), offered when they are not memorized yet.
  useEffect(() => {
    let cancelled = false;
    firestoreService
      .getReadingSessionsForDay(day)
      .then((list) => !cancelled && setReadings(list.map((r) => ({ pages: r.pages, startedAt: new Date(r.startedAt).getTime() }))))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [day]);

  const memorized = useMemo(() => new Set((pages ?? []).filter((p) => p.status === 'memorized').map((p) => p.pageNumber)), [pages]);
  const suggestion = memorizeSuggestion(
    readings.flatMap((r) => r.pages),
    memorized,
  );
  // When the suggested pages were read: the first session that held one of them.
  const readAt = readings.find((r) => r.pages.some((p) => suggestion.includes(p)))?.startedAt;
  const suggestionText = [
    describePassage(suggestion, { form: 'compact' }),
    readAt != null && Number.isFinite(readAt) ? `read ${partOfDay(readAt, dayName === 'today')}` : `read ${dayName}`,
  ].join(' · ');

  const range = parsePageRange(from, to);
  const pageNumbers = usedReading ?? range ?? [];
  const minutesValue = minutes.trim() === '' ? null : Number(minutes);
  const minutesOk = minutesValue === null || (Number.isInteger(minutesValue) && minutesValue >= 0);
  const canAdd = range != null && minutesOk && !saving && !!user;

  const useReading = () => {
    if (usedReading) {
      setFrom('');
      setTo('');
      setUsedReading(null);
      return;
    }
    if (suggestion.length === 0) return;
    setWhat('pages');
    setFrom(String(suggestion[0]));
    setTo(String(suggestion[suggestion.length - 1]));
    setUsedReading(suggestion);
  };

  const handleAdd = async () => {
    if (!range || !user) return;
    setSaving(true);
    try {
      const changed = pageNumbers.filter((p) => !memorized.has(p));
      // Memorized on the day it is added to: now for today, that day (at noon, its own date in any
      // zone) for an earlier one. It said today for every day (Nov 2026).
      const [y, m, d] = day.split('-').map(Number);
      const memorizedOn = day === getRevisionDayForUser(user) ? new Date().toISOString() : new Date(y, m - 1, d, 12).toISOString();
      if (changed.length > 0) {
        const inRange = new Set(pageNumbers);
        await updatePages(
          (pages ?? []).map((p: UserPage) =>
            inRange.has(p.pageNumber) && p.status !== 'memorized'
              ? { ...p, status: 'memorized' as const, dateMemorized: memorizedOn }
              : p,
          ),
          changed,
        );
      }
      await queueChange({
        kind: 'memorization.mark',
        day,
        pages: pageNumbers,
        at: Date.now(),
        ...(minutesValue != null && minutesValue > 0 ? { minutes: minutesValue } : {}),
      });
      setFrom('');
      setTo('');
      setMinutes('');
      setUsedReading(null);
      setWhat('pages');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Memorized"
      titleMark={<BlockMark kind="memorized" size={24} />}
      headerRule="full"
      left={{ label: 'Cancel', onPress: onClose }}
      right={{ label: saving ? 'Saving…' : 'Add', onPress: handleAdd, strong: true, accent: true, disabled: !canAdd, testID: 'add-memorized-add' }}
      keyboard
      testID="add-memorized-sheet"
    >
      <DismissArea>
      <View style={styles.body}>
        {suggestion.length > 0 && (
          <View style={styles.top}>
            <Suggestion
              label="From your reading"
              text={suggestionText}
              action={usedReading ? 'Undo' : 'Use'}
              onAction={useReading}
              accessibilityLabel={usedReading ? 'Undo the reading pages' : 'Use the reading pages'}
              testID="add-memorized-from-reading"
            />
          </View>
        )}

        <FormLabel text="WHAT" />
        <Segmented<What>
          options={[
            { value: 'pages', label: 'Pages' },
            { value: 'surah', label: 'Surah' },
          ]}
          value={what}
          onChange={(w) => {
            setWhat(w);
            if (w === 'surah') setPickerOpen(true);
          }}
          testID="add-memorized-tab"
        />
        <View style={styles.fields}>
          <PageRangeFields
            from={from}
            to={to}
            onFrom={(v) => {
              setUsedReading(null);
              setFrom(v);
            }}
            onTo={(v) => {
              setUsedReading(null);
              setTo(v);
            }}
            placeholders
            testIDs={{ from: 'add-memorized-from', to: 'add-memorized-to' }}
          />
        </View>
        {range ? (
          <Text style={[typeV2.meta, styles.under, { color: palette.secondary }]}>
            {`${describePassage(pageNumbers, { form: 'compact' })} · ${pageNumbers.length} ${pageNumbers.length === 1 ? 'page' : 'pages'}`}
          </Text>
        ) : null}

        <FormLabel text="MINUTES" />
        <MinutesField value={minutes} onChange={setMinutes} testID="add-memorized-minutes" />

        <InfoLine text="Adding marks these pages memorized, so they join your revision plan. For anything else, add a note." />
      </View>
      </DismissArea>

      <RangePickerSheet
        visible={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setWhat('pages');
        }}
        onUse={(r) => {
          setFrom(String(r.from));
          setTo(String(r.to));
          setUsedReading(null);
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  top: { marginTop: 8 },
  fields: { marginTop: 10 },
  under: { marginTop: 8, marginHorizontal: 2 },
});
