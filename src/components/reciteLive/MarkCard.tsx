import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { arabicV2, layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { Box, placeMenu } from '../verse/menuPlacement';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { Mark } from '../../lib/reciteLive/contract';
import { isUnclear, markGroup } from '../../lib/reciteLive/contract';
import { markFill } from './markColours';
import { Phrase, Row, SmallPill } from './MarkParts';
import {
  expectedPhrase,
  markPlace,
  markTitle,
  recitedLabel,
  recitedPhrase,
  slipLine,
  tajweedLines,
  UNCLEAR_NOTE,
} from '../../lib/reciteLive/describe';
import { t } from '../../i18n';

const CARD_MARGIN = 12;

/** One mark's part of the card: what it is, where, Expected and Recited (or the tajweed note), and its actions. */
export function MarkBlock({
  mark,
  words,
  onDismiss,
  first,
}: {
  mark: Mark;
  words: QuranWords;
  onDismiss: (id: string) => void;
  first: boolean;
}) {
  const { palette } = useTheme();
  const fill = markFill(palette, mark);
  // Not clear: what the checker thinks it heard is the unclear part, so only what was expected shows, and why.
  const unclear = isUnclear(mark);
  const recited = unclear ? null : recitedPhrase(words, mark);
  const slip = unclear ? UNCLEAR_NOTE : slipLine(mark);
  return (
    <View style={[styles.block, !first && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]} testID={`mark-card-${mark.kind}`}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <View style={styles.titleRow}>
            <View style={[styles.swatch, { backgroundColor: fill }]} testID={`mark-card-swatch-${markGroup(mark)}`} />
            <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
              {markTitle(mark)}
            </Text>
          </View>
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
            {markPlace(mark)}
          </Text>
        </View>
        <SmallPill label={t('reciteLive.card.notMistake')} onPress={() => onDismiss(mark.id)} testID="mark-card-dismiss" />
      </View>
      {mark.kind === 'tajweed' ? (
        <View style={styles.tajweed}>
          <View style={styles.rowBody}>
            <Text style={[typeV2.body, { color: palette.text }]} maxFontSizeMultiplier={1.4}>{tajweedLines(mark).main}</Text>
            {tajweedLines(mark).sub ? (
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>{tajweedLines(mark).sub}</Text>
            ) : null}
          </View>
          <View style={[styles.arWrap, { backgroundColor: fill }]}>
            <Text style={[arabicV2(24), { color: palette.text }]} maxFontSizeMultiplier={1.6}>
              {words.uthmani(mark.w)}
            </Text>
          </View>
        </View>
      ) : (
        <View>
          <Row label={t('reciteLive.card.expected')} first>
            <Phrase parts={expectedPhrase(words, mark)} fill={fill} />
          </Row>
          {recited ? (
            <Row label={recitedLabel(mark)}>
              <Phrase parts={recited} fill={fill} />
            </Row>
          ) : null}
          {slip ? (
            <Text style={[typeV2.meta, styles.slip, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="mark-card-slip">
              {slip}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

/**
 * Tapping a mark (Check): a card under the word's line (over it near the bottom), like the held verse's menu: a view
 * in the screen, nothing dimmed, any touch outside closes it. Every mark on the word, each with Not a mistake; then
 * Hear it (the reciter's ayah) and Similar phrases when another ayah reads almost the same.
 */
export function MarkCard({
  marks,
  words,
  anchor,
  onDismiss,
  onHear,
  onYours,
  onSimilar,
  hasSimilar,
  onClose,
}: {
  marks: Mark[];
  words: QuranWords;
  /** The word's box on screen (window coordinates). */
  anchor: Box | null;
  onDismiss: (id: string) => void;
  onHear: (mark: Mark) => void;
  /** Your recitation: the reciter's own voice at the mark; absent when the take's audio for it isn't on the phone. */
  onYours?: (mark: Mark) => void;
  onSimilar: (mark: Mark) => void;
  hasSimilar: boolean;
  onClose: () => void;
}) {
  const { palette, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const visible = marks.length > 0 && anchor != null;
  const top = useMemo(() => {
    if (!frame || !size || !anchor) return null;
    const p = placeMenu({
      menu: size,
      verse: anchor,
      point: { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 },
      screen: frame,
      insets: { top: insets.top, bottom: insets.bottom + 120, left: 0, right: 0 },
    });
    return p.top;
  }, [frame, size, anchor, insets]);
  if (!visible) return null;
  const main = marks[0];
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e: LayoutChangeEvent) => setFrame({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
      testID="mark-card-layer"
    >
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onClose}
        accessible={false}
        testID="mark-card-backdrop"
      />
      <View
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (!size || size.width !== width || size.height !== height) setSize({ width, height });
        }}
        style={[
          styles.card,
          {
            top: top ?? 0,
            opacity: top == null ? 0 : 1,
            backgroundColor: palette.sheet,
            borderColor: palette.outline,
            shadowColor: palette.shadow,
            shadowOpacity: isDark ? 0 : 0.14,
          },
        ]}
        testID="mark-card"
      >
        {marks.map((m, i) => (
          <MarkBlock key={m.id} mark={m} words={words} onDismiss={onDismiss} first={i === 0} />
        ))}
        <View style={styles.actions}>
          <SmallPill icon="volume-high-outline" label={t('reciteLive.card.hear')} onPress={() => onHear(main)} testID="mark-card-hear" />
          {onYours ? (
            <SmallPill icon="person-outline" label={t('reciteLive.card.yours')} onPress={() => onYours(main)} testID="mark-card-yours" />
          ) : null}
          {hasSimilar ? (
            <SmallPill icon="git-compare-outline" label={t('reciteLive.card.similar')} onPress={() => onSimilar(main)} testID="mark-card-similar" />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: CARD_MARGIN,
    right: CARD_MARGIN,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 8,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 14,
  },
  block: { paddingTop: 2, paddingBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  /** A flat swatch of the mark's colour beside its name (never a round mark). */
  swatch: { width: 12, height: 12, borderRadius: 3 },
  arWrap: { borderRadius: 7, paddingHorizontal: 6 },
  rowBody: { flex: 1, minWidth: 0 },
  slip: { marginTop: 4 },
  tajweed: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
});
