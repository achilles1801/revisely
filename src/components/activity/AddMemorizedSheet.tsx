// The Memorized add sheet (Activity d7): what the user has memorized, for the day. Ayahs first
// (MEM-1: most people memorize ayahs, not pages), then whole pages or a surah. Adding marks them
// memorized (a page whose last ayah comes in becomes memorized, one started is partly memorized)
// and records a Memorized item for the day, with its minutes when given (ACT-5). "From your
// reading" offers the pages read that day that are not memorized yet. Opened from a sitting on the
// Day, its ayahs stay inside the pages the sitting held.

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { RangePickerSheet } from '../memorization/RangePickerSheet';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { memorizeSuggestion } from '../../lib/activityAdd';
import { parsePageRange } from '../../lib/memorizationLog';
import { describeAyahs, describePassage } from '../../lib/passages';
import { AyahKey, ayahsBetween, ayahsOfPages, LAST_AYAH, pageOfAyah } from '../../lib/ayahKeys';
import { addAyahs, memorizedAyahs, memorizedPageShare } from '../../lib/memorizedAyahs';
import { AyahRangeFields } from './AyahRangeFields';
import * as firestoreService from '../../services/firestoreService';
import { getRevisionDayForUser } from '../../lib/fajrBoundary';
import { typeV2 } from '../../theme/v2';
import type { UserPage } from '../../types';
import { BlockMark } from './BlockMark';
import { FormLabel, InfoLine, DismissArea, MinutesField, PageRangeFields, Segmented, Suggestion } from './AddSheetParts';

type What = 'ayahs' | 'pages' | 'surah';

/** Of the 604 pages, to one decimal, as Home writes it ("50.6%"). */
const percent = (pages: number) => {
  const p = Math.round((pages / 604) * 1000) / 10;
  return p <= 0 ? '0%' : p >= 100 ? '100%' : `${p.toFixed(1)}%`;
};

/** What a sitting on the Day brings to the sheet: the pages it held, and its minutes. */
export interface SittingToAdd {
  pages: number[];
  minutes: number | null;
}

