// Revised elsewhere's picker (ACT-33, Revisely Dev; Majd's pick, Nov 23 2026: "no one wants to scroll down and find a specific
// page especially if a user is a hafiz"). A search above the thirty juz: typing swaps the grid for what it finds, a tap chooses a
// juz, and a hold opens it for part of it. Add logs the pages for that day by hand, as RevisedElsewhereSheet does (ACT-5): a logged
// page on the day's schedule ticks it off, and any other never changes the schedule or "N of 20".

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { JuzGrid } from '../onboarding/JuzGrid';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { creditedOnDay } from '../../lib/aheadCredit';
import { planDuePages } from '../../lib/carryOver';
import { manualRevisionItem } from '../../lib/manualRevision';
import { logger } from '../../lib/logger';
import { getPagesForJuz } from '../../lib/quranData';
import {
  chosenHalf,
  chosenInJuz,
  chosenWords,
  juzHalves,
  juzParts,
  juzStates,
  partName,
  searchPlaces,
  setJuzPages,
  togglePages,
} from '../../lib/revisedPicker';
import { radiusV2, typeV2 } from '../../theme/v2';
import type { RevisionLog } from '../../types';
import { dayWords } from './AddSheetParts';
import { revisedOnDay, useDayItems } from './useDayItems';
import { backIcon } from '../../i18n/direction';
import { t } from '../../i18n';

