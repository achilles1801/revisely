import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { Box, placeMenu } from '../verse/menuPlacement';
import type { QuranWords } from '../../lib/recite/quranWords';
import { markGroup } from '../../lib/reciteLive/contract';
import { expectedPhrase, markPlace, markTitle, tajweedLines } from '../../lib/reciteLive/describe';
import type { Attempt, WordMemory } from '../../lib/reciteMemory/memory';
import { CLEAR_AFTER } from '../../lib/reciteMemory/memory';
import { attemptWhat, clearLine, takeWhen, wrongCount } from '../../lib/reciteMemory/describe';
import { markFill } from '../reciteLive/markColours';
import { Phrase, Row, SmallPill } from '../reciteLive/MarkParts';
import { WordChip } from '../reciteLive/WordChip';
import { t } from '../../i18n';
import { chevron } from '../../i18n/direction';

const CARD_MARGIN = 12;
/** The latest tries the card lists (newest first). */
export const CARD_TRIES = 4;

/** One try: when, right or what went wrong (the word said on its highlight), and ▶ your own voice there. */
function TryRow({ attempt, now, fill, onPlay }: { attempt: Attempt; now: number; fill: string; onPlay?: () => void }) {
  const { palette } = useTheme();
  const what = attemptWhat(attempt);
  const when = takeWhen(attempt.take.createdAt, now);
  return (
    <View style={[styles.try, { borderTopColor: palette.separator }]} testID={what.right ? 'past-try-right' : 'past-try-wrong'}>
      <View style={styles.tryWhen}>
        <Text style={[typeV2.body, { color: palette.text }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
          {when}
        </Text>
        {attempt.take.hidden ? (
          <Ionicons name="eye-off-outline" size={14} color={palette.secondary} accessibilityLabel={t('reciteMemory.passage.pageHidden')} />
        ) : null}
      </View>
      <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
        {what.text}
      </Text>
      {what.heard ? <WordChip text={what.heard} fill={fill} maxScale={1.5} testID="past-try-heard" /> : null}
      {onPlay ? (
        <Tap
          onPress={onPlay}
          hitSlop={6}
          style={[styles.play, { borderColor: palette.outline }]}
          accessibilityRole="button"
          accessibilityLabel={t('reciteMemory.card.yours', { when })}
          testID="past-try-play"
        >
          <Ionicons name="play" size={12} color={palette.text} style={styles.playIcon} />
        </Tap>
      ) : (
        <View style={styles.playSpace} />
      )}
    </View>
  );
}

/**
 * A word with a remembered mistake, tapped outside a take: its history, in the mark card's style (a view in the screen
 * under the word's line, nothing dimmed, any touch outside closes it). The kind in words with its place and how often it
 * went wrong, Clear now, what was expected, the latest tries (each with ▶ your own voice from that take's recording,
 * when it's on the phone), where the clear rule stands, then Hear it (Al-Husary's ayah) and Similar phrases.
 */
export function WordHistoryCard({
  memory,
  words,
  anchor,
  now,
  today,
  canPlay,
  onPlay,
  onClear,
  onHear,
  onSimilar,
  hasSimilar,
  onSeeAll,
  onClose,
}: {
  memory: WordMemory | null;
  words: QuranWords;
  anchor: Box | null;
  now: number;
  /** The revision day (for "Right today"). */
  today: string | null;
  canPlay: (a: Attempt) => boolean;
  onPlay: (a: Attempt) => void;
  onClear: (memory: WordMemory) => void;
  onHear: (memory: WordMemory) => void;
  onSimilar: (memory: WordMemory) => void;
  hasSimilar: boolean;
  /** Every take of the passage: its progress sheet. */
  onSeeAll?: (memory: WordMemory) => void;
  onClose: () => void;
}) {
  const { palette, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const mark = memory?.lastMark ?? null;
  const visible = memory != null && mark != null && anchor != null;
  const top = useMemo(() => {
    if (!frame || !size || !anchor) return null;
    return placeMenu({
      menu: size,
      verse: anchor,
      point: { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 },
      screen: frame,
      insets: { top: insets.top, bottom: insets.bottom + 120, left: 0, right: 0 },
    }).top;
  }, [frame, size, anchor, insets]);
  if (!visible || !memory || !mark) return null;
  const fill = markFill(palette, mark);
  const tries = memory.attempts.slice(-CARD_TRIES).reverse();
  const filled = memory.open ? CLEAR_AFTER - memory.needed : CLEAR_AFTER;
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e: LayoutChangeEvent) => setFrame({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
      testID="past-card-layer"
    >
      <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onResponderGrant={onClose} accessible={false} />
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
        testID="past-card"
      >
        <View style={styles.head}>
          <View style={styles.headText}>
            <View style={styles.titleRow}>
              <View style={[styles.swatch, { backgroundColor: fill }]} testID={`past-card-swatch-${markGroup(mark)}`} />
              <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                {markTitle(mark)}
              </Text>
            </View>
            <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.3} testID="past-card-place">
              {`${markPlace({ ...mark, sure: 'clear' })} · ${wrongCount(memory)}`}
            </Text>
          </View>
          {memory.open ? <SmallPill label={t('reciteMemory.card.clearNow')} onPress={() => onClear(memory)} testID="past-card-clear" /> : null}
        </View>
        {mark.kind === 'tajweed' ? (
          <Text style={[typeV2.body, styles.tajweed, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
            {[tajweedLines(mark).main, tajweedLines(mark).sub].filter(Boolean).join(' · ')}
          </Text>
        ) : (
          <Row label={t('reciteLive.card.expected')} first>
            <Phrase parts={expectedPhrase(words, mark)} fill={fill} />
          </Row>
        )}
        <View style={styles.triesHead}>
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
            {t('reciteMemory.card.takes')}
          </Text>
          {onSeeAll ? (
            <Tap onPress={() => onSeeAll(memory)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('reciteMemory.card.seeAllLabel')} testID="past-card-see-all">
              <Text style={[typeV2.meta, styles.seeAll, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
                {`${t('reciteMemory.card.seeAll')} ${chevron()}`}
              </Text>
            </Tap>
          ) : null}
        </View>
        {tries.map((a) => (
          <TryRow key={a.take.id} attempt={a} now={now} fill={fill} onPlay={canPlay(a) ? () => onPlay(a) : undefined} />
        ))}
        <View style={[styles.rule, { backgroundColor: palette.fill }]} accessible testID="past-card-rule">
          <View style={styles.bars} importantForAccessibility="no-hide-descendants">
            {Array.from({ length: CLEAR_AFTER }, (_, i) => (
              <View key={i} style={[styles.bar, { backgroundColor: i < filled ? palette.text : palette.outline }]} />
            ))}
          </View>
          <Text style={[typeV2.meta, styles.ruleText, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
            {clearLine(memory, today)}
          </Text>
        </View>
        <View style={styles.actions}>
          <SmallPill icon="volume-high-outline" label={t('reciteLive.card.hear')} onPress={() => onHear(memory)} testID="past-card-hear" />
          {hasSimilar ? <SmallPill icon="git-compare-outline" label={t('reciteLive.card.similar')} onPress={() => onSimilar(memory)} testID="past-card-similar" /> : null}
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
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  tajweed: { marginTop: 8 },
  triesHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 2 },
  seeAll: { fontWeight: '600' },
  try: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, borderTopWidth: layoutV2.hairline },
  tryWhen: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  play: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  playIcon: { marginLeft: 2 },
  playSpace: { width: 34 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, marginTop: 8 },
  bars: { flexDirection: 'row', gap: 3 },
  bar: { width: 18, height: 5, borderRadius: 3 },
  ruleText: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
});
