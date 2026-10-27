import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useIsFocused, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MushafPager, MushafPagerHandle } from '../../components/MushafPager';
import { MushafScrubber } from '../../components/MushafScrubber';
import { useVerseActions } from '../../components/verse/useVerseActions';
import { navigateToActivityDay } from '../../navigation/navigationRef';
import { UndoToast } from '../../components/revision/UndoToast';
import { RecordButton } from '../../components/recordings/RecordButton';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useKeepScreenOn } from '../../hooks/useKeepScreenOn';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { useApp } from '../../context/AppContext';
import { TimerChip } from '../../components/timer/TimerChip';
import { ReaderFrame } from '../../components/reader/ReaderFrame';
import { ReaderActivity } from '../../components/reader/ReaderActivity';
import { CAPSULE_HEIGHT, PlayerCapsule } from '../../components/reader/PlayerCapsule';
import { useReaderChrome } from '../../components/reader/useReaderChrome';
import { useTapHint } from '../../components/reader/useTapHint';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUND_BUTTON_SIZE, RoundButton } from '../../components/reader/RoundButton';
import { useReadingTimer } from '../../context/ReadingTimerContext';
import { useTheme } from '../../context/ThemeContext';
import { getReadPalette, ReadPalette } from '../../theme/readPalette';
import { typography, fonts } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import {
  getHizbForPage,
  getJuzForPage,
  getSurahsForPage,
} from '../../lib/quranData';
import { appendReadingHistory } from '../../lib/readingHistory';
import type { ReadStackParamList } from '../../navigation/MainNavigator';

type NavigationProp = NativeStackNavigationProp<ReadStackParamList, 'QuranReader'>;
type RouteProps = RouteProp<ReadStackParamList, 'QuranReader'>;

const ALL_PAGES: number[] = Array.from({ length: 604 }, (_, i) => i + 1);
const SETTLE_DEBOUNCE_MS = 1500;
// Under the page, with the controls: the position track, then the capsule.
const SCRUBBER_HEIGHT = 32;
const FOOTER_HEIGHT = SCRUBBER_HEIGHT + spacing.xs + CAPSULE_HEIGHT + spacing.sm;