export function RevisedPickerSheet({
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
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [openJuz, setOpenJuz] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (visible) {
      setChosen(new Set());
      setQuery('');
      setOpenJuz(null);
    }
  }, [visible]);

  const memorizedPages = useMemo(() => (pages ?? []).filter((p) => p.status === 'memorized'), [pages]);
  // What the day had scheduled: its session's assignment, or the plan's pages for it.
  const due = useMemo(() => {
    const assigned = [...new Set(logs.filter((l) => l.date === day).flatMap((l) => l.assignedPages ?? []))];
    if (assigned.length > 0) return assigned;
    return user ? planDuePages(user, day, memorizedPages) : [];
  }, [logs, day, user, memorizedPages]);
  const items = useDayItems(day, visible);
  const revised = useMemo(() => new Set([...creditedOnDay(logs, day), ...revisedOnDay(items, day)]), [logs, day, items]);
  const canLog = useMemo(
    () => new Set(memorizedPages.map((p) => p.pageNumber).filter((p) => !revised.has(p))),
    [memorizedPages, revised],
  );
  // A page revised while the sheet was open can't be logged twice.
  const logging = [...chosen].filter((p) => canLog.has(p)).sort((a, b) => a - b);
  const canAdd = logging.length > 0 && !saving && !!user;

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
  const before = due.filter((p) => revised.has(p)).length;
  const after = due.filter((p) => revised.has(p) || logging.includes(p)).length;
  const pagesText = t('common.pages', { count: logging.length });
  const footDetail =
    logging.length === 0
      ? due.length > 0
        ? t('activity.picker.neverChanges', { day: dayText, due: due.length })
        : ''
      : due.length === 0
        ? pagesText
        : t(after === before ? 'activity.picker.stays' : 'activity.picker.becomes', { pages: pagesText, day: dayText, done: after, due: due.length });

  const inJuz = openJuz != null ? chosenInJuz(openJuz, new Set(logging), canLog) : null;
  const footTitle = openJuz != null ? inJuz?.title ?? t('activity.picker.nothing') : chosenWords(new Set(logging), canLog) || t('activity.picker.nothing');
  const foot = (
    <View style={[styles.foot, { borderTopColor: palette.separator }]}>
      <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4} testID="elsewhere-summary">
        {footTitle}
      </Text>
      {(openJuz != null ? inJuz?.detail : footDetail) ? (
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="elsewhere-summary-detail">
          {openJuz != null ? inJuz?.detail : footDetail}
        </Text>
      ) : null}
      {openJuz != null ? (
        <PillButton title={t('common.done')} size="lg" onPress={() => setOpenJuz(null)} style={styles.footButton} testID="elsewhere-juz-done" />
      ) : (
        <PillButton
          title={logging.length > 0 ? t('activity.picker.addPages', { pages: pagesText }) : t('activity.add.add')}
          size="lg"
          disabled={!canAdd}
          busy={saving}
          onPress={handleAdd}
          style={styles.footButton}
          testID="add-revised-add"
        />
      )}
    </View>
  );

  const check = (on: boolean) =>
    on ? (
      <View style={[styles.check, { backgroundColor: palette.primary }]}>
        <Ionicons name="checkmark" size={15} color={palette.onPrimary} />
      </View>
    ) : (
      <View style={[styles.check, styles.ring, { borderColor: palette.outline }]} />
    );

  const row = (key: string, title: string, detail: string, on: boolean, onPress: () => void, last: boolean, testID: string) => (
    <Tap
      key={key}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${title}, ${detail}`}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator }]}
      testID={testID}
    >
      <View style={styles.rowText}>
        <Text style={[typeV2.body, { color: palette.text }]}>{title}</Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{detail}</Text>
      </View>
      {check(on)}
    </Tap>
  );

  let body: React.ReactNode;
  if (openJuz != null) {
    const open = getPagesForJuz(openJuz).filter((p) => canLog.has(p));
    const halves = juzHalves(openJuz).map((h) => h.filter((p) => canLog.has(p)));
    const parts = juzParts(openJuz)
      .map((part) => part.filter((p) => canLog.has(p)))
      .filter((part) => part.length > 0);
    const mine = open.filter((p) => chosen.has(p));
    const half = chosenHalf(openJuz, chosen, canLog);
    const pills: { key: string; label: string; pages: number[]; on: boolean }[] = [
      { key: 'first', label: t('activity.picker.firstHalf'), pages: halves[0], on: half === 0 },
      { key: 'second', label: t('activity.picker.secondHalf'), pages: halves[1], on: half === 1 },
      { key: 'whole', label: t('activity.picker.wholeJuz'), pages: open, on: open.length > 0 && mine.length === open.length },
    ];
    body = (
      <View testID="elsewhere-juz">
        <Tap onPress={() => setOpenJuz(null)} accessibilityRole="button" accessibilityLabel={t('activity.picker.allJuz')} style={styles.back} testID="elsewhere-back">
          <Ionicons name={backIcon()} size={18} color={palette.link} />
          <Text style={[typeV2.body, { color: palette.link }]} maxFontSizeMultiplier={1.4}>
            {t('activity.picker.allJuz')}
          </Text>
        </Tap>
        <View style={styles.pills}>
          {pills
            .filter((p) => p.pages.length > 0)
            .map((p) => (
              <Tap
                key={p.key}
                onPress={() => setChosen((c) => setJuzPages(c, openJuz, p.on ? [] : p.pages))}
                accessibilityRole="button"
                accessibilityState={{ selected: p.on }}
                style={[styles.pill, p.on ? { backgroundColor: palette.primary } : { borderWidth: 1, borderColor: palette.outline }]}
                testID={`elsewhere-half-${p.key}`}
              >
                <Text style={[typeV2.button, { color: p.on ? palette.onPrimary : palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {p.label}
                </Text>
              </Tap>
            ))}
        </View>
        {parts.map((part, i) => {
          const name = partName(part);
          const on = part.every((p) => chosen.has(p));
          return row(`part-${part[0]}`, name.title, name.detail, on, () => setChosen((c) => togglePages(c, part)), i === parts.length - 1, `elsewhere-part-${i}`);
        })}
      </View>
    );
  } else {
    const results = query.trim() ? searchPlaces(query, canLog) : null;
    body = (
      <View>
        <View style={[styles.search, { backgroundColor: palette.fill }]}>
          <Ionicons name="search" size={18} color={palette.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('activity.picker.search')}
            placeholderTextColor={palette.secondary}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={t('activity.picker.search')}
            style={[typeV2.body, styles.input, { color: palette.text }]}
            testID="elsewhere-search"
          />
          {query ? (
            <Tap onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('activity.picker.clearSearch')} hitSlop={8} testID="elsewhere-search-clear">
              <Ionicons name="close-circle" size={18} color={palette.secondary} />
            </Tap>
          ) : null}
        </View>
        {results ? (
          results.length > 0 ? (
            results.map((r, i) => {
              const on = r.pages.every((p) => chosen.has(p));
              return row(r.key, r.title, r.detail, on, () => setChosen((c) => togglePages(c, r.pages)), i === results.length - 1, `elsewhere-result-${r.key}`);
            })
          ) : (
            <Text style={[typeV2.body, styles.none, { color: palette.secondary }]} testID="elsewhere-no-results">
              {t('activity.picker.noResults')}
            </Text>
          )
        ) : (
          <>
            <Text style={[typeV2.meta, styles.label, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
              {t('activity.picker.orTap')}
            </Text>
            <JuzGrid
              states={juzStates(chosen, canLog)}
              disabled={Array.from({ length: 30 }, (_, i) => !getPagesForJuz(i + 1).some((p) => canLog.has(p)))}
              onToggle={(juz) => setChosen((c) => togglePages(c, getPagesForJuz(juz).filter((p) => canLog.has(p))))}
              onHold={setOpenJuz}
              holdLabel={t('activity.picker.holdAction')}
            />
          </>
        )}
      </View>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={openJuz != null ? t('common.juzN', { n: openJuz }) : t('activity.elsewhere.title')}
      headerRule="full"
      scroll
      keyboard
      pinned={foot}
      testID="add-revised-sheet"
    >
      <View style={styles.body}>{body}</View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 12, paddingBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: radiusV2.media, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 8 },
  label: { marginTop: 14, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  none: { marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowText: { flex: 1, minWidth: 0 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1.5 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 8 },
  pill: { minHeight: 36, borderRadius: radiusV2.full, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  foot: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  footButton: { marginTop: 12 },
});
