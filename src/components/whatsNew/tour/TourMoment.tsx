// What's new 1.0.6, the tour (lib/whatsNew/tour): one card, one slide that plays by itself. A screen of the app floats on
// the stage and what's new moves over it; at the slide's end the stage eases up and the card's words rise, with Next.
// Skip, in the top corner while it plays, jumps it to its words (the orchestrator's pick, Nov 26 2026); then Watch again
// takes its place. A touch anywhere else does nothing (Majd, Nov 9 2026, of Revo's moment). The walkthrough stays
// required as a whole (NEW-2). Reduce Motion and VoiceOver: the slide's end at once. Past 1.6× text WhatsNewScreen shows
// the card's words alone, as any card's.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { useApp } from '../../../context/AppContext';
import { useReduceMotion } from '../../../design/motion';
import { typeV2 } from '../../../theme/v2';
import { Tap } from '../../v2/Tap';
import { PillButton } from '../../v2/PillButton';
import { Stepper } from '../../Stepper';
import { useRevisionDay } from '../../../hooks/useRevisionDay';
import { generateDailyAssignment } from '../../../lib/algorithm';
import { getQuranData } from '../../../lib/quranData';
import { describePagesToRevise, plainText } from '../../../lib/passages';
import { partlyMemorizedAyahs } from '../../../lib/memorizedAyahs';
import { RAMADAN_INTRO_KEY } from '../../ramadan/introKey';
import { logger } from '../../../lib/logger';
import type { TourMoment as TourMomentId } from '../../../lib/help/whatsNew';
import { STAGE, TOUR_SECONDS, TOUR_SPEED, WORDS_IN, lerp } from '../../../lib/whatsNew/tour';
import { AGAIN_AFTER_MS } from '../../../lib/whatsNew/revoMoment';
import { t } from '../../../i18n';
import { AskSlide, BooksSlide, ScheduleSlide } from './revoSlides';
import { ActivitySlide, BadgesSlide, HomeSlide, RamadanSlide, ReciteUpSlide, SpotSlide } from './moreSlides';
import { OnStage, StageScale, type Clock } from './parts';

/** Al-Mulk's first page: the tour's page when the account has none due today. */
export const TOUR_FALLBACK_PAGE = 562;

/** The account's next page to revise today: slide 1 is about it. */
export function useTourPage(): { page: number; name: string } {
  const { user, pages } = useApp();
  const { date } = useRevisionDay(user);
  return useMemo(() => {
    let page = TOUR_FALLBACK_PAGE;
    try {
      if (user) page = generateDailyAssignment(pages, getQuranData(), user, date).pages[0] ?? TOUR_FALLBACK_PAGE;
    } catch (err) {
      logger.warn("What's new: no page for the tour", err);
    }
    // A partly memorized page by its memorized ayahs (MEM-4): only An-Nas memorized is "An-Nas", not its whole page.
    return { page, name: plainText(describePagesToRevise([page], partlyMemorizedAyahs(pages))) };
  }, [user, pages, date]);
}

