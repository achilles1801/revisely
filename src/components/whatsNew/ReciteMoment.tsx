// What's new 1.0.5, card 1 as a moment (the orchestrator's yes, Nov 17 2026; lib/whatsNew/reciteMoment is its clock). A
// take on Al-Mulk 1–2 plays by itself in about 8 s: the reader listens, the page follows the reciter word by word (the
// grey band on the line, the box on the word), three marks land as their words are passed, in their own colours, and
// the score falls by what counts. Then the card's words and Next. Skip, in the top corner, goes to the end; a touch
// anywhere else does nothing (Majd, Nov 9 2026, of Revo's moment). Drawn with the pictures' own pieces (TakeLines,
// ReciteBar), marked Example, with no account's numbers. Reduce Motion and VoiceOver: the end at once.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { typeV2 } from '../../theme/v2';
import { getReadPalette } from '../../theme/readPalette';
import { Tap } from '../v2/Tap';
import { PillButton } from '../v2/PillButton';
import { ReciteBar } from '../reciteLive/ReciteBar';
import { scoreLevel } from '../../lib/reciteLive/score';
import { momentAt, momentLength } from '../../lib/whatsNew/reciteMoment';
import { demoMarks, TAKE, TakeLines, textOf } from './pictures';
import { t } from '../../i18n';

const TICK_MS = 80;
const noop = () => undefined;

export function ReciteMoment({
  step,
  total,
  title,
  words,
  closable,
  onNext,
  onClose,
}: {
  step: number;
  total: number;
  title: string;
  /** The card's words, drawn as every card's are (WhatsNewScreen's CardText). */
  words: React.ReactNode;
  closable: boolean;
  onNext: () => void;
  onClose?: () => void;
}) {
  const { palette, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const read = getReadPalette(isDark);
  const reduceMotion = useReduceMotion();
  const [screenReader, setScreenReader] = useState(false);
  const take = useMemo(() => ({ order: TAKE.lines.flat().map((x) => x.w), marks: demoMarks() }), []);
  const length = momentLength(take);
  const [at, setAt] = useState(0);
  const straightToEnd = reduceMotion || screenReader;
  // The clock while it plays. Skip stops it: a tick after Skip would set the moment back to the time played, so it
  // would carry on from there, the end shown for a tick at most (Nov 18 2026).
  const clock = useRef<ReturnType<typeof setInterval> | null>(null);
  const toEnd = () => {
    if (clock.current) clearInterval(clock.current);
    clock.current = null;
    setAt(length);
  };

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled()
      .then(setScreenReader)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (straightToEnd) {
      setAt(length);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      const now = Date.now() - started;
      setAt(now);
      if (now >= length) clearInterval(timer);
    }, TICK_MS);
    clock.current = timer;
    return () => {
      clearInterval(timer);
      clock.current = null;
    };
  }, [straightToEnd, length]);

  const frame = momentAt(at, take);
  const barWords =
    frame.cursor == null
      ? []
      : [
          ...(frame.cursor - 1 >= take.order[0] ? [{ w: frame.cursor - 1, text: textOf(frame.cursor - 1), tone: 'said' as const }] : []),
          { w: frame.cursor, text: textOf(frame.cursor), tone: 'current' as const },
        ];

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]} testID="recite-moment">
      <View style={styles.top}>
        <View style={styles.side}>
          {closable ? (
            <Tap onPress={() => onClose?.()} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={12} testID="whats-new-close">
              <Ionicons name="close" size={26} color={palette.text} />
            </Tap>
          ) : null}
        </View>
        <Text style={[typeV2.barTitle, styles.center, { color: palette.text }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
          {t('whatsNew.title')}
        </Text>
        <View style={[styles.side, styles.right]}>
          {!frame.ended ? (
            <Tap onPress={toEnd} accessibilityRole="button" hitSlop={12} testID="recite-moment-skip">
              <Text style={[typeV2.name, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
                {t('whatsNew.reciteMoment.skip')}
              </Text>
            </Tap>
          ) : null}
        </View>
      </View>

      {/* The take: decoration for VoiceOver (the card's words say it), never touched. */}
      <View style={styles.stage} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[typeV2.meta, styles.middle, { color: palette.secondary }]} maxFontSizeMultiplier={1}>
          {t('whatsNew.reciteMoment.example')}
        </Text>
        <TakeLines live past={false} cursor={frame.cursor} marks={frame.marks} />
        <View style={styles.bar}>
          <ReciteBar
            hidden={false}
            onToggleHidden={noop}
            onNextWord={noop}
            onWholeAyah={noop}
            score={frame.cursor == null ? null : { text: `${frame.score}%`, level: scoreLevel(frame.score / 100) }}
            seconds={Math.floor(at / 1000)}
            recording={false}
            words={barWords}
            status={t('whatsNew.reciteMoment.listening')}
            phase="live"
            onStop={noop}
            onClose={noop}
            surface={{ background: read.control, border: read.divider }}
          />
        </View>
        {!frame.ended ? (
          <Text style={[typeV2.body, styles.middle, styles.caption, { color: palette.text }]} maxFontSizeMultiplier={1.4} testID="recite-moment-caption">
            {t(`whatsNew.reciteMoment.${frame.caption}`)}
          </Text>
        ) : null}
      </View>

      {frame.ended ? (
        <View style={styles.words}>
          <Text
            style={[typeV2.largeTitle, styles.middle, { color: palette.text }]}
            accessibilityRole="header"
            accessibilityLabel={t('whatsNew.step', { step, total, title })}
            maxFontSizeMultiplier={1.6}
            testID="whats-new-title"
          >
            {title}
          </Text>
          {words}
          <PillButton title={t('whatsNew.next')} size="lg" onPress={onNext} testID="whats-new-next" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  side: { width: 64 },
  right: { alignItems: 'flex-end' },
  /** The top bar's title: it takes the room between the corners. */
  center: { flex: 1, textAlign: 'center' },
  /** Centred text in the column (no flex: a column item with flex and no height collapses to nothing). */
  middle: { textAlign: 'center' },
  stage: { flex: 1, justifyContent: 'center', gap: 14 },
  bar: { marginTop: 4 },
  caption: { marginTop: 6 },
  words: { gap: 12, paddingTop: 8 },
});