/** What an add by the ayah did, so the Day can undo it: the ayahs, their pages, and those pages before. */
export interface AyahsAdded {
  ayahs: AyahKey[];
  pages: number[];
  previous: UserPage[];
}

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
  sitting,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  /** How the sheet names the day: "today", "yesterday", "Sunday". */
  dayName?: string;
  /** Opened from a sitting (the Day's Add to memorized): its ayahs stay inside the pages it held. */
  sitting?: SittingToAdd | null;
  /** After an add by the ayah: what it did (the Day offers Undo). */
  onAdded?: (added: AyahsAdded) => void;
}) {
  const { user, pages, updatePages } = useApp();
  const { palette } = useTheme();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minutes, setMinutes] = useState('');
  const [what, setWhat] = useState<What>('ayahs');
  // The ayahs: inside the sitting's pages, or the whole Qur'an.
  const range = useMemo(() => {
    const keys = sitting && sitting.pages.length > 0 ? ayahsOfPages(sitting.pages) : null;
    return keys && keys.length > 0 ? { lo: keys[0], hi: keys[keys.length - 1] } : { lo: 1001, hi: LAST_AYAH };
  }, [sitting]);
  const [fromAyah, setFromAyah] = useState<AyahKey>(range.lo);
  const [toAyah, setToAyah] = useState<AyahKey>(range.lo);
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
  const memorizedNow = useMemo(() => new Set(memorizedAyahs(pages ?? [])), [pages]);
  // Each time it opens: From at the first ayah not memorized in the range, To at the sitting's end
  // (one flick of To sets where it stopped), and the sitting's minutes.
  useEffect(() => {
    if (!visible) return;
    const open = ayahsBetween(range.lo, range.hi).find((k) => !memorizedNow.has(k)) ?? range.lo;
    setWhat('ayahs');
    setFromAyah(open);
    setToAyah(sitting ? range.hi : open);
    if (sitting?.minutes != null && sitting.minutes > 0) setMinutes(String(sitting.minutes));
    // Only when it opens: what is memorized changes as it adds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, range]);
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

  const pageRange = parsePageRange(from, to);
  const pageNumbers = usedReading ?? pageRange ?? [];
  const minutesValue = minutes.trim() === '' ? null : Number(minutes);
  const minutesOk = minutesValue === null || (Number.isInteger(minutesValue) && minutesValue >= 0);
  const ayahs = useMemo(() => ayahsBetween(fromAyah, toAyah), [fromAyah, toAyah]);
  const canAdd = (what === 'ayahs' ? ayahs.length > 0 : pageRange != null) && minutesOk && !saving && !!user;
  // How much is memorized now, and after adding (MEM-2): "50.3% → 50.6% of the Quran".
  const shareNow = useMemo(() => memorizedPageShare(pages ?? []), [pages]);
  const shareAfter = useMemo(
    () => (what === 'ayahs' && ayahs.length > 0 ? memorizedPageShare(addAyahs(pages ?? [], ayahs, '').pages) : shareNow),
    [what, ayahs, pages, shareNow],
  );

  const useReading = () => {
    if (usedReading) {
      setFrom('');
      setTo('');
      setUsedReading(null);
      return;
    }
    if (suggestion.length === 0) return;
    // As ayahs: from the first not memorized on those pages to the end of the last (MEM-1).
    const read = ayahsOfPages(suggestion);
    setWhat('ayahs');
    setFromAyah(read.find((k) => !memorizedNow.has(k)) ?? read[0]);
    setToAyah(read[read.length - 1]);
    setFrom(String(suggestion[0]));
    setTo(String(suggestion[suggestion.length - 1]));
    setUsedReading(suggestion);
  };

  const handleAdd = async () => {
    if (!user || (what === 'ayahs' ? ayahs.length === 0 : !pageRange)) return;
    setSaving(true);
    try {
      // Memorized on the day it is added to: now for today, that day (at noon, its own date in any
      // zone) for an earlier one. It said today for every day (Nov 2026).
      const [y, m, d] = day.split('-').map(Number);
      const memorizedOn = day === getRevisionDayForUser(user) ? new Date().toISOString() : new Date(y, m - 1, d, 12).toISOString();
      if (what === 'ayahs') {
        // By the ayah (MEM-1): a page its last ayah comes to is memorized, one started is partly.
        const before = pages ?? [];
        const { pages: next, changed: touched } = addAyahs(before, ayahs, memorizedOn);
        if (touched.length > 0) await updatePages(next, touched);
        const onPages = [...new Set(ayahs.map((k) => pageOfAyah(k)))].sort((a, b) => a - b);
        await queueChange({
          kind: 'memorization.mark',
          day,
          pages: onPages,
          verses: ayahs,
          at: Date.now(),
          ...(minutesValue != null && minutesValue > 0 ? { minutes: minutesValue } : {}),
        });
        const touchedSet = new Set(touched);
        onAdded?.({ ayahs, pages: onPages, previous: before.filter((p) => touchedSet.has(p.pageNumber)) });
        setMinutes('');
        setUsedReading(null);
        onClose();
        return;
      }
      const changed = pageNumbers.filter((p) => !memorized.has(p));
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
      setWhat('ayahs');
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
            { value: 'ayahs', label: 'Ayahs' },
            { value: 'pages', label: 'Whole pages' },
            { value: 'surah', label: 'Surah' },
          ]}
          value={what}
          onChange={(w) => {
            setWhat(w);
            if (w === 'surah') setPickerOpen(true);
          }}
          testID="add-memorized-tab"
        />
        {what === 'ayahs' ? (
          <View style={styles.fields}>
            <AyahRangeFields
              from={fromAyah}
              to={toAyah}
              lo={range.lo}
              hi={range.hi}
              onFrom={(k) => {
                setUsedReading(null);
                setFromAyah(k);
              }}
              onTo={(k) => {
                setUsedReading(null);
                setToAyah(k);
              }}
              testIDs={{ from: 'add-memorized-from-ayah', to: 'add-memorized-to-ayah' }}
            />
            <Text style={[typeV2.meta, styles.under, { color: palette.secondary }]} testID="add-memorized-ayahs">
              {`${describeAyahs(ayahs, { form: 'compact' })} · ${ayahs.length} ${ayahs.length === 1 ? 'ayah' : 'ayahs'}`}
            </Text>
          </View>
        ) : (
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
        )}
        {what !== 'ayahs' && pageRange ? (
          <Text style={[typeV2.meta, styles.under, { color: palette.secondary }]}>
            {`${describePassage(pageNumbers, { form: 'compact' })} · ${pageNumbers.length} ${pageNumbers.length === 1 ? 'page' : 'pages'}`}
          </Text>
        ) : null}

        <FormLabel text="MINUTES" />
        <MinutesField value={minutes} onChange={setMinutes} testID="add-memorized-minutes" />

        {what === 'ayahs' && shareAfter > shareNow ? (
          <Text style={[typeV2.meta, styles.under, { color: palette.secondary }]} testID="add-memorized-share">
            {`Memorized on ${dayName === 'today' ? 'today' : dayName}: ${percent(shareNow)} → ${percent(shareAfter)} of the Quran`}
          </Text>
        ) : null}

        <InfoLine
          text={
            // A custom plan doesn't add new pages by itself (pruneCustomPlanForMemorized).
            user?.customPlan
              ? 'Adding marks them memorized. Your custom plan doesn’t add them by itself. For anything else, add a note.'
              : 'Adding marks them memorized, so they join your revision. For anything else, add a note.'
          }
        />
      </View>
      </DismissArea>

      <RangePickerSheet
        visible={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setWhat((w) => (w === 'surah' ? 'pages' : w));
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
