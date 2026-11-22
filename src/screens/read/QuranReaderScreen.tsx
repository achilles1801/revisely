import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useIsFocused, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MushafPager, MushafPagerHandle } from '../../components/MushafPager';
import { MushafScrubber } from '../../components/MushafScrubber';
import { useVerseActions } from '../../components/verse/useVerseActions';
import { RecordingSavedToast, SavedRecording } from '../../components/recordings/RecordingSavedToast';
import { HELP_ICON, HelpButton } from '../../components/help/HelpButton';
import { HelpToast } from '../../components/help/HelpToast';
import { RecordButton, recorderTakesCapsule } from '../../components/recordings/RecordButton';
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
import { firstSurahOnPage, toAyahRef } from '../../lib/verses';
import { ayahKey, ayahOf, ayahsBetween, suraOf } from '../../lib/ayahKeys';
import { AyahRef, ayahRects } from '../../lib/ayahBounds';
import { useMushafEdition } from '../../lib/mushafEdition';
import { SavedSitting, SittingEnded, sittingSavedText, sittingsEnabled } from '../../lib/sitting';
import { SittingSavedToast } from '../../components/timer/SittingSavedToast';
import type { ReadStackParamList } from '../../navigation/MainNavigator';
import { useReciteLayer } from '../../components/reciteLive/useReciteLayer';
import { t } from '../../i18n';
import { backIcon } from '../../i18n/direction';

type NavigationProp = NativeStackNavigationProp<ReadStackParamList, 'QuranReader'>;
type RouteProps = RouteProp<ReadStackParamList, 'QuranReader'>;

const ALL_PAGES: number[] = Array.from({ length: 604 }, (_, i) => i + 1);
const SETTLE_DEBOUNCE_MS = 1500;
// Under the page, with the controls: the position track, then the capsule.
const SCRUBBER_HEIGHT = 32;
const FOOTER_HEIGHT = SCRUBBER_HEIGHT + spacing.xs + CAPSULE_HEIGHT + spacing.sm;
/** A search match highlights at most this many verses (24 words said reach about ten short ones). */
const MAX_SEARCH_HIGHLIGHT = 12;

/** The verses a search highlight names ("first-last", as ayah keys; last may be empty). */
function searchHighlightOf(key: string | null): AyahRef[] | null {
  if (!key) return null;
  const [from, to] = key.split('-').map((k) => (k ? Number(k) : NaN));
  const keys = Number.isFinite(to) && to > from ? ayahsBetween(from, to).slice(0, MAX_SEARCH_HIGHLIGHT) : [from];
  return keys.map((k) => toAyahRef({ sura: suraOf(k), ayah: ayahOf(k) }));
}

