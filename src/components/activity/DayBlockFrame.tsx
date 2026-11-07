// The frame of one block in Activity's day (gap audit §4, mock d1): a header row (the 36 mark, the
// title and its figure, one sub-line), a summary, and the items that hang off the block's thread line.
//
// Geometry (pt, from the screen's left edge): gutter 16; the mark 16–52, its centre (the line) at 34;
// content from 64 to the right margin 16. The line is 2pt `outline`, from 4 below the mark down to the
// last item's elbow, drawn only when the block has items. An elbow is 19 wide with a 12 radius and
// ends at the centre of its item's first line. A hairline closes every block.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from '../v2/Tap';
import { typeV2 } from '../../theme/v2';

const GUTTER = 16;
const MARK = 36;
const RAIL_W = 48; // 16 → 64: the line's column
const LINE_LEFT = 34 - GUTTER - 1; // the 2pt line, centred at x = 34
const ELBOW_W = 19;
const ELBOW_R = 12;
const FIRST_LINE = 10; // half a 20pt first line: where an elbow lands
const ITEM_TOP = 12;
const SUMMARY_TOP = 10;

type Rail = 'none' | 'through' | 'mid' | 'last';

export interface BlockHeaderActions {
  onLongPress?: () => void;
  a11yActions?: { name: string; label: string }[];
  onA11yAction?: (name: string) => void;
}

export function DayBlock({
  mark,
  title,
  figure,
  subline,
  summary,
  items,
  header,
  testID,
}: {
  mark: React.ReactNode;
  title: string;
  figure?: string;
  subline?: string;
  /** The block's own content under the header ("summary": the page strip, the chips). */
  summary?: React.ReactNode;
  /** What hangs off the thread line: recordings, notes, hand entries, timed reads. */
  items: React.ReactNode[];
  header?: BlockHeaderActions;
  testID?: string;
}) {
  const { palette } = useTheme();
  const hasItems = items.length > 0;
  // The line starts 4 below the mark: the header row is the mark's height, or the text's when taller.
  const headerTall = subline ? 38 : MARK;
  const firstOffset = Math.max(0, MARK + 4 - headerTall);
  const rows: { node: React.ReactNode; top: number; rail: Rail; key: string }[] = [];
  if (summary) rows.push({ node: summary, top: SUMMARY_TOP, rail: hasItems ? 'through' : 'none', key: 'summary' });
  items.forEach((node, i) => rows.push({ node, top: ITEM_TOP, rail: i === items.length - 1 ? 'last' : 'mid', key: `item-${i}` }));

  return (
    <View style={[styles.block, { borderBottomColor: palette.separator }]} testID={testID}>
      <Tap
        onLongPress={header?.onLongPress}
        disabled={!header?.onLongPress && !header?.a11yActions}
        accessibilityRole="button"
        accessibilityLabel={figure ? `${title}, ${figure}` : title}
        accessibilityActions={header?.a11yActions}
        onAccessibilityAction={(e) => header?.onA11yAction?.(e.nativeEvent.actionName)}
        style={[styles.header, !subline && styles.headerCentred]}
        testID={testID ? `${testID}-header` : undefined}
      >
        <View style={styles.mark}>{mark}</View>
        <View style={styles.headText}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
              {title}
            </Text>
            {figure ? <Text style={[styles.figure, { color: palette.text }]}>{figure}</Text> : null}
          </View>
          {subline ? (
            <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1}>
              {subline}
            </Text>
          ) : null}
        </View>
      </Tap>
      {rows.map((r, i) => (
        <View key={r.key} style={styles.row}>
          <View style={styles.rail}>
            <RailMark kind={r.rail} top={i === 0 ? firstOffset : 0} itemTop={r.top} />
          </View>
          <View style={[styles.content, { paddingTop: r.top }]}>{r.node}</View>
        </View>
      ))}
    </View>
  );
}

/** One row's piece of the thread line: straight through, or an elbow into the row (and on past it). */
function RailMark({ kind, top, itemTop }: { kind: Rail; top: number; itemTop: number }) {
  const { palette } = useTheme();
  if (kind === 'none') return null;
  const line = { backgroundColor: palette.outline };
  const elbow = (
    <View
      style={[
        styles.elbow,
        { top, height: itemTop + FIRST_LINE - top + 1, borderColor: palette.outline },
      ]}
    />
  );
  if (kind === 'through') return <View style={[styles.line, line, { top }]} />;
  if (kind === 'mid')
    return (
      <>
        <View style={[styles.line, line, { top }]} />
        {elbow}
      </>
    );
  return elbow;
}

/** An item's first line: a 15pt icon, then its text column (the rest of the item goes under it). */
export function ItemLine({
  icon,
  children,
  right,
}: {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  children: React.ReactNode;
  right?: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.itemLine}>
      {icon ? <Ionicons name={icon} size={15} color={palette.secondary} style={styles.itemIcon} /> : null}
      <View style={styles.itemBody}>{children}</View>
      {right ? <Text style={[typeV2.meta, styles.tabular, { color: palette.secondary }]}>{right}</Text> : null}
    </View>
  );
}

/** A page chip ("p. 562"): the bubble, as under a recording. */
export function PageChip({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: palette.bubble }]}>
      <Text style={[typeV2.body, styles.tabular, { color: palette.secondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: 16, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', paddingHorizontal: GUTTER, gap: 12, alignItems: 'flex-start' },
  headerCentred: { alignItems: 'center' },
  mark: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3 },
  figure: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.23, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row' },
  rail: { width: RAIL_W, marginLeft: GUTTER },
  content: { flex: 1, paddingRight: GUTTER },
  line: { position: 'absolute', left: LINE_LEFT, width: 2, bottom: 0 },
  elbow: {
    position: 'absolute',
    left: LINE_LEFT,
    width: ELBOW_W,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderBottomLeftRadius: ELBOW_R,
  },
  itemLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemIcon: { marginTop: 2.5 },
  itemBody: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  chip: { height: 32, borderRadius: 16, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
});
