import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { spokenText } from '../../lib/passages';
import { testHeadline, testPlaceName, type TestResult } from '../../lib/reciteLive/testMe';
import { findingsLine } from './TakeSummarySheet';
import { peekedLine } from '../../lib/reciteLive/peeked';

/** Chrome text stops growing here (CLAUDE.md, UI traps). */
const CHROME_MAX = 1.4;

/** How a place went, in words: "Clean", "1 wrong word", "Stopped before the end", "Not continued". */
export function outcomeText(r: TestResult): string {
  switch (r.outcome) {
    case 'clean':
      return 'Clean';
    case 'mistakes':
      return [findingsLine(r.marks) || 'Mistakes', r.peeked ? peekedLine(r.peeked) : ''].filter(Boolean).join(', ');
    case 'helped':
      return peekedLine(r.peeked);
    case 'unfinished':
      return 'Stopped before the end';
    case 'missed':
      return 'Not continued';
  }
}

/**
 * Test me's first step: where from. Everything memorized, or one juz of it (only the juz with somewhere to start). A
 * tap starts the test.
 */
export function TestMeScopeSheet({
  visible,
  juz,
  onStart,
  onClose,
}: {
  visible: boolean;
  /** The juz a test can be given. */
  juz: { juz: number }[];
  onStart: (juz: number | null) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const row = (key: string, title: string, meta: string | null, onPress: () => void, first = false) => (
    <Tap
      key={key}
      onPress={onPress}
      style={[styles.row, !first && { borderTopWidth: layoutV2.hairline, borderTopColor: palette.separator }]}
      accessibilityRole="button"
      accessibilityLabel={[title, meta].filter(Boolean).join(', ')}
      testID={`test-me-${key}`}
    >
      <View style={styles.rowText}>
        <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX}>
          {title}
        </Text>
        {meta ? (
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
    </Tap>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="Test me" scroll testID="test-me-sheet">
      {row(
        'all',
        'Everything you’ve memorized',
        juz.length > 1 ? `${juz.length} juz` : null,
        () => onStart(null),
        true,
      )}
      {juz.length > 1 ? juz.map((j) => row(`juz-${j.juz}`, `Juz ${j.juz}`, null, () => onStart(j.juz))) : null}
    </Sheet>
  );
}

/**
 * The end of a test: how many places were continued cleanly, then each place and how it went (a tap shows it on the
 * page). Test me again (the same juz, new places) and Done.
 */
export function TestSummarySheet({
  visible,
  results,
  onPlace,
  onAgain,
  onDone,
}: {
  visible: boolean;
  results: readonly TestResult[];
  onPlace: (r: TestResult) => void;
  onAgain: () => void;
  onDone: () => void;
}) {
  const { palette } = useTheme();
  const actions = (
    <View style={styles.buttons}>
      <PillButton title="Test me again" size="lg" onPress={onAgain} testID="test-summary-again" />
      <PillButton title="Done" size="lg" variant="outline" onPress={onDone} testID="test-summary-done" />
    </View>
  );
  return (
    <Sheet visible={visible} onClose={onDone} title="Test me" scroll pinned={actions} testID="test-summary">
      <View style={styles.head}>
        <Text style={[typeV2.title, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX} accessibilityRole="header" testID="test-summary-headline">
          {testHeadline(results)}
        </Text>
      </View>
      {results.map((r, i) => {
        const place = testPlaceName(r.place);
        const how = outcomeText(r);
        return (
          <Tap
            key={`${r.place.span.from.join(':')}-${i}`}
            onPress={() => onPlace(r)}
            style={[styles.row, { borderTopWidth: layoutV2.hairline, borderTopColor: palette.separator }]}
            accessibilityRole="button"
            accessibilityLabel={`${spokenText(place)}: ${how}. Show it on the page`}
            testID={`test-summary-place-${r.outcome}`}
          >
            <View style={styles.rowText}>
              <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX}>
                {place}
              </Text>
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX} testID="test-summary-outcome">
                {how}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
          </Tap>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: layoutV2.gutter, paddingTop: 16, paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutV2.markGap,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowText: { flex: 1, minWidth: 0 },
  buttons: { paddingHorizontal: layoutV2.gutter, paddingTop: 16, gap: 10 },
});