function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled?.()
      .then((v) => {
        if (live) setOn(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', setOn);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return on;
}

/** The phone that saw the tour's Ramadan slide doesn't get the theme's own card too (THEME-7). */
function markRamadanCardSeen(): void {
  AsyncStorage.setItem(RAMADAN_INTRO_KEY, '1').catch(() => undefined);
}

/** A slide by its moment (exported for the tests). */
export function Slide({ moment, clock, page, pageName }: { moment: TourMomentId; clock: Clock; page: number; pageName: string }) {
  switch (moment) {
    case 'ask':
      return <AskSlide t={clock} page={page} pageName={pageName} />;
    case 'books':
      return <BooksSlide t={clock} />;
    case 'schedule':
      return <ScheduleSlide t={clock} />;
    case 'reciteUp':
      return <ReciteUpSlide t={clock} />;
    case 'spot':
      return <SpotSlide t={clock} />;
    case 'activityTab':
      return <ActivitySlide t={clock} />;
    case 'homeToday':
      return <HomeSlide t={clock} />;
    case 'badges':
      return <BadgesSlide t={clock} />;
    case 'ramadan':
      return <RamadanSlide t={clock} />;
  }
}

export function TourMoment({
  moment,
  step,
  total,
  title,
  words,
  last,
  closable,
  onNext,
  onClose,
}: {
  moment: TourMomentId;
  step: number;
  total: number;
  title: string;
  /** The card's words, drawn as every card's are (WhatsNewScreen's CardText). */
  words: React.ReactNode;
  /** The last card: Done instead of Next. */
  last: boolean;
  /** A ✕ (the replay in Settings). */
  closable: boolean;
  onNext: () => void;
  onClose?: () => void;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const reader = useScreenReader();
  const { page, name } = useTourPage();
  const seconds = TOUR_SECONDS[moment];
  const [run, setRun] = useState(0);
  const [ended, setEnded] = useState(false);
  const [againReady, setAgainReady] = useState(false);
  const [body, setBody] = useState<{ width: number; height: number } | null>(null);
  const [wordsHeight, setWordsHeight] = useState(0);
  const clock = useSharedValue(0);
  const end = useSharedValue(0);
  const straightToEnd = reduce || reader;

  useEffect(() => {
    cancelAnimation(clock);
    cancelAnimation(end);
    if (straightToEnd) {
      clock.value = seconds;
      end.value = 1;
      setEnded(true);
      return;
    }
    setEnded(false);
    end.value = 0;
    clock.value = 0;
    // The slide's own seconds, played at Revo's introduction's pace (TOUR_SPEED).
    clock.value = withTiming(seconds, { duration: (seconds * 1000) / TOUR_SPEED, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(setEnded)(true);
    });
    return () => cancelAnimation(clock);
  }, [straightToEnd, run, seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ended) {
      setAgainReady(false);
      return;
    }
    if (!straightToEnd) end.value = withTiming(1, { duration: WORDS_IN * 1000, easing: Easing.out(Easing.cubic) });
    if (moment === 'ramadan') markRamadanCardSeen();
    AccessibilityInfo.announceForAccessibility(t('whatsNew.step', { step, total, title }));
    const timer = setTimeout(() => setAgainReady(true), AGAIN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps

  // Skip: the slide's last frame, then its words.
  const skip = useCallback(() => {
    if (ended) return;
    cancelAnimation(clock);
    clock.value = seconds;
    setEnded(true);
  }, [ended, seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  // The stage: the design box scaled to the room, then eased up to leave the words theirs.
  const width = body?.width ?? 0;
  const height = body?.height ?? 0;
  const playScale = body ? Math.min(width / STAGE.width, height / STAGE.height) : 0;
  const endScale = body ? Math.max(0.3, Math.min(width / STAGE.width, (height - wordsHeight - 12) / STAGE.height)) : 0;
  // The stage only moves; its scale goes to each piece on it (StageScale): text drawn under two stacked scales blurs.
  const stageScale = useDerivedValue(() => lerp(playScale, endScale, end.value));
  const stage = useAnimatedStyle(() => {
    const s = stageScale.value;
    return {
      transform: [{ translateX: (width - STAGE.width) / 2 }, { translateY: -(STAGE.height * (1 - s)) / 2 + lerp((height - STAGE.height * playScale) / 2, 0, end.value) }],
    };
  });
  const wordsIn = useAnimatedStyle(() => ({ opacity: end.value, transform: [{ translateY: (1 - end.value) * 16 }] }));

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]} testID={`whats-new-tour-${moment}`}>
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
          {!ended ? (
            <Tap onPress={skip} accessibilityRole="button" hitSlop={12} testID="whats-new-tour-skip" style={[styles.skip, { backgroundColor: palette.fill }]}>
              <Text style={[typeV2.meta, styles.skipText, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                {t('whatsNew.tour.skip')}
              </Text>
            </Tap>
          ) : againReady && !straightToEnd ? (
            <Tap onPress={() => setRun((r) => r + 1)} accessibilityRole="button" hitSlop={12} testID="whats-new-tour-again" style={styles.again}>
              <Ionicons name="refresh" size={14} color={palette.secondary} />
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                {t('whatsNew.tour.again')}
              </Text>
            </Tap>
          ) : null}
        </View>
      </View>

      <View style={styles.body} onLayout={(e) => setBody({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {/* The slide: a picture for VoiceOver (the card's words say it), never touched. */}
        {body ? (
          <Animated.View
            style={[styles.stage, stage]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <StageScale.Provider value={stageScale}>
              <OnStage>
                <Text style={[typeV2.meta, styles.example, { color: palette.secondary }]} allowFontScaling={false}>
                  {t('whatsNew.tour.example')}
                </Text>
              </OnStage>
              <Slide key={run} moment={moment} clock={clock} page={page} pageName={name} />
            </StageScale.Provider>
          </Animated.View>
        ) : null}
        <Animated.View
          style={[styles.words, wordsIn]}
          pointerEvents={ended ? 'auto' : 'none'}
          onLayout={(e) => setWordsHeight(e.nativeEvent.layout.height)}
        >
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
          <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Stepper total={total} current={step} />
          </View>
          <PillButton
            title={last ? t('common.done') : t('whatsNew.next')}
            size="lg"
            onPress={onNext}
            disabled={!ended}
            testID={last ? 'whats-new-done' : 'whats-new-next'}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  side: { width: 112 },
  right: { alignItems: 'flex-end' },
  center: { flex: 1, textAlign: 'center' },
  middle: { textAlign: 'center' },
  skip: { height: 28, paddingHorizontal: 13, borderRadius: 14, justifyContent: 'center' },
  skipText: { fontWeight: '600' },
  again: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28 },
  body: { flex: 1, overflow: 'hidden' },
  stage: { position: 'absolute', left: 0, top: 0, width: STAGE.width, height: STAGE.height, direction: 'ltr' },
  example: { position: 'absolute', left: 0, right: 0, top: 0, textAlign: 'center' },
  words: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12, paddingTop: 8 },
  dots: { alignItems: 'center', marginTop: 4 },
});
