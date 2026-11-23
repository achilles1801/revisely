// The Memorized add sheet (Activity d7): what the user has memorized, for the day. Ayahs first
// (MEM-1: most people memorize ayahs, not pages), then whole pages or a surah. Adding marks them
// memorized (a page whose last ayah comes in becomes memorized, one started is partly memorized)
// and records a Memorized item for the day, with its minutes when given (ACT-5). "From your
// reading" offers the pages read that day that are not memorized yet. Whole pages picks From and To on
// a wheel of pages, as Ayahs does with its surah and ayah wheels. Opened from a sitting on the Day,
// its ayahs and pages stay inside the pages the sitting held. Revisely Dev chooses on the real page
// instead of the From and To wheels, and shows the choice as pages (MEM-8).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { RangePickerSheet } from '../memorization/RangePickerSheet';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { memorizeSuggestion } from '../../lib/activityAdd';
import { describeAyahs, describePassage } from '../../lib/passages';
import { AyahKey, ayahsBetween, ayahsOfPages, LAST_AYAH, pageOfAyah } from '../../lib/ayahKeys';
import { addAyahs, memorizedAyahs, memorizedPageShare } from '../../lib/memorizedAyahs';
import { chosenAyahs, firstOpenIn, leftOffAyah, memorizedPickerOn, pagesOfAyahs, pickName, type AyahPick } from '../../lib/memorizedPick';
import { AyahRangeFields } from './AyahRangeFields';
import { MemorizedPagePicker } from './MemorizedPagePicker';
import { ChooseOnPage, MemorizedPreview } from './MemorizedPreview';
import { PageRangeFields } from './PageRangeFields';
import * as firestoreService from '../../services/firestoreService';
import { getRevisionDayForUser } from '../../lib/fajrBoundary';
import { typeV2 } from '../../theme/v2';
import type { UserPage } from '../../types';
import { BlockMark } from './BlockMark';
import { FormLabel, InfoLine, DismissArea, MinutesField, Segmented, Suggestion, dayWords } from './AddSheetParts';
import { t } from '../../i18n';

