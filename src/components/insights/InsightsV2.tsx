// The Insights tab's pieces in the new design (design/DesignContext), shared
// by the tab itself (screens/main/AlgorithmScreen) and the Smart Tracking
// preview's copy of it (screens/preview/SmartTrackingPreviewScreen).
//
// Flat rows on hairlines, a bold sentence-case header per section, strength as
// a status colour (weak red, strong green whatever the accent; moderate grey).

import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getSurahForPage } from '../../lib/quranData';
import { getQuranPageImageUrl } from '../../lib/quranImages';
import { fitPage } from '../../lib/pageFit';
import { getReadPalette } from '../../theme/readPalette';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { Mark } from '../v2/Mark';
import { Sheet } from '../v2/Sheet';
import { RowText, ThreadRow } from '../v2/ThreadRow';
import { Tap } from '../v2/Tap';
import { countStrengths, StrengthBucket, strengthTone } from './strength';

export { countStrengths, strengthBucket, strengthTone } from './strength';
export type { StrengthBucket } from './strength';

const BUCKETS: { key: StrengthBucket; label: string; rating: number }[] = [
  { key: 'weak', label: 'weak', rating: 1 },
  { key: 'moderate', label: 'moderate', rating: 3 },
  { key: 'strong', label: 'strong', rating: 5 },
];