export default function QuranReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { isDark } = useTheme();
  const palette = getReadPalette(isDark);
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const initialPage = route.params.pageNumber;
  const [currentPage, setCurrentPage] = useState(initialPage);

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pagerRef = useRef<MushafPagerHandle>(null);
  const { timer, notePage } = useReadingTimer();
  // Hold a verse: highlight, Play (Husary), Translation. Recitation turns pages.
  // Record yourself reading; saved under today's (revision day's) reading.
  const { user } = useApp();
  const { day: today } = useRevisionDay(user);
  // After ending a recording: "Recording saved · View" (opens it in Activity).
  const [savedRecording, setSavedRecording] = useState<{ day: string; recordingId: string } | null>(
    null,
  );
  const recorder = useVoiceRecorder({
    kind: 'reading',
    day: today,
    currentPage,
    onFinished: setSavedRecording,
  });

  // Opened again with another page while already open (e.g. the Friday
  // Al-Kahf card): the stack updates this screen's params instead of pushing.
  const requestedPage = route.params.pageNumber;
  const lastRequestedRef = useRef(requestedPage);
  useEffect(() => {
    if (requestedPage === lastRequestedRef.current) return;
    lastRequestedRef.current = requestedPage;
    pagerRef.current?.scrollToPage(requestedPage);
  }, [requestedPage]);

  // Reading or revising without touching the screen: don't let it lock.
  const isScreenFocused = useIsFocused();
  useKeepScreenOn(isScreenFocused);

  const verseActions = useVerseActions({
    pages: ALL_PAGES,
    onShowPage: (page) => pagerRef.current?.scrollToPage(page),
    currentPage,
  });

  // Reading: nothing but the page (its number, the juz and surah). A tap on
  // the page brings the controls (they sit beside the page, never over it);
  // another tap, or turning the page, puts them away.
  const chrome = useReaderChrome();
  const tapHint = useTapHint();
  const dismissHint = tapHint.dismiss;
  const toggleChrome = chrome.toggle;
  const onTapPage = useCallback(() => {
    dismissHint();
    toggleChrome();
  }, [dismissHint, toggleChrome]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const handlePageChange = useCallback(
    (pageNumber: number) => {
      setCurrentPage(pageNumber);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        appendReadingHistory(pageNumber);
        notePage(pageNumber);
      }, SETTLE_DEBOUNCE_MS);
    },
    [notePage],
  );

  // The pager reports the jump through onPageChange, so history and the
  // timer's page credit work exactly as they do for a swipe.
  const handleJump = useCallback((pageNumber: number) => {
    pagerRef.current?.scrollToPage(pageNumber);
  }, []);

  // Credit the page the reader opened on (and the current page whenever a
  // session starts while reading).
  const timerRunning = timer?.runningSince != null;
  useEffect(() => {
    if (timerRunning) notePage(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  useEffect(() => {
    appendReadingHistory(initialPage);
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [initialPage]);

  const juz = getJuzForPage(currentPage);
  const hizb = getHizbForPage(currentPage);
  const firstSurah = getSurahsForPage(currentPage)[0];

  // Previous / next go when the capsule is crowded (a recording, a timer) on
  // anything narrower than the largest phones.
  const crowded = recorder.phase !== 'idle' || timer != null;
  const compact = width < 430 && crowded;

  return (
    <View style={styles.container}>
      <ReaderFrame
        chromeVisible={chrome.visible}
        active={isScreenFocused}
        onBackgroundPress={onTapPage}
        background={palette.pageBg}
        isDark={isDark}
        quietHeader={
          <View style={styles.quietHeader}>
            <Text style={styles.quietText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              Juz {juz}
            </Text>
            <SurahName surah={firstSurah} palette={palette} quiet />
          </View>
        }
        header={
          <View style={styles.header}>
            <RoundButton icon="chevron-back" label="Back" onPress={() => navigation.goBack()} palette={palette} />
            <View style={styles.titleCol}>
              <SurahName surah={firstSurah} palette={palette} />
              <Text style={styles.subtitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                Page {currentPage} · Juz {juz} · Hizb {hizb}
              </Text>
            </View>
            {/* Keeps the title centred. */}
            <View style={{ width: ROUND_BUTTON_SIZE }} />
          </View>
        }
        footer={
          <View style={styles.footer}>
            <MushafScrubber page={currentPage} onJump={handleJump} palette={palette} />
            <PlayerCapsule
              player={verseActions.player}
              page={currentPage}
              compact={compact}
              surface={{ background: palette.control, border: palette.divider }}
              record={<RecordButton recorder={recorder} />}
              timer={<TimerChip compact={compact} />}
            />
          </View>
        }
        footerHeight={FOOTER_HEIGHT}
        pageLabel={
          <Text style={styles.pageNum} maxFontSizeMultiplier={1.3}>
            {currentPage}
          </Text>
        }
        hint={
          tapHint.shown ? (
            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
              Tap the page for the controls
            </Text>
          ) : null
        }
        activity={
          <ReaderActivity recorder={recorder} playback={verseActions.player.state} onPress={chrome.show} />
        }
      >
        <MushafPager
          ref={pagerRef}
          pages={ALL_PAGES}
          initialPage={initialPage}
          onPageChange={handlePageChange}
          onLongPressAyah={verseActions.onLongPressAyah}
          highlightedAyah={verseActions.highlightedAyah}
          onTap={onTapPage}
          onUserSwipe={chrome.hide}
        />
      </ReaderFrame>

      <UndoToast
        visible={!!savedRecording}
        message="Recording saved"
        actionLabel="View"
        duration={6000}
        onUndo={() => {
          const saved = savedRecording;
          setSavedRecording(null);
          if (saved) navigateToActivityDay(saved.day, saved.recordingId);
        }}
        onDismiss={() => setSavedRecording(null)}
        // At the bottom of the room under the page, never over the text.
        bottomInset={insets.bottom - spacing.sm}
      />

      {verseActions.overlay}
    </View>
  );
}

/** The surah on the page: its name, and its name in Arabic. */
function SurahName({
  surah,
  palette,
  quiet,
}: {
  surah: ReturnType<typeof getSurahsForPage>[number] | undefined;
  palette: ReadPalette;
  quiet?: boolean;
}) {
  if (!surah) return null;
  const color = quiet ? palette.textSecondary : palette.textPrimary;
  return (
    <View style={surahStyles.row}>
      <Text
        style={[quiet ? surahStyles.quiet : surahStyles.title, { color }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {surah.name}
      </Text>
      {surah.nameArabic ? (
        <Text
          style={[surahStyles.arabic, { color, fontSize: quiet ? 13 : 16 }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {surah.nameArabic}
        </Text>
      ) : null}
    </View>
  );
}

const surahStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexShrink: 1 },
  title: { ...typography.titleSmall },
  quiet: { ...typography.caption },
  arabic: { fontFamily: fonts.arabic },
});

const makeStyles = (palette: ReadPalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.pageBg,
    },
    quietHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      gap: spacing.md,
    },
    quietText: {
      ...typography.caption,
      color: palette.textSecondary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      gap: spacing.sm,
    },
    titleCol: { flex: 1, alignItems: 'center' },
    subtitle: {
      ...typography.caption,
      color: palette.textSecondary,
    },
    footer: {
      flex: 1,
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.xs,
      justifyContent: 'flex-end',
    },
    hint: {
      ...typography.caption,
      color: palette.textSecondary,
    },
    pageNum: {
      textAlign: 'center',
      // Small, in the page's ink colour, like the printed mushaf's number.
      fontSize: 13,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
      color: palette.textPrimary,
    },
  });
