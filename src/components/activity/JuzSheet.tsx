// One juz, at a glance (mocks i5 and i6, Nov 7 2026; ACT-21): when it was last revised and how often,
// a strip of its pages, a row per surah, and the reader. Opened from a Coverage tile, the untouched
// row, and a day's Revised block. With Smart Tracking the strip and rows show strength; without it
// they show recency (ACT-19). Figures: lib/juzSheet.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ChromeText, STACK_AT_SCALE } from './ChromeText';
import { AddToPlanLink } from './AddToPlanLink';
import * as firestoreService from '../../services/firestoreService';
import { juzSheetModel, type JuzCellState } from '../../lib/juzSheet';
import { shiftDay } from '../../lib/journal';
import { describePassage, spokenText } from '../../lib/passages';
import { useRevoAvailable } from '../../lib/revo/availability';
import { openRevo } from '../../lib/revo/open';
import { prepare } from '../../lib/revo/facts';
import { juzAttachment } from '../../lib/revo/attachments';
import { useRevoContext } from '../../lib/revo/useRevoContext';
import { logger } from '../../lib/logger';
import { smartTrackingOn } from '../../lib/smartTracking';
import { allFirstTomorrow } from '../../lib/weakSpotActions';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { PillButton } from '../v2/PillButton';

/** Chrome text stops growing here, as headers and menu rows do. */
const MAX_SCALE = 1.4;

const STATE_WORDS: Record<JuzCellState, string> = {
  'not-memorized': 'not memorized',
  learning: 'being learned',
  weak: 'weak',
  moderate: 'moderate',
  strong: 'strong',
  week: 'revised this week',
  month: 'revised this month',
  older: 'not revised in 30 days',
};
const COUNT_WORDS: Record<string, string> = {
  weak: 'weak',
  moderate: 'moderate',
  strong: 'strong',
  week: 'this week',
  month: 'this month',
  older: 'over 30 days',
};

type Revised = { countsFor: string; pages: number[] }[];