/** A section's header: a bold sentence-case title, an optional line under it, something on the right. */
export function SectionHeader({
  title,
  detail,
  right,
  testID,
}: {
  title: string;
  detail?: string;
  right?: React.ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.sectionHead} testID={testID}>
      <View style={styles.sectionText}>
        <Text style={[typeV2.name, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
          {title}
        </Text>
        {detail ? (
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** A full-width hairline. */
export function Hairline() {
  const { palette } = useTheme();
  return <View style={{ height: layoutV2.hairline, backgroundColor: palette.separator }} />;
}

/**
 * Strength at a glance: one bar split by how many pages are weak, moderate
 * and strong, and a legend with the counts.
 */
export function StrengthBar({ ratings, testID = 'strength-bar' }: { ratings: number[]; testID?: string }) {
  const { palette } = useTheme();
  const counts = countStrengths(ratings);
  const shown = BUCKETS.filter((b) => counts[b.key] > 0);
  const summary = BUCKETS.map((b) => `${counts[b.key]} ${b.label}`).join(', ');
  return (
    <View style={styles.barBlock} accessible accessibilityLabel={`Strength: ${summary}`} testID={testID}>
      <View style={styles.bar}>
        {shown.length === 0 ? (
          <View style={[styles.segment, { flex: 1, backgroundColor: palette.separator }]} />
        ) : (
          shown.map((b) => (
            <View
              key={b.key}
              style={[styles.segment, { flex: counts[b.key], backgroundColor: strengthTone(b.rating, palette) }]}
              testID={`${testID}-${b.key}`}
            />
          ))
        )}
      </View>
      <View style={styles.legend}>
        {BUCKETS.map((b) => (
          <View key={b.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: strengthTone(b.rating, palette) }]} />
            <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]} testID={`${testID}-count-${b.key}`}>
              {`${counts[b.key]} ${b.label}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A row's second line: the strength's dot, then what to say about it. */
export function StrengthLine({ rating, text }: { rating: number; text: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.strengthLine}>
      <View style={[styles.dot, { backgroundColor: strengthTone(rating, palette) }]} testID="strength-dot" />
      <RowText secondary numberOfLines={2} style={styles.flex}>
        {text}
      </RowText>
    </View>
  );
}

/**
 * One page, surah or juz in Insights: its number in the mark, its name, and
 * its strength with a reason. Tapping it opens the page (or narrows to a juz).
 */
export function InsightRow({
  number,
  name,
  rating,
  text,
  onPress,
  accessibilityLabel,
  separator = true,
  testID,
}: {
  number: number;
  name: string;
  rating: number;
  text: string;
  onPress: () => void;
  accessibilityLabel?: string;
  separator?: boolean;
  testID?: string;
}) {
  return (
    <ThreadRow
      mark={<Mark label={String(number)} />}
      name={name}
      onPress={onPress}
      separator={separator}
      accessibilityLabel={accessibilityLabel ?? `${name}. ${text}`}
      testID={testID}
    >
      <StrengthLine rating={rating} text={text} />
    </ThreadRow>
  );
}

/** "Show all (12)" / "Show less" under a list. */
export function ShowMore({
  expanded,
  hidden,
  onToggle,
  testID = 'show-more',
}: {
  expanded: boolean;
  /** How many rows are hidden while collapsed. */
  hidden: number;
  onToggle: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const label = expanded ? 'Show less' : `Show all (${hidden})`;
  return (
    <Tap onPress={onToggle} accessibilityRole="button" accessibilityLabel={label} style={styles.showMore} testID={testID}>
      <Text style={[typeV2.body, { color: palette.link }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Tap>
  );
}

/** A quiet line where a list would be. */
export function QuietLine({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Text style={[typeV2.body, styles.quiet, { color: palette.secondary }]} testID={testID}>
      {children}
    </Text>
  );
}

/**
 * A page of the mushaf in a sheet, as the reader draws it (the same page
 * colours, from theme/readPalette): what a row opens in Insights.
 */
export function PagePreviewSheet({ pageNumber, onClose }: { pageNumber: number | null; onClose: () => void }) {
  const { isDark } = useTheme();
  const read = getReadPalette(isDark, true);
  const { width, height } = useWindowDimensions();
  // Keep the page while the sheet slides away.
  const last = useRef<number | null>(pageNumber);
  if (pageNumber != null) last.current = pageNumber;
  const shown = last.current;
  const [loading, setLoading] = useState(true);

  // As large as fits: the screen's width less the gutters, or the sheet's
  // height less its handle and title.
  const size = fitPage(width - layoutV2.gutter * 2, height * 0.9 - 160);
  const surah = shown != null ? getSurahForPage(shown) : null;

  return (
    <Sheet
      visible={pageNumber != null}
      onClose={onClose}
      title={shown != null ? `Page ${shown}` : undefined}
      message={surah ? `${surah.name} · ${surah.nameArabic}` : undefined}
      right={{ label: 'Done', onPress: onClose, strong: true, testID: 'preview-done' }}
      scroll
      onShow={() => setLoading(true)}
      testID="page-preview"
    >
      {shown != null ? (
        <View
          style={[styles.pageBox, { width: size.width, height: size.height, backgroundColor: read.pageBg }]}
          accessibilityLabel={`Page ${shown}`}
        >
          {loading ? <ActivityIndicator style={styles.loader} color={read.textSecondary} /> : null}
          <Image
            source={{ uri: getQuranPageImageUrl(shown) }}
            resizeMode="contain"
            style={[{ width: size.width, height: size.height }, read.pageTint != null && { tintColor: read.pageTint }]}
            onLoadStart={() => setLoading(true)}
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
            testID="page-preview-image"
          />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: layoutV2.gutter,
    paddingTop: layoutV2.rowPad + 8,
    paddingBottom: 4,
  },
  sectionText: { flex: 1 },
  barBlock: { paddingHorizontal: layoutV2.gutter, paddingTop: 10, paddingBottom: layoutV2.rowPad },
  bar: { flexDirection: 'row', height: 10, gap: 2, borderRadius: 5, overflow: 'hidden' },
  segment: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  strengthLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  showMore: { paddingHorizontal: layoutV2.gutter, paddingVertical: 12 },
  quiet: { paddingHorizontal: layoutV2.gutter, paddingTop: 4, paddingBottom: layoutV2.rowPad },
  pageBox: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radiusV2.media,
    overflow: 'hidden',
    marginTop: 4,
  },
  loader: { position: 'absolute' },
});