export default function QuranReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { isDark, palette: v2 } = useTheme();
  const palette = getReadPalette(isDark);
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const initialPage = route.params.pageNumber;
  const [currentPage, setCurrentPage] = useState(initialPage);

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pagerRef = useRef<MushafPagerHandle>(null);
  const { timer, notePage } = useReadingTimer();
  // Hold a verse: highlight, Play (Husary), Translation. Recitation turns pages.
  // Record yourself reading; saved under today's (revision day's) reading.
  const { user, pages } = useApp();
  const { day: today } = useRevisionDay(user);
  // After ending a recording: "Recording saved · Undo · View" (View opens it in Activity).
  const [savedRecording, setSavedRecording] = useState<SavedRecording | null>(null);
  // A sitting (REC-1): ending the timer ends a recording running with it, and one note says what
  // was saved ("Saved to today: Al-Mulk, ayahs 1–26, 41 min · Undo · View").
  const sittings = sittingsEnabled(user);
  const endingSitting = useRef(false);
  const [sittingSaved, setSittingSaved] = useState<SavedSitting | null>(null);
  // The recording that ended with the sitting, for its note's Undo (its upload waits meanwhile).
  const sittingRecording = useRef<SavedSitting['recording']>(null);
  const recorder = useVoiceRecorder({
    kind: 'reading',
    day: today,
    currentPage,
    // Ended with the timer, the recording is told about in the sitting's note, not its own.
    onFinished: (info) => {
      if (!endingSitting.current) setSavedRecording(info);
      // Its note is the sitting's, whose Undo takes it back too.
      else sittingRecording.current = { recordingId: info.recordingId, undo: info.undo };
    },
  });
  const recordingOn = recorder.phase === 'recording' || recorder.phase === 'paused';
  const endRecordingWithTimer = useCallback(async () => {
    endingSitting.current = true;
    sittingRecording.current = null;
    try {
      await recorder.finish();
    } finally {
      endingSitting.current = false;
    }
  }, [recorder]);
  const onSittingSaved = useCallback(
    (day: string, seconds: number, ended: SittingEnded) => {
      setSavedRecording(null);
      const recording = sittingRecording.current;
      sittingRecording.current = null;
      setSittingSaved({
        day,
        text: sittingSavedText({ day, today: today ?? day, pages: ended.pages, seconds }),
        sessionId: ended.sessionId ?? null,
        recording,
      });
    },
    [today],
  );

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
    focused: isScreenFocused,
  });

  // A verse found by search (testers), or the verses a match runs across: highlighted,
  // until the reader turns to a page none of them is on. A held or playing verse shows
  // instead while there is one.
  const highlightParam = route.params.highlight;
  const highlightKey = highlightParam
    ? `${ayahKey(highlightParam.sura, highlightParam.ayah)}-${highlightParam.last ? ayahKey(highlightParam.last.sura, highlightParam.last.ayah) : ''}`
    : null;
  const [searchHighlight, setSearchHighlight] = useState<AyahRef[] | null>(() => searchHighlightOf(highlightKey));
  useEffect(() => {
    if (highlightKey) setSearchHighlight(searchHighlightOf(highlightKey));
  }, [highlightKey]);
  useEffect(() => {
    if (!searchHighlight || searchHighlight.some((h) => h.page === currentPage)) return;
    if (searchHighlight.every((h) => ayahRects(currentPage, h.sura, h.ayah).length === 0)) setSearchHighlight(null);
  }, [currentPage, searchHighlight]);
  // An ayah a take slipped into (the summary's "You continued with …"): highlighted once its page is shown, since the
  // highlight above goes as soon as the page shown has none of it.
  const [intoTarget, setIntoTarget] = useState<AyahRef | null>(null);
  useEffect(() => {
    if (!intoTarget || intoTarget.page !== currentPage) return;
    setSearchHighlight([intoTarget]);
    setIntoTarget(null);
  }, [intoTarget, currentPage]);

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
  // The surah at the top of the page drawn (the 1441 print's can differ; lib/mushafEdition).
  const edition = useMushafEdition();
  const firstSurah = useMemo(() => firstSurahOnPage(currentPage, edition), [currentPage, edition]);

  // ===== The one mic: Record, Recite, Check (Revisely Dev, testers, the 1405 print): components/reciteLive/useReciteLayer =====
  const recite = useReciteLayer({
    currentPage,
    showPage: (page: number) => pagerRef.current?.scrollToPage(page) ?? false,
    // A similar ayah opens in a reader of its own over this one, so Back comes back to this page as it was (READ-2).
    openElsewhere: ({ page, highlight, showTake }) => navigation.push('QuranReader', { pageNumber: page, highlight, showTake }),
    day: today ?? null,
    focused: isScreenFocused,
    recorder,
    chromeVisible: chrome.visible,
    onTapPage,
    dismissHint,
    // That ayah, highlighted as a search result is, until the page is turned (once its page is the one shown).
    onInto: setIntoTarget,
    showTake: route.params.showTake ?? null,
    onShowTakeEnd: () => (navigation as { setParams?: (p: Record<string, unknown>) => void }).setParams?.({ showTake: undefined }),
  });

  // Previous / next go when the capsule is crowded (a recording, a timer) on
  // anything narrower than the largest phones.
  const crowded = recorder.phase !== 'idle' || timer != null;
  // Recording: the recorder is the whole capsule, the timer beside it (compact).
  const recordingLive = recorderTakesCapsule(recorder);
  const compact = (width < 430 && crowded) || (recordingLive && timer != null);

  return (
    <View style={styles.container}>
      <ReaderFrame
        chromeVisible={recite.chromeVisible}
        keepStatusBar={recite.keepStatusBar}
        active={isScreenFocused}
        onBackgroundPress={recite.onTap}
        background={palette.pageBg}
        isDark={isDark}
        quietHeader={
          <View style={styles.quietHeader}>
            <Text style={styles.quietText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {t('common.juzN', { n: juz })}
            </Text>
            <SurahName surah={firstSurah} palette={palette} quiet />
          </View>
        }
        header={
          <View style={styles.header}>
            <RoundButton icon={backIcon()} label={t('common.back')} onPress={() => navigation.goBack()} palette={palette} testID="reader-back" />
            <View style={styles.titleCol}>
              <SurahName surah={firstSurah} palette={palette} />
              <Text style={styles.subtitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {t('read.reader.subtitle', { page: currentPage, juz, hizb })}
              </Text>
            </View>
            {/* Its help (HELP-1), a round button like Back; hidden, the same room keeps the title centred. */}
            <HelpButton
              // While a take is open: how Recite works (Revisely Dev); otherwise the reader's own help.
              screen={recite.active ? 'recite' : 'reader'}
              liveRecite={recite.liveOn}
              hideAs="reader"
              render={(open, label) => (
                <RoundButton icon={HELP_ICON} label={label} onPress={open} palette={palette} testID="help-button-reader" />
              )}
              placeholder={<View style={{ width: ROUND_BUTTON_SIZE }} />}
            />
          </View>
        }
        footer={
          <View style={styles.footer}>
            {recite.bar ?? (
              <>
                <MushafScrubber page={currentPage} onJump={handleJump} palette={palette} />
                <PlayerCapsule
                  player={verseActions.player}
                  page={currentPage}
                  compact={compact}
                  surface={{ background: palette.control, border: palette.divider }}
                  recording={recordingLive}
                  record={recite.controls ?? <RecordButton recorder={recorder} crowded={timer != null} />}
                  timer={
                    <TimerChip
                      compact={compact}
                      onSaved={sittings ? onSittingSaved : undefined}
                      beforeEnd={sittings && recordingOn ? endRecordingWithTimer : undefined}
                    />
                  }
                />
              </>
            )}
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
              {t('read.reader.tapHint')}
            </Text>
          ) : null
        }
        activity={
          recite.activity ?? <ReaderActivity recorder={recorder} playback={verseActions.player.state} onPress={chrome.show} />
        }
      >
        <MushafPager
          ref={pagerRef}
          pages={ALL_PAGES}
          initialPage={initialPage}
          onPageChange={handlePageChange}
          onLongPressAyah={verseActions.onLongPressAyah}
          // While a take runs the page shows only Recite's own colours: the search's highlight waits until it's done
          // (after it, an ayah the take slipped into is highlighted the same way).
          highlightedAyah={
            verseActions.highlightedAyah ??
            (recite.busy ? null : searchHighlight)
          }
          onTap={recite.onTap}
          onUserSwipe={chrome.hide}
          pageUnderlay={recite.pager.pageUnderlay}
          pageOverlay={recite.pager.pageOverlay}
          pageAccessories={recite.pager.pageAccessories}
          onTapPoint={recite.pager.onTapPoint}
          extraData={recite.pager.extraData}
        />
      </ReaderFrame>

      <RecordingSavedToast
        saved={savedRecording}
        onClose={() => setSavedRecording(null)}
        quiet={recite.micOn}
        // At the bottom of the room under the page, never over the text.
        bottomInset={insets.bottom - spacing.sm}
      />

      <SittingSavedToast saved={sittingSaved} onClose={() => setSittingSaved(null)} bottomInset={insets.bottom - spacing.sm} />

      <HelpToast screen="reader" bottomInset={insets.bottom - spacing.sm} />
      {verseActions.overlay}
      {recite.sheets}
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
