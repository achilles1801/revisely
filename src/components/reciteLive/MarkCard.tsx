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
import { severityOf } from '../../lib/reciteLive/contract';
import {
  expectedPhrase,
  markPlace,
  markTitle,
  PhrasePart,
  recitedLabel,
  recitedPhrase,
  slipLine,
  tajweedLines,
} from '../../lib/reciteLive/describe';

const CARD_MARGIN = 12;

/** An Arabic phrase with the mark's word coloured (expected in green, recited in its mark's colour, a gap dotted). */
function Phrase({ parts, color }: { parts: PhrasePart[]; color: string }) {
  const { palette } = useTheme();
  return (
    <Text style={[arabicV2(21), styles.ar, { color: palette.text }]} maxFontSizeMultiplier={1.6}>
      {parts.map((p, i) => (
        <Text key={i}>
          {i > 0 ? ' ' : ''}
          {p.role === 'gap' ? (
            <Text style={{ color, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}>{'  '}</Text>
          ) : (
            <Text
              style={
                p.role === 'expected'
                  ? { color: palette.good }
                  : p.role === 'recited'
                    ? { color, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }
                    : undefined
              }
            >
              {p.text}
            </Text>
          )}
        </Text>
      ))}
    </Text>
  );
}

function Row({ label, children, first }: { label: string; children: React.ReactNode; first?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]}>
      <Text style={[typeV2.meta, styles.label, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

function SmallPill({ icon, label, onPress, testID }: { icon?: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      hitSlop={4}
      style={[styles.pill, { borderColor: palette.outline }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      {icon ? <Ionicons name={icon} size={15} color={palette.text} /> : null}
      <Text style={[styles.pillText, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Tap>
  );
}

/** One mark's part of the card: what it is, where, Expected and Recited (or the tajweed note), and its actions. */
function MarkBlock({
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
  const color = severityOf(mark) === 'mistake' ? palette.red : palette.warn;
  const recited = recitedPhrase(words, mark);
  const slip = slipLine(mark);
  return (
    <View style={[styles.block, !first && { borderTopColor: palette.separator, borderTopWidth: layoutV2.hairline }]} testID={`mark-card-${mark.kind}`}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <View style={styles.titleRow}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
              {markTitle(mark)}
            </Text>
          </View>
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
            {markPlace(mark)}
          </Text>
        </View>
        <SmallPill label="Not a mistake" onPress={() => onDismiss(mark.id)} testID="mark-card-dismiss" />
      </View>
      {mark.kind === 'tajweed' ? (
        <View style={styles.tajweed}>
          <View style={styles.rowBody}>
            <Text style={[typeV2.body, { color: palette.text }]}>{tajweedLines(mark).main}</Text>
            {tajweedLines(mark).sub ? (
              <Text style={[typeV2.meta, { color: palette.secondary }]}>{tajweedLines(mark).sub}</Text>
            ) : null}
          </View>
          <Text style={[arabicV2(24), { color }]} maxFontSizeMultiplier={1.6}>
            {words.uthmani(mark.w)}
          </Text>
        </View>
      ) : (
        <View>
          <Row label="Expected" first>
            <Phrase parts={expectedPhrase(words, mark)} color={color} />
          </Row>
          {recited ? (
            <Row label={recitedLabel(mark)}>
              <Phrase parts={recited} color={color} />
            </Row>
          ) : null}
          {slip ? (
            <Text style={[typeV2.meta, styles.slip, { color: palette.secondary }]} testID="mark-card-slip">
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
          <SmallPill icon="volume-high-outline" label="Hear it" onPress={() => onHear(main)} testID="mark-card-hear" />
          {hasSimilar ? (
            <SmallPill icon="git-compare-outline" label="Similar phrases" onPress={() => onSimilar(main)} testID="mark-card-similar" />
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
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, marginTop: 6 },
  label: { width: 66 },
  rowBody: { flex: 1, minWidth: 0 },
  ar: { writingDirection: 'rtl', textAlign: 'right' },
  slip: { marginTop: 4 },
  tajweed: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  pillText: { fontSize: 14, fontWeight: '600' },
});
