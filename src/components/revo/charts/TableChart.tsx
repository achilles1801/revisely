import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import type { UserPage } from '../../../types';
import { pagesStrip, recencyLine, sortRows, stripEnds, TABLE_HEADS, tableCell, WORST_FIRST, type RatingBand, type TableRow } from '../../../lib/revo/charts';
import { passagePreview } from '../../../lib/revo/facts';
import { describePageRange, spokenText } from '../../../lib/passages';
import type { RevoTableColumn } from '../../../lib/revo/types';
import { Tap } from '../../v2/Tap';
import { CHART_TEXT_MAX, ChartFrame } from './ChartFrame';
import { ChartButtons, DetailLine, RatingCounts, RatingStrip } from './ChartParts';

/**
 * Juz or surahs side by side in up to three columns, each from what the app shows for them. A
 * heading sorts by it (what needs care first; again, the other way); a row opens under itself with
 * its pages' strengths, Revise first tomorrow and Open in the reader.
 */
export function TableChart({
  title,
  rows,
  columns,
  byJuz,
  userPages,
  onReviseFirst,
  onOpenPage,
  smart = true,
  testID = 'revo-chart-table',
}: {
  title: string;
  rows: readonly TableRow[];
  columns: readonly RevoTableColumn[];
  /** Rows are juz (else surahs): the first heading. */
  byJuz: boolean;
  userPages: readonly UserPage[];
  onReviseFirst?: (pages: number[]) => Promise<void>;
  onOpenPage?: (page: number) => void;
  /** The account's Smart Tracking: off, no weak or strength column and no strip (REVO-36). */
  smart?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  // Without ratings, strength means nothing: when and how often stand in for it.
  const strengthless = columns.filter((c) => c !== 'weak' && c !== 'strength');
  const shownColumns: readonly RevoTableColumn[] = smart ? columns : strengthless.length > 0 ? strengthless : ['lastRevised', 'times30'];
  const [sort, setSort] = useState<{ col: RevoTableColumn; worst: boolean } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const shown = useMemo(() => (sort ? sortRows(rows, sort.col, sort.worst) : rows), [rows, sort]);
  const hint = sort ? `Sorted by ${TABLE_HEADS[sort.col].toLowerCase()} · tap a row to see it` : 'Tap a heading to sort, a row to see it';

  const head = (col: RevoTableColumn) => {
    const on = sort?.col === col;
    // Down: what needs care first (the column's own order); up: the other way.
    const down = on && sort!.worst === (WORST_FIRST[col] === 'desc');
    return (
      <Tap
        key={col}
        style={[styles.value, styles.headCell]}
        onPress={() => setSort(on ? { col, worst: !sort!.worst } : { col, worst: true })}
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${TABLE_HEADS[col]}`}
        accessibilityState={{ selected: on }}
        hitSlop={6}
        testID={`${testID}-sort-${col}`}
      >
        <Text style={[styles.head, { color: on ? palette.text : palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX} numberOfLines={1}>
          {TABLE_HEADS[col]}
        </Text>
        {on ? <Ionicons name={down ? 'chevron-down' : 'chevron-up'} size={12} color={palette.text} /> : null}
      </Tap>
    );
  };

  return (
    <ChartFrame title={title} hint={hint} readout={null} onClear={() => undefined} testID={testID}>
      <View style={[styles.row, styles.heads, { borderBottomColor: palette.separator }]}>
        <Text style={[styles.head, styles.name, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
          {byJuz ? 'Juz' : 'Surah'}
        </Text>
        {shownColumns.map(head)}
        <View style={styles.chevron} />
      </View>
      {shown.map((r) => {
        const isOpen = open === r.key;
        const cells = shownColumns.map((c) => ({ c, ...tableCell(c, r.facts) }));
        return (
          <View key={r.key} style={[styles.item, { borderBottomColor: palette.separator }]}>
            <Tap
              style={styles.row}
              onPress={() => setOpen(isOpen ? null : r.key)}
              accessibilityRole="button"
              accessibilityLabel={spokenText(`${r.name}: ${cells.map((x) => `${TABLE_HEADS[x.c]} ${x.text}`).join(', ')}`)}
              accessibilityState={{ expanded: isOpen }}
              testID={`${testID}-row-${r.key}`}
            >
              <Text style={[styles.cellName, styles.name, { color: palette.text }]} maxFontSizeMultiplier={CHART_TEXT_MAX} numberOfLines={1}>
                {r.name}
              </Text>
              {cells.map((x) => (
                <Text
                  key={x.c}
                  style={[styles.cell, styles.value, { color: x.alert ? palette.red : palette.text }]}
                  maxFontSizeMultiplier={CHART_TEXT_MAX}
                  numberOfLines={1}
                >
                  {x.text}
                </Text>
              ))}
              <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={15} color={palette.secondary} style={styles.chevron} />
            </Tap>
            {isOpen ? <RowDetail row={r} byJuz={byJuz} smart={smart} userPages={userPages} onReviseFirst={onReviseFirst} onOpenPage={onOpenPage} testID={testID} /> : null}
          </View>
        );
      })}
    </ChartFrame>
  );
}

function RowDetail({
  row,
  byJuz,
  smart,
  userPages,
  onReviseFirst,
  onOpenPage,
  testID,
}: {
  row: TableRow;
  byJuz: boolean;
  smart: boolean;
  userPages: readonly UserPage[];
  onReviseFirst?: (pages: number[]) => Promise<void>;
  onOpenPage?: (page: number) => void;
  testID: string;
}) {
  const strip = useMemo(() => pagesStrip(row.pages, userPages), [row.pages, userPages]);
  const memorized = strip.filter((s) => s.memorized).map((s) => s.page);
  const counts: Record<RatingBand, number> = { weak: 0, moderate: 0, strong: 0 };
  for (const s of strip) if (s.band) counts[s.band]++;
  const ends = stripEnds(row.pages);
  // A juz is named by its surahs; a surah (already named) by what the app shows for it.
  const line = byJuz ? describePageRange(row.pages[0], row.pages[row.pages.length - 1], { wholeJuz: false }) : smart ? passagePreview(row.facts) : recencyLine(row.facts);
  return (
    <View style={styles.detail} testID={`${testID}-detail`}>
      <DetailLine text={line} />
      {/* Smart Tracking off: when and how often, in place of the strip (REVO-36). */}
      {!smart && byJuz ? <DetailLine text={recencyLine(row.facts)} testID={`${testID}-recency`} /> : null}
      {/* Nothing rated (not memorized, or never revised): no strip, only where to go. */}
      {smart && strip.some((s) => s.band) ? (
        <>
          <RatingStrip cells={strip.map((s) => s.band)} first={ends.first} last={ends.last} />
          <RatingCounts counts={counts} />
        </>
      ) : null}
      <ChartButtons
        key={row.key}
        reviseFirst={onReviseFirst && memorized.length > 0 ? () => onReviseFirst(memorized) : undefined}
        openPage={onOpenPage ? () => onOpenPage(row.pages[0]) : undefined}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heads: { marginTop: 12, paddingBottom: 6, minHeight: 28, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  item: { borderBottomWidth: StyleSheet.hairlineWidth },
  name: { flex: 1.2, minWidth: 0 },
  value: { flex: 1, minWidth: 0 },
  headCell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  head: { fontSize: 13, lineHeight: 17, fontWeight: '600' },
  cellName: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  cell: { fontSize: 15, lineHeight: 20, textAlign: 'right', fontVariant: ['tabular-nums'] },
  chevron: { width: 18 },
  detail: { paddingBottom: 14 },
});
