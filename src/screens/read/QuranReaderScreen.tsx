import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useIsFocused, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MushafPager, MushafPagerHandle } from '../../components/MushafPager';
import { MushafScrubber } from '../../components/MushafScrubber';
import { useVerseActions } from '../../components/verse/useVerseActions';
import { navigateToActivityDay } from '../../navigation/navigationRef';
import { UndoToast } from '../../components/revision/UndoToast';
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
import { sittingSavedText, sittingsEnabled } from '../../lib/sitting';
import type { ReadStackParamList } from '../../navigation/MainNavigator';
import { checkOwned, reciteLiveEnabled } from '../../lib/reciteLive/availability';
import { setReciteCheckSettings, useReciteCheckSettings } from '../../lib/reciteCheck/settings';
import { loadQuranWords, getQuranWords, QuranWords } from '../../lib/recite/quranWords';
import { furthestWord, marksOnPage } from '../../lib/reciteLive/state';
import {
  barWords,
  hiddenFollow,
  NOTHING_SHOWN,
  revealAyah,
  revealNextWord,
  Revealed,
  scorePill,
} from '../../lib/reciteLive/view';
import { LiveMode, useLiveRecitation } from '../../components/reciteLive/useLiveRecitation';
import { ReciteMic, ReciteMicMode } from '../../components/reciteLive/ReciteMic';
import { ReciteModeMenu } from '../../components/reciteLive/ReciteModeMenu';
import { BarButton, ReciteBar } from '../../components/reciteLive/ReciteBar';
import { LiveOverlay, LiveUnderlay } from '../../components/reciteLive/LivePageLayers';
import { ReciteNoticeSheet } from '../../components/reciteLive/ReciteNoticeSheet';
import { MarkCard } from '../../components/reciteLive/MarkCard';
import { SimilarPhrasesSheet } from '../../components/reciteLive/SimilarPhrasesSheet';
import { TakeSummarySheet } from '../../components/reciteLive/TakeSummarySheet';
import { CheckIntroPage } from '../../components/reciteLive/CheckIntroPage';
import { markAt, wordBox } from '../../lib/reciteLive/geometry';
import { similarPhrases } from '../../lib/reciteLive/similar';
import type { Mark } from '../../lib/reciteLive/contract';
import type { Box } from '../../components/verse/menuPlacement';
import { getRecitation } from '../../lib/recitation';
import { warmUpReciteCheck } from '../../lib/reciteCheck/service';
import type { LiveFailure } from '../../lib/reciteLive/contract';
import { logger } from '../../lib/logger';