export function JuzSheet({
  juz,
  onClose,
  today,
  revised,
  windowDays = 30,
  windowWords,
  windowInTheLast,
  onOpenPage,
  onPlanIt,
  onAddToPlan,
  firstTomorrow,
}: {
  /** The juz shown; null closes the sheet. */
  juz: number | null;
  onClose: () => void;
  today: string;
  /** Revision items covering the window, when the host has them; otherwise the sheet reads them. */
  revised?: Revised;
  windowDays?: number;
  /** The window in words ("in 30 days", "since 9 September"). */
  windowWords?: string;
  /** "in the last 30 days", "since 9 September". */
  windowInTheLast?: string;
  /** The reader at a page (pushed over the screen, so back returns: ACT-20). */
  onOpenPage: (page: number) => void;
  /** A stale juz: put its memorized pages first tomorrow (the untouched row's Plan it). */
  onPlanIt?: (pages: number[]) => void;
  /** A custom plan: "Add to plan" beside "First tomorrow", once Plan it is done (ACT-24). */
  onAddToPlan?: (pages: number[]) => void;
  /** Pages already first tomorrow: Plan it shows "First tomorrow ✓" instead (ACT-24). */
  firstTomorrow?: ReadonlySet<number>;
}) {
  const { palette } = useTheme();
  const { pages, user } = useApp();
  const revoOpen = useRevoAvailable(user);
  // The juz stays while the sheet slides away.
  const [shown, setShown] = useState<number | null>(juz);
  useEffect(() => {
    if (juz != null) setShown(juz);
  }, [juz]);
  const [loaded, setLoaded] = useState<Revised | null>(null);
  useEffect(() => {
    if (juz == null || revised) return;
    let live = true;
    firestoreService
      .getActivityItemsBetween(shiftDay(today, -(windowDays - 1)), today)
      .then((items) => {
        if (live) setLoaded(items.revisions);
      })
      .catch((err) => logger.warn('Could not load the juz sheet’s revisions', err));
    return () => {
      live = false;
    };
  }, [juz, revised, today, windowDays]);
  const smartTracking = smartTrackingOn(user);
  const model = useMemo(
    () =>
      shown == null
        ? null
        : juzSheetModel({ juz: shown, today, pages, revised: revised ?? loaded ?? [], windowDays, windowWords, windowInTheLast, smartTracking }),
    [shown, today, pages, revised, loaded, windowDays, windowWords, windowInTheLast, smartTracking],
  );
  // What a tap leads to runs once the sheet has gone (iOS can't present Revo, or move the stack
  // cleanly, while the sheet's modal is being dismissed).
  const pending = useRef<(() => void) | null>(null);
  const closeThen = (next: () => void) => {
    pending.current = next;
    onClose();
  };
  const runPending = () => {
    const next = pending.current;
    pending.current = null;
    next?.();
  };
  const revo = useRevoContext();
  const ask =
    model && revoOpen
      ? () => {
          const src = revo.sources();
          // Without the account's figures yet, Revo still opens (the juz isn't attached): never a dead tap.
          const attach = src ? juzAttachment(model.juz, prepare(src)) : undefined;
          const place = { kind: 'juz' as const, juz: model.juz };
          closeThen(() => openRevo(attach ? { attach, place } : { place }));
        }
      : null;

  const look = (state: JuzCellState) => {
    switch (state) {
      case 'weak':
        return { backgroundColor: palette.red };
      case 'moderate':
        return { backgroundColor: palette.secondary };
      case 'strong':
        return { backgroundColor: palette.good };
      case 'week':
        return { backgroundColor: palette.heat[3] };
      case 'month':
        return { backgroundColor: palette.heat[1] };
      case 'older':
        return { borderWidth: 1.5, borderColor: palette.red };
      default:
        // Not memorized; a page being learned fills by its share over this (PartFill, MEM-7).
        return { backgroundColor: palette.heat[0] };
    }
  };
  const partShown = model != null && model.cells.some((c) => c.state === 'learning' && (c.share ?? 0) > 0);

  return (
    <Sheet
      visible={juz != null}
      onClose={onClose}
      title={model?.title}
      message={model?.subtitle}
      messageMaxScale={MAX_SCALE}
      right={ask ? { label: 'Ask', onPress: ask } : undefined}
      scroll
      onHidden={runPending}
      testID="juz-sheet"
    >
      {model ? (
        <View>
          {/* When it was last revised, and how often in the window. */}
          <View style={styles.head}>
            <ChromeText style={styles.headLine} maxFontSizeMultiplier={MAX_SCALE}>
              <ChromeText style={[typeV2.name, { color: model.stale ? palette.red : palette.text }]} testID="juz-sheet-headline">
                {model.headline}
              </ChromeText>
              {model.beingLearned && model.learningText ? (
                <ChromeText style={[typeV2.meta, { color: palette.secondary }]} testID="juz-sheet-learning">{`   ${model.learningText}`}</ChromeText>
              ) : model.times ? (
                <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{`   ${model.times}`}</ChromeText>
              ) : null}
            </ChromeText>
            {model.stale && onPlanIt && allFirstTomorrow(model.memorizedPages, firstTomorrow ?? new Set()) ? (
              <View style={styles.doneRow}>
                <View style={styles.planIt} accessible accessibilityLabel="Goes first tomorrow" testID="juz-sheet-plan-it-done">
                  <Ionicons name="checkmark" size={16} color={palette.secondary} />
                  <ChromeText style={[typeV2.name, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                    First tomorrow
                  </ChromeText>
                </View>
                {onAddToPlan ? (
                  <AddToPlanLink
                    onPress={() => {
                      const planned = model.memorizedPages;
                      closeThen(() => onAddToPlan(planned));
                    }}
                    maxScale={MAX_SCALE}
                    testID="juz-sheet-add-to-plan"
                  />
                ) : null}
              </View>
            ) : model.stale && onPlanIt && model.memorizedPages.length > 0 ? (
              <Tap
                onPress={() => {
                  const planned = model.memorizedPages;
                  closeThen(() => onPlanIt(planned));
                }}
                accessibilityRole="button"
                hitSlop={8}
                style={styles.planIt}
                testID="juz-sheet-plan-it"
              >
                <ChromeText style={[typeV2.name, { color: palette.link }]} maxFontSizeMultiplier={MAX_SCALE}>
                  Plan it for tomorrow first
                </ChromeText>
                <Ionicons name="chevron-forward" size={16} color={palette.link} />
              </Tap>
            ) : null}
          </View>

          {/* The juz's pages: each opens in the reader. */}
          <View style={styles.strip} testID="juz-sheet-strip">
            {model.cells.map((c) => (
              <Tap
                key={c.page}
                onPress={() => closeThen(() => onOpenPage(c.page))}
                accessibilityRole="button"
                accessibilityLabel={`${spokenText(describePassage([c.page]))}, ${STATE_WORDS[c.state]}`}
                accessibilityHint="Opens in the reader"
                hitSlop={{ top: 6, bottom: 6 }}
                style={[styles.cell, look(c.state)]}
                testID={`juz-cell-${c.page}`}
              >
                {/* A page being learned: filled from the top by how much of it is memorized (MEM-7). */}
                {c.state === 'learning' && (c.share ?? 0) > 0 ? (
                  <View style={[styles.partFill, { height: `${Math.round((c.share ?? 0) * 100)}%`, backgroundColor: palette.done }]} testID={`juz-cell-part-${c.page}`} />
                ) : null}
              </Tap>
            ))}
          </View>
          <View style={styles.ends}>
            <ChromeText style={[typeV2.meta, styles.end, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
              {model.ends[0]}
            </ChromeText>
            <ChromeText style={[typeV2.meta, styles.end, styles.endRight, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
              {model.ends[1]}
            </ChromeText>
          </View>
          {model.counts.length > 0 || partShown ? (
            <View style={styles.counts} testID="juz-sheet-counts">
              {model.counts.map((c) => (
                <View key={c.state} style={styles.count}>
                  <View style={[styles.countMark, look(c.state)]} />
                  <ChromeText style={[typeV2.meta, styles.tabular, { color: palette.text, fontWeight: '600' }]} maxFontSizeMultiplier={MAX_SCALE}>
                    {c.n}
                  </ChromeText>
                  <ChromeText style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                    {COUNT_WORDS[c.state]}
                  </ChromeText>
                </View>
              ))}
              {partShown ? (
                <View style={styles.count}>
                  <PartMark color={palette.done} />
                  <ChromeText style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                    Part of a page
                  </ChromeText>
                </View>
              ) : null}
            </View>
          ) : null}
          {/* Being learned, in a juz revised before (MEM-7): what is memorized of it so far. */}
          {model.learningText && !model.beingLearned ? (
            <View style={styles.learning} testID="juz-sheet-learning">
              <PartMark color={palette.done} />
              <ChromeText style={[typeV2.meta, styles.learningText, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                <ChromeText style={{ color: palette.text, fontWeight: '600' }}>Being learned</ChromeText>
                {`   ${model.learningText}`}
              </ChromeText>
            </View>
          ) : null}

          <View style={[styles.rule, { backgroundColor: palette.separator }]} />
          {/* A row per surah: its state in words; each opens the reader at its first page here. */}
          {model.surahs.map((s, i) => (
            <Tap
              key={s.sura}
              onPress={() => closeThen(() => onOpenPage(s.firstPage))}
              accessibilityRole="button"
              accessibilityLabel={`${spokenText(s.name)}, ${spokenText(s.text)}`}
              accessibilityHint="Opens in the reader"
              style={[styles.row, i < model.surahs.length - 1 && { borderBottomWidth: layoutV2.hairline, borderBottomColor: palette.separator }]}
              testID={`juz-surah-${s.sura}`}
            >
              {s.state === 'learning' ? (
                <PartMark color={palette.done} />
              ) : (
                <View style={[styles.dot, s.state === 'not-memorized' ? { backgroundColor: palette.heat[0] } : look(s.state)]} />
              )}
              {/* The name, and what it is under it (recency's line is long: "Last revised … in 30 days"). */}
              <View style={styles.rowMain}>
                <ChromeText style={[typeV2.name, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
                  {s.name}
                </ChromeText>
                <ChromeText style={[typeV2.meta, { color: s.alert ? palette.red : palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                  {s.text}
                </ChromeText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
            </Tap>
          ))}

          <View style={styles.foot}>
            {model.continueAt ? (
              // Being learned: on from the first ayah not memorized yet (MEM-7).
              <PillButton
                title={`Continue at ${model.continueAt.label}`}
                size="sm"
                onPress={() => {
                  const at = model.continueAt!.page;
                  closeThen(() => onOpenPage(at));
                }}
                style={styles.footButton}
                testID="juz-sheet-continue"
              />
            ) : (
              <PillButton
                title="Open in the reader"
                variant="outline"
                size="sm"
                onPress={() => {
                  const first = model.memorizedPages[0] ?? model.cells[0].page;
                  closeThen(() => onOpenPage(first));
                }}
                style={styles.footButton}
                testID="juz-sheet-open"
              />
            )}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** ◐: part of a page memorized (the legend, a surah being learned). */
function PartMark({ color }: { color: string }) {
  return (
    <View style={[styles.partMark, { borderColor: color }]}>
      <View style={[styles.partHalf, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: 4, paddingBottom: 12, gap: 6 },
  headLine: { flexWrap: 'wrap' },
  planIt: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  doneRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
  strip: { flexDirection: 'row', gap: 3 },
  cell: { flex: 1, height: 28, borderRadius: 5, overflow: 'hidden' },
  partFill: { position: 'absolute', top: 0, left: 0, right: 0 },
  partMark: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, overflow: 'hidden' },
  partHalf: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%' },
  learning: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  learningText: { flexShrink: 1 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  end: { flexShrink: 1 },
  endRight: { textAlign: 'right' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countMark: { width: 8, height: 8, borderRadius: 4, marginRight: 2 },
  tabular: { fontVariant: ['tabular-nums'] },
  rule: { height: StyleSheet.hairlineWidth, marginTop: 16 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowMain: { flex: 1 },
  foot: { paddingTop: 16, paddingBottom: 8 },
  footButton: { alignSelf: 'flex-start' },
});