// Revisely Dev chooses on the real page ('page', MEM-8), with Surah and Juz beside it.
type What = 'ayahs' | 'pages' | 'page' | 'surah' | 'juz';

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
  if (h < 12) return today ? t('activity.add.thisMorning') : t('activity.add.thatMorning');
  if (h < 17) return today ? t('activity.add.thisAfternoon') : t('activity.add.thatAfternoon');
  return today ? t('activity.add.thisEvening') : t('activity.add.thatEvening');
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
  const [minutes, setMinutes] = useState('');
  const onThePage = memorizedPickerOn();
  const firstTab: What = onThePage ? 'page' : 'ayahs';
  const [what, setWhat] = useState<What>(firstTab);
  // The picker's choice (MEM-8), where it opens, and the surah or juz last used with its name.
  const [pick, setPick] = useState<AyahPick | null>(null);
  const [pickerPage, setPickerPage] = useState<number | null>(null);
  const [rangePick, setRangePick] = useState<AyahPick | null>(null);
  const [rangeName, setRangeName] = useState('');
  const rangeUsed = useRef<What | null>(null);
  // What was chosen before "Use" on the day's reading, for its Undo.
  const beforeReading = useRef<AyahPick | null>(null);
  // A sheet in this one, still going: the next waits for it (iOS refuses a modal while another is leaving, SHEET-1).
  const nestedGoing = useRef(false);
  const nestedNext = useRef<(() => void) | null>(null);
  const [rangeKind, setRangeKind] = useState<'surah' | 'juz'>('surah');
  // The ayahs: inside the sitting's pages, or the whole Qur'an.
  const range = useMemo(() => {
    const keys = sitting && sitting.pages.length > 0 ? ayahsOfPages(sitting.pages) : null;
    return keys && keys.length > 0 ? { lo: keys[0], hi: keys[keys.length - 1] } : { lo: 1001, hi: LAST_AYAH };
  }, [sitting]);
  const [fromAyah, setFromAyah] = useState<AyahKey>(range.lo);
  const [toAyah, setToAyah] = useState<AyahKey>(range.lo);
  // The whole pages: the sitting's, or every page.
  const pageBounds = useMemo(() => {
    const held = (sitting?.pages ?? []).filter((p) => Number.isInteger(p) && p >= 1 && p <= 604);
    return held.length > 0 ? { lo: Math.min(...held), hi: Math.max(...held) } : { lo: 1, hi: 604 };
  }, [sitting]);
  const [fromPage, setFromPage] = useState(pageBounds.lo);
  const [toPage, setToPage] = useState(pageBounds.lo);
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
  // Whole pages from the first page not memorized, to the sitting's last page (or that one page).
  const openPages = () => {
    let first = pageBounds.lo;
    while (first < pageBounds.hi && memorized.has(first)) first++;
    if (memorized.has(first)) first = pageBounds.lo;
    setFromPage(first);
    setToPage(sitting ? pageBounds.hi : first);
  };
  // Each time it opens: From at the first ayah (and page) not memorized in the range, To at the
  // sitting's end (one flick of To sets where it stopped), and the sitting's minutes.
  useEffect(() => {
    if (!visible) return;
    const open = ayahsBetween(range.lo, range.hi).find((k) => !memorizedNow.has(k)) ?? range.lo;
    setWhat(firstTab);
    setPick(sitting ? { from: open, to: range.hi } : null);
    setPickerPage(null);
    setRangePick(null);
    rangeUsed.current = null;
    nestedGoing.current = false;
    nestedNext.current = null;
    setFromAyah(open);
    setToAyah(sitting ? range.hi : open);
    openPages();
    if (sitting?.minutes != null && sitting.minutes > 0) setMinutes(String(sitting.minutes));
    // Only when it opens: what is memorized changes as it adds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, range, pageBounds]);
  const suggestion = memorizeSuggestion(
    readings.flatMap((r) => r.pages),
    memorized,
  );
  // When the suggested pages were read: the first session that held one of them.
  const readAt = readings.find((r) => r.pages.some((p) => suggestion.includes(p)))?.startedAt;
  const suggestionText = [
    describePassage(suggestion, { form: 'ayahsCompact' }),
    t('activity.add.readOn', { when: readAt != null && Number.isFinite(readAt) ? partOfDay(readAt, dayName === 'today') : dayWords(dayName) }),
  ].join(' · ');

  const pageRange = useMemo(() => Array.from({ length: Math.max(0, toPage - fromPage + 1) }, (_, i) => fromPage + i), [fromPage, toPage]);
  const pageNumbers = usedReading ?? pageRange;
  const minutesValue = minutes.trim() === '' ? null : Number(minutes);
  const minutesOk = minutesValue === null || (Number.isInteger(minutesValue) && minutesValue >= 0);
  // A sitting's own pages, in order: the picker keeps inside them, also when they have a gap (MEM-5).
  const held = useMemo(() => (sitting && sitting.pages.length > 0 ? [...new Set(sitting.pages)].sort((a, b) => a - b) : null), [sitting]);
  const onRange = onThePage && (what === 'surah' || what === 'juz');
  const byAyah = what === 'ayahs' || what === 'page' || onRange;
  const ayahs = useMemo(() => {
    if (what === 'page') return chosenAyahs(pick, memorizedNow, held ?? usedReading);
    if (onRange) return chosenAyahs(rangePick, memorizedNow, held);
    return ayahsBetween(fromAyah, toAyah);
  }, [what, onRange, pick, rangePick, memorizedNow, held, usedReading, fromAyah, toAyah]);
  const canAdd = (byAyah ? ayahs.length > 0 : pageNumbers.length > 0) && minutesOk && !saving && !!user;
  // How much is memorized now, and after adding (MEM-2): "50.3% → 50.6% of the Quran".
  const shareNow = useMemo(() => memorizedPageShare(pages ?? []), [pages]);
  const shareAfter = useMemo(
    () => (byAyah && ayahs.length > 0 ? memorizedPageShare(addAyahs(pages ?? [], ayahs, '').pages) : shareNow),
    [byAyah, ayahs, pages, shareNow],
  );

  const useReading = () => {
    if (usedReading) {
      openPages();
      setPick(beforeReading.current);
      setUsedReading(null);
      return;
    }
    if (suggestion.length === 0) return;
    // As ayahs: from the first not memorized on those pages to the end of the last (MEM-1).
    const read = ayahsOfPages(suggestion);
    setWhat(firstTab);
    beforeReading.current = pick;
    setPick({ from: read.find((k) => !memorizedNow.has(k)) ?? read[0], to: read[read.length - 1] });
    setFromAyah(read.find((k) => !memorizedNow.has(k)) ?? read[0]);
    setToAyah(read[read.length - 1]);
    setFromPage(suggestion[0]);
    setToPage(suggestion[suggestion.length - 1]);
    setUsedReading(suggestion);
  };

  const handleAdd = async () => {
    if (!user || (byAyah ? ayahs.length === 0 : pageNumbers.length === 0)) return;
    setSaving(true);
    try {
      // Memorized on the day it is added to: now for today, that day (at noon, its own date in any
      // zone) for an earlier one. It said today for every day (Nov 2026).
      const [y, m, d] = day.split('-').map(Number);
      const memorizedOn = day === getRevisionDayForUser(user) ? new Date().toISOString() : new Date(y, m - 1, d, 12).toISOString();
      if (byAyah) {
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
      setMinutes('');
      setUsedReading(null);
      setWhat(firstTab);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Revisely Dev's row of pages scrolls sideways, and a scroll view never sits inside a Pressable (CLAUDE.md, UI
  // traps): there only the minutes are in the area that puts the keyboard away.
  const Body = onThePage ? React.Fragment : DismissArea;
  const Foot = onThePage ? DismissArea : React.Fragment;
  // A surah's or juz's pages are all shown; what is already memorized on them is faded and not added.
  const previewPages = useMemo(
    () => (onRange ? pagesOfAyahs(chosenAyahs(rangePick, new Set(), held)) : pagesOfAyahs(ayahs)),
    [onRange, rangePick, held, ayahs],
  );
  const leftOff = useMemo(
    () => (held ? firstOpenIn(held, memorizedNow) : leftOffAyah(pages ?? [], memorizedNow)),
    [held, pages, memorizedNow],
  );
  const leftOffPage = leftOff != null ? pageOfAyah(leftOff) : pageBounds.lo;
  // One sheet at a time in this one: the next waits until the last has gone.
  const openNested = (open: () => void) => {
    if (nestedGoing.current) {
      nestedNext.current = open;
      return;
    }
    nestedGoing.current = true;
    open();
  };
  const nestedGone = () => {
    nestedGoing.current = false;
    const next = nestedNext.current;
    nestedNext.current = null;
    if (next) openNested(next);
  };
  const openPicker = (page?: number) => {
    Keyboard.dismiss();
    const at = page ?? (pick ? pageOfAyah(pick.to) : leftOffPage);
    openNested(() => setPickerPage(at));
  };
  const openRange = (kind: 'surah' | 'juz') => {
    setRangeKind(kind);
    openNested(() => setPickerOpen(true));
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('activity.day.memorized')}
      titleMark={<BlockMark kind="memorized" size={24} />}
      headerRule="full"
      left={{ label: t('common.cancel'), onPress: onClose }}
      right={{ label: saving ? t('common.saving') : t('activity.add.add'), onPress: handleAdd, strong: true, accent: true, disabled: !canAdd, testID: 'add-memorized-add' }}
      keyboard
      scroll={onThePage}
      testID="add-memorized-sheet"
    >
      <Body>
      <View style={styles.body}>
        {/* From a sitting it is already on that reading's ayahs: nothing to offer again. */}
        {suggestion.length > 0 && !sitting && (
          <View style={styles.top}>
            <Suggestion
              label={t('activity.add.fromYourReading')}
              text={suggestionText}
              action={usedReading ? t('common.undo') : t('activity.add.use')}
              onAction={useReading}
              accessibilityLabel={usedReading ? t('activity.add.undoReading') : t('activity.add.useReading')}
              testID="add-memorized-from-reading"
            />
          </View>
        )}

        <FormLabel text="WHAT" />
        <Segmented<What>
          options={
            onThePage
              ? [
                  { value: 'page', label: t('activity.pick.onThePage') },
                  { value: 'surah', label: t('common.surah') },
                  { value: 'juz', label: t('common.juz') },
                ]
              : [
                  { value: 'ayahs', label: t('activity.add.ayahs') },
                  { value: 'pages', label: t('activity.add.wholePages') },
                  { value: 'surah', label: t('common.surah') },
                ]
          }
          value={what}
          onChange={(w) => {
            setWhat(w);
            if (w === 'surah' || w === 'juz') openRange(w);
          }}
          testID="add-memorized-tab"
        />
        {onThePage ? (
          <View style={styles.fields}>
            {previewPages.length > 0 && (what === 'page' || rangeUsed.current === what) ? (
              <MemorizedPreview
                pages={previewPages}
                ayahs={ayahs}
                memorized={memorizedNow}
                name={onRange && !(sitting && ayahs.length > 0) ? rangeName : pickName(ayahs)}
                byPages={onRange}
                onOpen={(page) => (what === 'page' ? openPicker(page) : openRange(what === 'juz' ? 'juz' : 'surah'))}
                onChange={() => (what === 'page' ? openPicker() : openRange(what === 'juz' ? 'juz' : 'surah'))}
              />
            ) : (
              <ChooseOnPage page={leftOffPage} memorized={memorizedNow} onOpen={() => openPicker()} />
            )}
          </View>
        ) : what === 'ayahs' ? (
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
              {`${describeAyahs(ayahs, { form: 'ayahsCompact' })} · ${ayahs.length} ${ayahs.length === 1 ? 'ayah' : 'ayahs'}`}
            </Text>
          </View>
        ) : (
          <View style={styles.fields}>
            <PageRangeFields
              from={fromPage}
              to={toPage}
              lo={pageBounds.lo}
              hi={pageBounds.hi}
              onFrom={(p) => {
                setUsedReading(null);
                setFromPage(p);
              }}
              onTo={(p) => {
                setUsedReading(null);
                setToPage(p);
              }}
              testIDs={{ from: 'add-memorized-from', to: 'add-memorized-to' }}
            />
            <Text style={[typeV2.meta, styles.under, { color: palette.secondary }]} testID="add-memorized-pages">
              {`${describePassage(pageNumbers, { form: 'ayahsCompact' })} · ${pageNumbers.length} ${pageNumbers.length === 1 ? 'page' : 'pages'}`}
            </Text>
          </View>
        )}

        <Foot>
        <FormLabel text="MINUTES" />
        <MinutesField value={minutes} onChange={setMinutes} testID="add-memorized-minutes" />

        {what === 'ayahs' && shareAfter > shareNow ? (
          <Text style={[typeV2.meta, styles.under, { color: palette.secondary }]} testID="add-memorized-share">
            {t('activity.add.shareOn', { day: dayWords(dayName), now: percent(shareNow), after: percent(shareAfter) })}
          </Text>
        ) : null}

        <InfoLine
          text={
            // A custom plan doesn't add new pages by itself (pruneCustomPlanForMemorized).
            user?.customPlan
              ? t('activity.add.footCustomPlan')
              : t('activity.add.foot')
          }
        />
        </Foot>
      </View>
      </Body>

      <RangePickerSheet
        visible={pickerOpen}
        initialKind={rangeKind}
        onHidden={nestedGone}
        onClose={() => {
          setPickerOpen(false);
          // Revisely Dev: closed without choosing, back to the page. The store app goes on to Whole pages.
          if (onThePage) setWhat((w) => (w === 'page' || rangeUsed.current === w ? w : 'page'));
          else setWhat((w) => (w === 'surah' ? 'pages' : w));
        }}
        onUse={(r) => {
          // A surah's or juz's pages, inside the sitting's when opened from one.
          const clamp = (p: number) => Math.min(pageBounds.hi, Math.max(pageBounds.lo, p));
          setFromPage(clamp(r.from));
          setToPage(Math.max(clamp(r.from), clamp(r.to)));
          setRangeName(r.name);
          setRangePick(r.ayahs);
          rangeUsed.current = rangeKind;
          setUsedReading(null);
        }}
      />
      {onThePage ? (
        <MemorizedPagePicker
          visible={visible && pickerPage != null}
          onClose={() => setPickerPage(null)}
          onHidden={nestedGone}
          onDone={(p, only) => {
            setPick(p);
            setUsedReading(held ? null : only);
          }}
          pick={pick}
          openPage={pickerPage ?? leftOffPage}
          memorized={memorizedNow}
          leftOff={leftOff}
          held={held}
          only={held ?? usedReading}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  top: { marginTop: 8 },
  fields: { marginTop: 10 },
  under: { marginTop: 8, marginHorizontal: 2 },
});