/** What the recite bar says when a take ends without its answer. */
const LIVE_FAILURE: Record<LiveFailure, string> = {
  sign_in: 'Sign in again to recite',
  testers_only: 'For testers only',
  limit: 'That’s a lot for one hour',
  too_long: '15 minutes reached',
  idle: 'Stopped: nothing heard',
  bad_request: 'Couldn’t start',
  server: 'The checker stopped',
  offline: 'Couldn’t reach the checker',
};

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
  const { user } = useApp();
  const { day: today } = useRevisionDay(user);
  // After ending a recording: "Recording saved · View" (opens it in Activity).
  const [savedRecording, setSavedRecording] = useState<{ day: string; recordingId: string } | null>(
    null,
  );
  // A sitting (REC-1): ending the timer ends a recording running with it, and one note says what
  // was saved ("Saved to today: Al-Mulk, ayahs 1–26, 41 min · View").
  const sittings = sittingsEnabled(user);
  const endingSitting = useRef(false);
  const [sittingSaved, setSittingSaved] = useState<{ day: string; text: string } | null>(null);
  const recorder = useVoiceRecorder({
    kind: 'reading',
    day: today,
    currentPage,
    // Ended with the timer, the recording is told about in the sitting's note, not its own.
    onFinished: (info) => {
      if (!endingSitting.current) setSavedRecording(info);
    },
  });
  const recordingOn = recorder.phase === 'recording' || recorder.phase === 'paused';
  const endRecordingWithTimer = useCallback(async () => {
    endingSitting.current = true;
    try {
      await recorder.finish();
    } finally {
      endingSitting.current = false;
    }
  }, [recorder]);
  const onSittingSaved = useCallback(
    (day: string, seconds: number, ended: { pages: number[] }) => {
      setSavedRecording(null);
      setSittingSaved({ day, text: sittingSavedText({ day, today: today ?? day, pages: ended.pages, seconds }) });
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

  // ===== The one mic: Record, Recite, Check (Revisely Dev, testers, the 1405 print) =====
  const liveOn = reciteLiveEnabled(user, edition);
  const reciteSettings = useReciteCheckSettings(user?.id);
  const owned = checkOwned(user, reciteSettings);
  const live = useLiveRecitation({
    settings: reciteSettings,
    currentPage,
    onShowPage: (page) => pagerRef.current?.scrollToPage(page),
  });
  const [words, setWords] = useState<QuranWords | null>(getQuranWords());
  useEffect(() => {
    if (!liveOn || words) return;
    loadQuranWords()
      .then(setWords)
      .catch((err) => logger.warn('The word data did not load (the reader’s live check)', err));
  }, [liveOn, words]);
  const qw = live.words ?? words;
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState<Revealed>(NOTHING_SHOWN);
  const [modeMenu, setModeMenu] = useState(false);
  const [noticeFor, setNoticeFor] = useState<LiveMode | null>(null);
  // Check: the word a card is open on (and where it is on screen), similar phrases, the summary, Check's page.
  const [cardAt, setCardAt] = useState<{ w: number; anchor: Box } | null>(null);
  const [similarFor, setSimilarFor] = useState<number | null>(null);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  // Wake the checker while the reader opens (Cloud Run sleeps; waking takes a few seconds).
  useEffect(() => {
    if (liveOn) warmUpReciteCheck();
  }, [liveOn]);
  const micMode: ReciteMicMode = reciteSettings.mode;
  const liveInfo = useMemo(
    () => ({ saidUpTo: furthestWord(live.state), startWord: live.startWord, cursor: live.state.cursor }),
    [live.state, live.startWord],
  );

  const startMode = useCallback(
    (mode: ReciteMicMode) => {
      if (mode === 'record') {
        void recorder.start();
        return;
      }
      // Check that isn't the account's opens its page.
      if (mode === 'check' && !owned) {
        setIntroOpen(true);
        return;
      }
      if (!reciteSettings.noticeSeen) {
        setNoticeFor(mode);
        return;
      }
      setRevealed(NOTHING_SHOWN);
      void live.start(mode);
    },
    [recorder, owned, reciteSettings.noticeSeen, live],
  );
  const pickMode = useCallback(
    (mode: ReciteMicMode) => {
      setModeMenu(false);
      if (mode !== 'check' || owned) setReciteCheckSettings(user?.id, { mode });
      startMode(mode);
    },
    [owned, user?.id, startMode],
  );
  const toggleHidden = useCallback(() => {
    setRevealed(NOTHING_SHOWN);
    setHidden((h) => !h);
  }, []);
  const showNextWord = useCallback(() => {
    if (!qw) return;
    setRevealed((r) => {
      const next = revealNextWord(qw, currentPage, r, liveInfo);
      const added = [...next].find((w) => !r.has(w));
      if (added != null) live.hint(added, 'word');
      return next;
    });
  }, [qw, currentPage, liveInfo, live]);
  const showWholeAyah = useCallback(() => {
    if (!qw) return;
    setRevealed((r) => {
      const next = revealAyah(qw, currentPage, r, liveInfo);
      const added = [...next].find((w) => !r.has(w));
      if (added != null) live.hint(added, 'ayah');
      return next;
    });
  }, [qw, currentPage, liveInfo, live]);

  const checkTake = live.mode === 'check';
  const cardMarks = useMemo<Mark[]>(
    () => (cardAt ? Object.values(live.state.marks).filter((m) => m.w === cardAt.w) : []),
    [cardAt, live.state.marks],
  );
  // A card whose marks are all dismissed closes.
  useEffect(() => {
    if (cardAt && cardMarks.length === 0) setCardAt(null);
  }, [cardAt, cardMarks.length]);
  const onTapPoint = useMemo(
    () =>
      liveOn && qw && checkTake
        ? (page: number, x: number, y: number, toWindow: (r: { x0: number; y0: number; x1: number; y1: number }) => Box) => {
            const m = markAt(qw, marksOnPage(live.state, qw, page), x, y);
            if (!m) return false;
            setCardAt({ w: m.w, anchor: toWindow(wordBox(qw, m.w)) });
            return true;
          }
        : undefined,
    [liveOn, qw, checkTake, live.state],
  );
  const similar = useMemo(() => (qw && similarFor != null ? similarPhrases(qw, similarFor) : []), [qw, similarFor]);
  const cardHasSimilar = useMemo(() => (qw && cardAt ? similarPhrases(qw, cardAt.w).length > 0 : false), [qw, cardAt]);
  // The summary, once a take has its final answer.
  const takeId = live.state.take;
  useEffect(() => {
    if (live.state.status === 'done' && takeId && summaryFor !== takeId) setSummaryFor(takeId);
    // Only when a take finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.state.status, takeId]);
  const [summaryShown, setSummaryShown] = useState<string | null>(null);
  useEffect(() => {
    if (summaryFor) setSummaryShown(summaryFor);
  }, [summaryFor]);
  const pageMarks = useCallback(
    (page: number) => (checkTake && qw ? marksOnPage(live.state, qw, page) : []),
    [checkTake, qw, live.state],
  );
  const coverColors = useMemo(() => ({ cover: palette.pageBg, guide: palette.textSecondary, band: v2.accentText }), [palette, v2]);
  const pageUnderlay = useMemo(
    () =>
      liveOn && qw && live.active
        ? (page: number, scale: number) => (
            <LiveUnderlay
              page={page}
              scale={scale}
              words={qw}
              cursor={live.state.status === 'listening' ? live.state.cursor : null}
              selected={cardMarks[0] ?? null}
              colors={{ band: v2.followBand, word: v2.followWord, selectedMistake: v2.redSubtle, selectedSlip: v2.warnSubtle }}
            />
          )
        : undefined,
    [liveOn, qw, live.active, live.state, v2, cardMarks],
  );
  const pageOverlay = useMemo(
    () =>
      liveOn && qw && (live.active || hidden)
        ? (page: number, scale: number, image: Parameters<NonNullable<React.ComponentProps<typeof MushafPager>['pageOverlay']>>[2]) => (
            <LiveOverlay
              page={page}
              scale={scale}
              image={image}
              words={qw}
              marks={pageMarks(page)}
              hidden={hidden ? { follow: hiddenFollow(qw, revealed, liveInfo), ...coverColors } : null}
              newest={live.state.cursor}
              colors={{ mistake: v2.red, slip: v2.warn, accent: v2.accentText, onMistake: v2.bg, ground: palette.pageBg }}
            />
          )
        : undefined,
    [liveOn, qw, live.active, live.state.cursor, hidden, revealed, liveInfo, coverColors, pageMarks, v2],
  );
  const onTapVerse = useMemo(
    () =>
      liveOn && hidden && qw
        ? (ayah: AyahRef) => {
            setRevealed((r) => revealAyah(qw, ayah.page, r, liveInfo, ayah));
            return true;
          }
        : undefined,
    [liveOn, hidden, qw, liveInfo],
  );

  const liveStatus = live.state.status;
  const barPhase: 'live' | 'checking' | 'done' =
    liveStatus === 'checking' ? 'checking' : liveStatus === 'done' || liveStatus === 'failed' ? 'done' : 'live';
  const barStatus =
    liveStatus === 'connecting'
      ? 'Starting…'
      : liveStatus === 'checking'
        ? 'Checking…'
        : liveStatus === 'failed'
          ? LIVE_FAILURE[live.state.failure ?? 'server']
          : liveStatus === 'done'
            ? 'Done'
            : 'Listening…';

  // Previous / next go when the capsule is crowded (a recording, a timer) on
  // anything narrower than the largest phones.
  const crowded = recorder.phase !== 'idle' || timer != null;
  // Recording: the recorder is the whole capsule, the timer beside it (compact).
  const recordingLive = recorderTakesCapsule(recorder);
  const compact = (width < 430 && crowded) || (recordingLive && timer != null);

  return (
    <View style={styles.container}>
      <ReaderFrame
        chromeVisible={chrome.visible || live.active || modeMenu}
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
            <RoundButton icon="chevron-back" label="Back" onPress={() => navigation.goBack()} palette={palette} testID="reader-back" />
            <View style={styles.titleCol}>
              <SurahName surah={firstSurah} palette={palette} />
              <Text style={styles.subtitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                Page {currentPage} · Juz {juz} · Hizb {hizb}
              </Text>
            </View>
            {/* Its help (HELP-1), a round button like Back; hidden, the same room keeps the title centred. */}
            <HelpButton
              screen="reader"
              render={(open, label) => (
                <RoundButton icon={HELP_ICON} label={label} onPress={open} palette={palette} testID="help-button-reader" />
              )}
              placeholder={<View style={{ width: ROUND_BUTTON_SIZE }} />}
            />
          </View>
        }
        footer={
          <View style={styles.footer}>
            {live.active && qw ? (
              <ReciteBar
                hidden={hidden}
                onToggleHidden={toggleHidden}
                onNextWord={showNextWord}
                onWholeAyah={showWholeAyah}
                score={checkTake ? scorePill(live.state, qw, live.startWord) : null}
                seconds={live.seconds}
                recording={false}
                words={barWords(live.state, qw, { check: checkTake, startWord: live.startWord })}
                status={barStatus}
                phase={barPhase}
                onStop={live.stop}
                onClose={() => {
                  setCardAt(null);
                  setSummaryShown(null);
                  live.clear();
                }}
                surface={{ background: palette.control, border: palette.divider }}
              />
            ) : (
            <>
            <MushafScrubber page={currentPage} onJump={handleJump} palette={palette} />
            <PlayerCapsule
              player={verseActions.player}
              page={currentPage}
              compact={compact}
              surface={{ background: palette.control, border: palette.divider }}
              recording={recordingLive}
              record={
                liveOn && recorder.phase === 'idle' ? (
                  <>
                    <BarButton
                      icon={hidden ? 'eye-outline' : 'eye-off-outline'}
                      label={hidden ? 'Show the page' : 'Hide the page'}
                      onPress={toggleHidden}
                      active={hidden}
                      testID="reader-eye"
                    />
                    <ReciteMic
                      mode={micMode}
                      starting={live.mic === 'starting'}
                      onPress={() => startMode(micMode)}
                      onLongPress={() => setModeMenu(true)}
                    />
                  </>
                ) : (
                  <RecordButton recorder={recorder} crowded={timer != null} />
                )
              }
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
          highlightedAyah={verseActions.highlightedAyah ?? searchHighlight}
          onTap={onTapPage}
          onUserSwipe={chrome.hide}
          pageUnderlay={pageUnderlay}
          pageOverlay={pageOverlay}
          onTapVerse={onTapVerse}
          onTapPoint={onTapPoint}
          extraData={liveOn ? `${live.state.cursor}|${live.state.saidUpTo}|${Object.keys(live.state.marks).length}|${hidden}|${revealed.size}` : undefined}
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

      <UndoToast
        visible={!!sittingSaved}
        message={sittingSaved?.text ?? ''}
        actionLabel="View"
        duration={6000}
        onUndo={() => {
          const saved = sittingSaved;
          setSittingSaved(null);
          if (saved) navigateToActivityDay(saved.day);
        }}
        onDismiss={() => setSittingSaved(null)}
        bottomInset={insets.bottom - spacing.sm}
      />

      <HelpToast screen="reader" bottomInset={insets.bottom - spacing.sm} />
      {verseActions.overlay}
      {liveOn ? (
        <>
          <ReciteModeMenu
            visible={modeMenu}
            mode={micMode}
            checkOwned={owned}
            bottom={insets.bottom + spacing.sm + CAPSULE_HEIGHT + spacing.sm}
            right={spacing.sm + 2}
            onPick={pickMode}
            onClose={() => setModeMenu(false)}
          />
          {qw ? (
            <MarkCard
              marks={cardMarks}
              words={qw}
              anchor={cardAt?.anchor ?? null}
              onDismiss={live.dismiss}
              onHear={(m) => getRecitation().play({ sura: m.ayah[0], ayah: m.ayah[1] }, () => null)}
              onSimilar={(m) => {
                setCardAt(null);
                setSimilarFor(m.w);
              }}
              hasSimilar={cardHasSimilar}
              onClose={() => setCardAt(null)}
            />
          ) : null}
          <SimilarPhrasesSheet
            visible={similarFor != null}
            words={qw}
            here={similarFor}
            places={similar}
            onOpen={(p) => {
              setSimilarFor(null);
              pagerRef.current?.scrollToPage(p.page);
            }}
            onClose={() => setSimilarFor(null)}
          />
          <TakeSummarySheet
            visible={summaryShown != null && live.state.status === 'done'}
            check={checkTake}
            words={qw}
            from={live.startWord}
            to={live.state.final?.to ?? furthestWord(live.state)}
            seconds={live.seconds}
            marks={Object.values(live.state.marks).sort((a, b) => a.w - b.w)}
            score={checkTake && qw ? scorePill(live.state, qw, live.startWord) : null}
            kept={live.state.final?.kept === true}
            checkOwned={owned}
            onFinding={(m) => {
              setSummaryShown(null);
              if (!qw) return;
              pagerRef.current?.scrollToPage(qw.pageOf(m.w));
              setCardAt({ w: m.w, anchor: { x: width / 2, y: insets.top + 120, width: 1, height: 1 } });
            }}
            onCheck={() => {
              setSummaryShown(null);
              setIntroOpen(true);
            }}
            onAgain={() => {
              const mode = live.mode;
              setSummaryShown(null);
              setCardAt(null);
              live.clear();
              if (mode) startMode(mode);
            }}
            onDone={() => setSummaryShown(null)}
          />
          <CheckIntroPage
            visible={introOpen}
            onGet={() =>
              Alert.alert('Not yet', 'Payments aren’t set up yet. In Revisely Dev every tester has Check.')
            }
            onClose={() => setIntroOpen(false)}
          />
          <ReciteNoticeSheet
            visible={noticeFor != null}
            onAgree={() => {
              const mode = noticeFor;
              setReciteCheckSettings(user?.id, { noticeSeen: true });
              setNoticeFor(null);
              if (mode) {
                setRevealed(NOTHING_SHOWN);
                void live.start(mode);
              }
            }}
            onClose={() => setNoticeFor(null)}
          />
        </>
      ) : null}
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
