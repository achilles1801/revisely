import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useIsFocused, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MushafPager, MushafPagerHandle } from '../../components/MushafPager';
import { MushafScrubber } from '../../components/MushafScrubber';
import { useVerseActions } from '../../components/verse/useVerseActions';
import { RecordingSavedToast, SavedRecording } from '../../components/recordings/RecordingSavedToast';
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
import { SavedSitting, SittingEnded, sittingSavedText, sittingsEnabled } from '../../lib/sitting';
import { SittingSavedToast } from '../../components/timer/SittingSavedToast';
import type { ReadStackParamList } from '../../navigation/MainNavigator';
import { reciteLiveEnabled } from '../../lib/reciteLive/availability';
import { premiumErrorText, setDevPremium, supportLinkUrl, usePremium } from '../../lib/premium';
import { reciteCheckSettingsLoaded, setReciteCheckSettings, useReciteCheckSettings } from '../../lib/reciteCheck/settings';
import { loadQuranWords, getQuranWords, QuranWords } from '../../lib/recite/quranWords';
import { furthestWord, marksOnPage, removedMarks, startNotFound } from '../../lib/reciteLive/state';
import { stopTrace } from '../../lib/reciteLive/stopTrace';
import {
  barWords,
  hiddenFollow,
  NOTHING_SHOWN,
  revealAyah,
  revealNextWord,
  Revealed,
  scorePill,
  wordShown,
} from '../../lib/reciteLive/view';
import { NOTHING_PEEKED, Peeked, peekedByAyah, peekedLine } from '../../lib/reciteLive/peeked';
import { LiveMode, useLiveRecitation } from '../../components/reciteLive/useLiveRecitation';
import { ReciteMic, ReciteMicMode } from '../../components/reciteLive/ReciteMic';
import { ReciteMenuMode, ReciteModeMenu } from '../../components/reciteLive/ReciteModeMenu';
import { BarButton, ReciteBar } from '../../components/reciteLive/ReciteBar';
import { LiveMarkTargets, LiveOverlay, LiveUnderlay } from '../../components/reciteLive/LivePageLayers';
import { ReciteNoticeSheet } from '../../components/reciteLive/ReciteNoticeSheet';
import { MarkCard } from '../../components/reciteLive/MarkCard';
import { SimilarPhrasesSheet } from '../../components/reciteLive/SimilarPhrasesSheet';
import { findingsLine, TakeSummarySheet } from '../../components/reciteLive/TakeSummarySheet';
import { say, undoMs, useScreenReaderOn } from '../../components/reciteLive/a11y';
import { markTitle } from '../../lib/reciteLive/describe';
import { drillMarks, drillRange, openDrill } from '../../lib/reciteLive/drill';
import { describeAyahs } from '../../lib/passages';
import { foundSpan, TakeSpan } from '../../lib/reciteLive/span';
import { TestPlace, testJuz, testPlaces, TestResult, testResult } from '../../lib/reciteLive/testMe';
import { memorizedAyahs } from '../../lib/memorizedAyahs';
import { outcomeText, TestMeScopeSheet, TestSummarySheet } from '../../components/reciteLive/TestMeSheets';
import { CheckIntroPage } from '../../components/reciteLive/CheckIntroPage';
import { TakeActivity } from '../../components/reciteLive/TakeActivity';
import { markAt, wordBox } from '../../lib/reciteLive/geometry';
import { similarPhrases } from '../../lib/reciteLive/similar';
import type { Mark } from '../../lib/reciteLive/contract';
import type { Box } from '../../components/verse/menuPlacement';
import { playClip, playReference, stopHearing } from '../../lib/reciteLive/hearAudio';
import { useKeepCheckerWarm } from '../../components/reciteLive/useKeepCheckerWarm';
import { needsPremium, type LiveFailure } from '../../lib/reciteLive/contract';
import { logger } from '../../lib/logger';
import { useRememberTake } from '../../components/reciteMemory/useRememberTake';
import { remember, useMemoryRecords } from '../../lib/reciteMemory/store';
import { clearedBy, memoryOfWord, openInRange, wordMemories, type WordMemory } from '../../lib/reciteMemory/memory';
import { passageTakes, progressLine } from '../../lib/reciteMemory/progress';
import { PassageProgressSheet } from '../../components/reciteMemory/PassageProgressSheet';
import { memoryId, type ClearRecord } from '../../lib/reciteMemory/record';
import { clipOfTake, useTakeRecordings } from '../../lib/reciteMemory/takeAudio';
import { RememberedTargets, RememberedUnderlay } from '../../components/reciteMemory/RememberedLayers';
import { WordHistoryCard } from '../../components/reciteMemory/WordHistoryCard';
import { ShownTakeBar } from '../../components/reciteMemory/ShownTakeBar';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { countsAsMistake, isUnclear } from '../../lib/reciteLive/contract';
import { pageAccuracy } from '../../lib/reciteLive/score';
import { sendLabel } from '../../lib/reciteCheck/service';

/** Said to screen reader users only, after Stop, when a take's start was never found (everyone else: nothing). */
const START_NOT_FOUND_SPOKEN = 'Couldn’t follow that take. Try starting at the top of the page.';

/** What the recite bar says when a take ends without its answer. */
const LIVE_FAILURE: Record<LiveFailure, string> = {
  sign_in: 'Sign in again to recite',
  testers_only: 'For testers only',
  limit: 'That’s a lot for one hour',
  too_long: '15 minutes reached',
  idle: 'Stopped: nothing heard',
  bad_request: 'Couldn’t start',
  server: 'The checker stopped',
  check_locked: 'Marking mistakes needs Premium',
  premium_required: 'Marking mistakes needs Premium',
  // Never shown in practice: the socket moves such a take to recite-check (lib/reciteLive/socket).
  level_elsewhere: 'Couldn’t start',
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

  // ===== The one mic: Record, Recite, Check (Revisely Dev, testers, the 1405 print) =====
  const liveOn = reciteLiveEnabled(user, edition);
  const reciteSettings = useReciteCheckSettings(user?.id);
  // Marking mistakes needs Premium: the account's grant (lib/premium; apply-support's contract draft 2).
  const premium = usePremium(user?.id, liveOn);
  const owned = premium.has;
  const [gettingPremium, setGettingPremium] = useState(false);
  // Revisely Dev: Premium is free (nothing is charged); it says so before turning it on.
  const getPremium = useCallback(() => {
    Alert.alert('Premium in Revisely Dev', 'Free while testing: nothing is charged. Turn it off in Settings → Testing.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn on',
        onPress: () => {
          setGettingPremium(true);
          setDevPremium(true)
            .then((on) => {
              if (on) setIntroOpen(false);
            })
            .catch((err) => Alert.alert('Couldn’t turn on Premium', premiumErrorText(err)))
            .finally(() => setGettingPremium(false));
        },
      },
    ]);
  }, []);
  // "Can't afford it? Apply for support": the program's page, opened with a one-time link for this account.
  const applyForSupport = useCallback(() => {
    supportLinkUrl()
      .then((url) => {
        // Required here, so screens and tests that never open it don't load it (expo-web-browser is in every binary).
        const WebBrowser = require('expo-web-browser') as typeof import('expo-web-browser');
        return WebBrowser.openBrowserAsync(url);
      })
      .catch((err) => Alert.alert('Apply for support', premiumErrorText(err)));
  }, []);
  // A take kept as a recording (Save recordings, on by default) is told about once the take is closed (✕) and the
  // player is back: "Recording saved · View", over the player as after any recording, never over the recite bar.
  const [takeSaved, setTakeSaved] = useState<{ day: string; recordingId: string } | null>(null);
  const live = useLiveRecitation({
    settings: reciteSettings,
    currentPage,
    onShowPage: (page) => pagerRef.current?.scrollToPage(page),
    recordingDay: today ?? null,
    onRecordingSaved: (saved) => {
      setTakeSaved(saved);
      noteTakeRecording.current(saved);
    },
  });
  // Recite's memory (lib/reciteMemory): every take with Mark mistakes, kept on the account.
  const memoryRecords = useMemoryRecords(user?.id, liveOn);
  const noteTakeRecording = useRef<(saved: { recordingId: string }) => void>(() => undefined);
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
  const remembering = useRememberTake({
    uid: user?.id,
    enabled: liveOn,
    live,
    hidden,
    day: today ?? null,
    level: reciteSettings.level === 'strict' ? 'strict' : 'words',
    records: memoryRecords,
  });
  noteTakeRecording.current = remembering.noteRecording;
  const takeRecord = remembering.current;
  // Words shown by hand during the take (‹, ‹‹): kept in quiet grey on the page, listed in the summary, drilled.
  const [peeked, setPeeked] = useState<Peeked>(NOTHING_PEEKED);
  const [modeMenu, setModeMenu] = useState(false);
  // The AI notice comes before the first take: the take it was asked for starts once it's agreed.
  const [noticeFor, setNoticeFor] = useState<{ mode: LiveMode; span: TakeSpan | null; reveal: Revealed } | null>(null);
  // Check: the word a card is open on (and where it is on screen), similar phrases, the summary, Check's page.
  const [cardAt, setCardAt] = useState<{ w: number; anchor: Box } | null>(null);
  // What the card plays stops when the card closes, and when the reader goes (Majd, Nov 15 2026: Husary played on past
  // the take, into Control Center).
  useEffect(() => {
    if (!cardAt) stopHearing();
  }, [cardAt]);
  useEffect(() => () => stopHearing(), []);
  const [similarFor, setSimilarFor] = useState<number | null>(null);
  // "Not a mistake" on the card can be undone for a few seconds (Majd, Nov 15 2026); the summary's Removed list after.
  const [undoFor, setUndoFor] = useState<string | null>(null);
  // With VoiceOver or TalkBack: the Undo stays longer, and what happened is said (never while the microphone is on).
  const screenReader = useScreenReaderOn();
  useEffect(() => {
    if (live.state.status === 'connecting' || live.state.status === 'idle') setUndoFor(null);
  }, [live.state.status]);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  // Keep the checker awake while the reader is open and in front (Cloud Run stops an idle one after about 15 minutes, and
  // waking takes 6–9 s): on opening, then every 10 minutes, never while a take's connection already holds it.
  const takeBusy = live.state.status === 'connecting' || live.state.status === 'listening' || live.state.status === 'checking';
  useKeepCheckerWarm(liveOn && isScreenFocused, takeBusy);
  // What a tap on the mic starts: Record, or Recite, marking mistakes when the switch is on and the account has it.
  const markMistakes = owned && reciteSettings.markMistakes;
  const micMode: ReciteMicMode = reciteSettings.mode === 'record' ? 'record' : markMistakes ? 'check' : 'recite';
  // Test me (Majd, Nov 15 2026; lib/reciteLive/testMe): five random places in what's memorized, or in one juz. Each is a
  // Mark mistakes take with the page hidden but for its first two words; the bar says how it went, with Next and ✕.
  const [testPick, setTestPick] = useState(false);
  const [test, setTest] = useState<{
    juz: number | null;
    places: TestPlace[];
    at: number;
    results: TestResult[];
    hiddenBefore: boolean;
  } | null>(null);
  const testRef = useRef(test);
  testRef.current = test;
  const [testSummary, setTestSummary] = useState<{ juz: number | null; results: TestResult[] } | null>(null);
  const memorized = useMemo(() => (liveOn ? memorizedAyahs(pages ?? []) : []), [liveOn, pages]);
  const testableJuz = useMemo(() => (liveOn && qw ? testJuz(memorized, qw) : []), [liveOn, qw, memorized]);
  const testPlace = test ? test.places[test.at] : null;
  const liveInfo = useMemo(
    () => ({
      saidUpTo: furthestWord(live.state),
      // Before the checker has found the start of a test's place: from the place (‹ shows its third word, not the page's first).
      startWord: live.startWord ?? testPlace?.cue[0] ?? null,
      cursor: live.state.cursor,
    }),
    [live.state, live.startWord, testPlace],
  );

  // Recite the mistakes again: what the take before found in the stretch, for its summary ("Before: …").
  const [drillBefore, setDrillBefore] = useState<string | null>(null);
  const startMode = useCallback(
    (mode: ReciteMicMode, span: TakeSpan | null = null, reveal: Revealed = NOTHING_SHOWN) => {
      if (mode === 'record') {
        void recorder.start();
        return;
      }
      // Marking mistakes without Premium opens the Premium page.
      if (mode === 'check' && !owned) {
        setIntroOpen(true);
        return;
      }
      if (!reciteSettings.noticeSeen) {
        setNoticeFor({ mode, span, reveal });
        return;
      }
      setRevealed(reveal);
      setPeeked(NOTHING_PEEKED);
      setDrillBefore(null);
      void live.start(mode, span);
    },
    [recorder, owned, reciteSettings.noticeSeen, live],
  );
  // Recite your N mistakes here (the held mic, with Premium): the page's words still to fix in Recite's memory, as one
  // take over the stretch that holds them, stopping by itself at its end. Worked out only while the menu is open.
  const pageDrill = useMemo(
    () => (modeMenu && liveOn && owned && qw && memoryRecords.length > 0 ? openDrill(memoryRecords, qw, currentPage) : null),
    [modeMenu, liveOn, owned, qw, memoryRecords, currentPage],
  );
  const menuDrill = useMemo(
    () =>
      pageDrill
        ? {
            count: pageDrill.count,
            place: describeAyahs(
              ayahsBetween(ayahKey(pageDrill.range.from[0], pageDrill.range.from[1]), ayahKey(pageDrill.range.to[0], pageDrill.range.to[1])),
            ),
          }
        : null,
    [pageDrill],
  );
  const drillHere = useCallback(() => {
    if (!pageDrill) return;
    setModeMenu(false);
    setRevealed(NOTHING_SHOWN);
    // The summary's "Before: …": what those words were last time.
    setDrillBefore(findingsLine(pageDrill.marks));
    if (!reciteSettings.noticeSeen) {
      setNoticeFor({ mode: 'check', span: pageDrill.range, reveal: NOTHING_SHOWN });
      return;
    }
    void live.start('check', pageDrill.range);
  }, [pageDrill, reciteSettings.noticeSeen, live]);
  // A test's place: the page hidden but for the place's first two words, and a take over its ayahs.
  const beginPlace = useCallback(
    (place: TestPlace) => {
      setCardAt(null);
      setHidden(true);
      startMode('check', place.span, new Set(place.cue));
    },
    [startMode],
  );
  const startTest = useCallback(
    (juz: number | null) => {
      setTestPick(false);
      setTestSummary(null);
      if (!qw) return;
      const places = testPlaces(memorized, qw, { juz });
      if (places.length === 0) return;
      setTest({ juz, places, at: 0, results: [], hiddenBefore: testRef.current?.hiddenBefore ?? hidden });
      beginPlace(places[0]);
    },
    [qw, memorized, hidden, beginPlace],
  );
  const nextPlace = useCallback(() => {
    const run = testRef.current;
    if (!run || run.at + 1 >= run.places.length) return;
    live.clear();
    setTest({ ...run, at: run.at + 1 });
    beginPlace(run.places[run.at + 1]);
  }, [live, beginPlace]);
  /** The test ends (its last place, or ✕): the take goes, the page as it was, and the summary if a place was done. */
  const endTest = useCallback(
    (results: TestResult[]) => {
      const run = testRef.current;
      live.clear();
      setCardAt(null);
      setRevealed(NOTHING_SHOWN);
      setTest(null);
      if (run) setHidden(run.hiddenBefore);
      if (run && results.length > 0) setTestSummary({ juz: run.juz, results });
    },
    [live],
  );
  // A test whose take never started (the notice closed, the microphone refused, Premium refused): it ends, so the next
  // take isn't counted as one of its places. Between places the microphone is already starting.
  const testStalled = test != null && live.state.status === 'idle' && live.mic !== 'starting' && noticeFor == null;
  useEffect(() => {
    if (testStalled && testRef.current) endTest(testRef.current.results);
    // endTest is stable enough: only when the test stalls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testStalled]);
  // A voice search with one result (Majd, Nov 15 2026: "take them to that page as if they're about to recite it"): a
  // take starts as the reader opens, the checker looking for the start only in the ayahs found. Recite, marking
  // mistakes when the switch is on, whatever a tap on the mic would start. It waits for the account's settings (the
  // notice first, if it hasn't been agreed) and, with the switch on, for Premium to be known (3 s at most).
  const reciteOnOpen = useRef(route.params.recite === true ? (route.params.highlight ?? null) : null);
  const settingsLoaded = reciteCheckSettingsLoaded(user?.id);
  const [premiumWaited, setPremiumWaited] = useState(false);
  useEffect(() => {
    if (!reciteOnOpen.current) return;
    const t = setTimeout(() => setPremiumWaited(true), 3000);
    return () => clearTimeout(t);
  }, []);
  const premiumKnown = premium.known;
  const showChrome = chrome.show;
  useEffect(() => {
    const found = reciteOnOpen.current;
    if (!found || !liveOn || !settingsLoaded) return;
    if (reciteSettings.markMistakes && !premiumKnown && !premiumWaited) return;
    reciteOnOpen.current = null;
    // The controls up, as after a tap on the page: once the take is closed the player and its mic are there.
    showChrome();
    startMode(markMistakes ? 'check' : 'recite', foundSpan(found));
  }, [liveOn, settingsLoaded, premiumKnown, premiumWaited, reciteSettings.markMistakes, markMistakes, startMode, showChrome]);
  const pickMode = useCallback(
    (mode: ReciteMenuMode) => {
      setModeMenu(false);
      setReciteCheckSettings(user?.id, { mode });
      startMode(mode === 'record' ? 'record' : markMistakes ? 'check' : 'recite');
    },
    [markMistakes, user?.id, startMode],
  );
  // The switch belongs to Recite: turning it on or off picks Recite too (the menu stays open).
  const setMarkMistakes = useCallback(
    (on: boolean) => setReciteCheckSettings(user?.id, { markMistakes: on, mode: 'recite' }),
    [user?.id],
  );
  const toggleHidden = useCallback(() => {
    setRevealed(NOTHING_SHOWN);
    setHidden((h) => !h);
  }, []);
  // Each tells the checker which word was shown (the ayah's first word not shown before, for ‹‹).
  /** During a take, the words that `next` shows that weren't showing: peeks. */
  const notePeeks = useCallback(
    (next: Revealed) => {
      if (!live.active) return;
      const newly = [...next].filter((w) => !wordShown(w, revealed, liveInfo));
      if (newly.length) setPeeked((p) => new Set([...p, ...newly]));
    },
    [live.active, revealed, liveInfo],
  );
  const showNextWord = useCallback(() => {
    if (!qw) return;
    const next = revealNextWord(qw, currentPage, revealed, liveInfo);
    const added = [...next].find((w) => !revealed.has(w));
    if (added == null) return;
    live.hint(added, 'word');
    notePeeks(next);
    setRevealed(next);
  }, [qw, currentPage, revealed, liveInfo, live, notePeeks]);
  const showWholeAyah = useCallback(() => {
    if (!qw) return;
    const next = revealAyah(qw, currentPage, revealed, liveInfo);
    const added = [...next].find((w) => !revealed.has(w));
    if (added == null) return;
    live.hint(added, 'ayah');
    notePeeks(next);
    setRevealed(next);
  }, [qw, currentPage, revealed, liveInfo, live, notePeeks]);

  const checkTake = live.mode === 'check';
  const cardMarks = useMemo<Mark[]>(
    () => (cardAt ? Object.values(live.state.marks).filter((m) => m.w === cardAt.w) : []),
    [cardAt, live.state.marks],
  );
  // A card whose marks are all dismissed closes.
  useEffect(() => {
    if (cardAt && cardMarks.length === 0) setCardAt(null);
  }, [cardAt, cardMarks.length]);
  // Recite's memory: words missed in past takes stay marked, lighter, outside takes (lib/reciteMemory), unless turned off
  // in Settings or the page is hidden. During a take they step aside: the page shows only that take's marks.
  const memories = useMemo(() => wordMemories(memoryRecords), [memoryRecords]);
  // Show on the page (Activity, Your progress; Tarteel's Load Session): a past take on its page with its marks, and
  // nothing else, until Done.
  const [showTakeId, setShowTakeId] = useState<string | null>(route.params.showTake ?? null);
  const showTakeParam = route.params.showTake;
  useEffect(() => {
    if (showTakeParam) setShowTakeId(showTakeParam);
  }, [showTakeParam]);
  const shownTake = useMemo(
    () => (showTakeId ? (memoryRecords.find((r): r is TakeRecord => r.id === showTakeId && r.kind === 'take' && !r.deleted) ?? null) : null),
    [showTakeId, memoryRecords],
  );
  const showing = liveOn && !!qw && shownTake != null && !live.active;
  const shownOnPage = useCallback(
    (page: number) => {
      if (!showing || !qw || !shownTake) return [];
      const [from, to] = qw.pageRange(page);
      return shownTake.marks.filter((m) => m.w >= from && m.w < to);
    },
    [showing, qw, shownTake],
  );
  const [shownCardAt, setShownCardAt] = useState<{ w: number; anchor: Box } | null>(null);
  const shownCardMarks = useMemo(() => (shownCardAt && shownTake ? shownTake.marks.filter((m) => m.w === shownCardAt.w) : []), [shownCardAt, shownTake]);
  useEffect(() => {
    if (!shownCardAt) stopHearing();
  }, [shownCardAt]);
  useEffect(() => {
    if (shownCardAt && shownCardMarks.length === 0) setShownCardAt(null);
  }, [shownCardAt, shownCardMarks.length]);
  const endShowing = useCallback(() => {
    setShowTakeId(null);
    setShownCardAt(null);
    (navigation as { setParams?: (p: Record<string, unknown>) => void }).setParams?.({ showTake: undefined });
  }, [navigation]);
  // Not a mistake on a past take's mark: the take is kept again without it (and its score with it), and the checker
  // hears it as a label.
  const dismissShown = useCallback(
    (id: string) => {
      if (!shownTake || !user?.id || !qw) return;
      const m = shownTake.marks.find((x) => x.id === id);
      if (!m) return;
      const unclear = isUnclear(m);
      const mistakes = shownTake.mistakes - (countsAsMistake(m) && !unclear ? 1 : 0);
      const next: TakeRecord = {
        ...shownTake,
        marks: shownTake.marks.filter((x) => x.id !== id),
        mistakes: Math.max(0, mistakes),
        tajweed: Math.max(0, shownTake.tajweed - (m.kind === 'tajweed' ? 1 : 0)),
        unclear: Math.max(0, shownTake.unclear - (unclear ? 1 : 0)),
        accuracy: pageAccuracy(qw, Math.max(0, mistakes), shownTake.from, shownTake.to),
        rev: Date.now(),
      };
      remember(user.id, next).catch((err) => logger.warn('Recite memory: Not a mistake was not kept', err));
      if (shownTake.take) void sendLabel('dismiss', shownTake.take, id, Date.now());
    },
    [shownTake, user?.id, qw],
  );
  // A take started over a shown one ends showing it.
  useEffect(() => {
    if (live.active && showTakeId) endShowing();
  }, [live.active, showTakeId, endShowing]);
  const showPast = liveOn && !!qw && reciteSettings.showPast && !hidden && !live.active && !showing;
  const pastOnPage = useCallback(
    (page: number): WordMemory[] => (showPast && qw ? openInRange(memories, ...qw.pageRange(page)) : []),
    [showPast, qw, memories],
  );
  const [pastAt, setPastAt] = useState<{ w: number; anchor: Box } | null>(null);
  useEffect(() => {
    if (!showPast) setPastAt(null);
  }, [showPast]);
  // What its card plays stops when the card closes.
  useEffect(() => {
    if (!pastAt) stopHearing();
  }, [pastAt]);
  const takeRecordings = useTakeRecordings(showPast || showing);
  const pastMemory = useMemo(() => (pastAt ? memoryOfWord(memories, pastAt.w) : null), [pastAt, memories]);
  const pastHasSimilar = useMemo(() => (qw && pastAt ? similarPhrases(qw, pastAt.w).length > 0 : false), [qw, pastAt]);
  // Clear now can be undone for a few seconds (the clear is a record of its own; Undo forgets it).
  const [clearedUndo, setClearedUndo] = useState<ClearRecord | null>(null);
  const clearPast = useCallback(
    (m: WordMemory) => {
      if (!user?.id) return;
      const now = Date.now();
      const record: ClearRecord = { id: memoryId(), kind: 'clear', createdAt: now, rev: now, day: today ?? m.attempts[m.attempts.length - 1]?.take.day ?? '', w: m.w, group: m.group };
      setPastAt(null);
      setClearedUndo(record);
      remember(user.id, record).catch((err) => logger.warn('Recite memory: Clear now was not kept', err));
    },
    [user?.id, today],
  );
  // The take's summary: the words it cleared, and its passage's trend (with this take in, before it has synced).
  const summaryMemory = useMemo(() => {
    if (!takeRecord || !qw) return null;
    const all = [...memoryRecords.filter((r) => r.id !== takeRecord.id), takeRecord];
    const takes = passageTakes(all, takeRecord.from, takeRecord.to);
    return {
      cleared: clearedBy(all, takeRecord).map((m) => qw.uthmani(m.w)),
      trend: takes.map((t) => t.accuracy),
      line: progressLine(takes, Date.now()),
    };
  }, [takeRecord, memoryRecords, qw]);
  // A passage's progress: from the summary (Done goes back to it) or a word's card.
  const [progressFor, setProgressFor] = useState<{ from: number; to: number; back: 'summary' | null } | null>(null);
  const progressTakes = useMemo(() => {
    if (!progressFor) return [];
    const all = takeRecord ? [...memoryRecords.filter((r) => r.id !== takeRecord.id), takeRecord] : memoryRecords;
    return passageTakes(all, progressFor.from, progressFor.to);
  }, [progressFor, memoryRecords, takeRecord]);
  const onTapPoint = useMemo(
    () =>
      showing && qw
        ? (page: number, x: number, y: number, toWindow: (r: { x0: number; y0: number; x1: number; y1: number }) => Box) => {
            const m = markAt(qw, shownOnPage(page), x, y);
            if (!m) return false;
            setShownCardAt({ w: m.w, anchor: toWindow(wordBox(qw, m.w)) });
            return true;
          }
        : liveOn && qw && checkTake
        ? (page: number, x: number, y: number, toWindow: (r: { x0: number; y0: number; x1: number; y1: number }) => Box) => {
            const m = markAt(qw, marksOnPage(live.state, qw, page), x, y);
            if (!m) return false;
            setCardAt({ w: m.w, anchor: toWindow(wordBox(qw, m.w)) });
            return true;
          }
        : showPast && qw
          ? (page: number, x: number, y: number, toWindow: (r: { x0: number; y0: number; x1: number; y1: number }) => Box) => {
              const past = pastOnPage(page);
              const m = markAt(qw, past.map((p) => p.lastMark).filter((x): x is Mark => x != null), x, y);
              if (!m) return false;
              setPastAt({ w: m.w, anchor: toWindow(wordBox(qw, m.w)) });
              return true;
            }
          : undefined,
    [liveOn, qw, checkTake, live.state, showPast, pastOnPage, showing, shownOnPage],
  );
  const similar = useMemo(() => (qw && similarFor != null ? similarPhrases(qw, similarFor) : []), [qw, similarFor]);
  const cardHasSimilar = useMemo(() => (qw && cardAt ? similarPhrases(qw, cardAt.w).length > 0 : false), [qw, cardAt]);
  // The summary, once a take has its final answer.
  const takeId = live.state.take;
  const [summaryShown, setSummaryShown] = useState<string | null>(null);
  // A new take may get the id of the one before (E2E's recorded takes all do): its summary must still show.
  useEffect(() => {
    if (live.state.status === 'connecting') setSummaryFor(null);
  }, [live.state.status]);
  useEffect(() => {
    if (live.state.status !== 'done' || !takeId || summaryFor === takeId) return;
    setSummaryFor(takeId);
    // A test's place: how it went is kept, and the bar says so with Next (or the test's summary after its last place).
    const run = testRef.current;
    if (run) {
      stopTrace.end();
      const results = [...run.results.slice(0, run.at), testResult(run.places[run.at], live.state, peeked.size)];
      if (run.at + 1 >= run.places.length) endTest(results);
      else setTest({ ...run, results });
      return;
    }
    // The checker never found where the reciter started: it fails silently (Majd, Nov 14 2026). No summary or
    // message; Stop just ends the take. With VoiceOver or TalkBack one line is said, the microphone already off (Majd,
    // Nov 15 2026): they can't see the bar never leave "Listening…", and a take gone without a word reads as a crash.
    if (startNotFound(live.state)) {
      live.clear();
      if (screenReader) say(START_NOT_FOUND_SPOKEN);
      return;
    }
    stopTrace.step('summary-asked');
    setSummaryShown(takeId);
    // Only when a take finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.state.status, takeId]);
  const takeStatus = live.state.status;
  // The checker's gate refused marking mistakes (no Premium): the Premium page, and the take goes.
  const takeFailure = live.state.failure;
  useEffect(() => {
    if (takeStatus !== 'failed' || !needsPremium(takeFailure)) return;
    live.clear();
    setIntroOpen(true);
    // Only when a take fails so.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeStatus, takeFailure]);
  const micStatus = live.mic;
  useEffect(() => {
    // Recite again starts the next take at once (the mic is starting): its own end tells the latest recording.
    if (!takeSaved || takeStatus !== 'idle' || micStatus !== 'off') return;
    setSavedRecording(takeSaved);
    setTakeSaved(null);
  }, [takeSaved, takeStatus, micStatus]);
  const pageMarks = useCallback(
    (page: number) => (checkTake && qw ? marksOnPage(live.state, qw, page) : []),
    [checkTake, qw, live.state],
  );
  // The hidden view: covers and guide lines only, no band on any line (lib/reciteLive's LiveOverlay).
  const coverColors = useMemo(() => ({ cover: palette.pageBg, guide: palette.textSecondary }), [palette]);
  // Recite's three highlight colours (theme/v2: markWord…), each with its firmer shade for the mark a card is open for.
  const markColours = useMemo(
    () => ({
      word: { fill: v2.markWord, firm: v2.markWordFirm },
      slip: { fill: v2.markSlip, firm: v2.markSlipFirm },
      tajweed: { fill: v2.markTajweed, firm: v2.markTajweedFirm },
    }),
    [v2],
  );
  const pageUnderlay = useMemo(
    () =>
      showing && qw
        ? (page: number, scale: number) => (
            <LiveUnderlay
              page={page}
              scale={scale}
              words={qw}
              cursor={null}
              marks={shownOnPage(page)}
              selected={shownCardMarks[0] ?? null}
              hidden={false}
              colors={{ band: v2.followBand, word: v2.followWord, marks: markColours }}
            />
          )
        : showPast && qw
        ? (page: number, scale: number) => (
            <RememberedUnderlay
              page={page}
              scale={scale}
              words={qw}
              memories={pastOnPage(page)}
              selected={pastAt?.w ?? null}
              colours={v2}
              isDark={isDark}
            />
          )
        : liveOn && qw && live.active
        ? (page: number, scale: number) => (
            <LiveUnderlay
              page={page}
              scale={scale}
              words={qw}
              cursor={live.state.status === 'listening' ? live.state.cursor : null}
              marks={pageMarks(page)}
              selected={cardMarks[0] ?? null}
              hidden={hidden}
              colors={{ band: v2.followBand, word: v2.followWord, marks: markColours }}
            />
          )
        : undefined,
    [liveOn, qw, live.active, live.state, v2, cardMarks, pageMarks, hidden, markColours, showPast, pastOnPage, pastAt, isDark, showing, shownOnPage, shownCardMarks],
  );
  // The next word's cover turns red while something else is being said in its slot (the checker's `off`, draft 7).
  const offWord = live.state.off?.w ?? null;
  // Peeked words in quiet grey while the take lasts, but for one with a mistake (its highlight shows as it is).
  const veiled = useMemo(() => {
    if (!live.active || peeked.size === 0) return [];
    const marked = new Set(Object.values(live.state.marks).map((m) => m.w));
    return [...peeked].filter((w) => !marked.has(w));
  }, [live.active, peeked, live.state.marks]);
  const pageOverlay = useMemo(
    () =>
      liveOn && qw && (hidden || veiled.length > 0)
        ? (page: number, scale: number) => (
            <LiveOverlay
              page={page}
              scale={scale}
              hidden={
                hidden
                  ? {
                      follow: hiddenFollow(qw, revealed, liveInfo),
                      ...coverColors,
                      off: offWord != null ? { w: offWord, words: qw, colour: v2.markWord } : null,
                    }
                  : null
              }
              peeked={veiled.length ? { words: qw, peeked: veiled, veil: palette.peekVeil } : null}
            />
          )
        : undefined,
    [liveOn, qw, hidden, revealed, liveInfo, coverColors, offWord, v2, veiled, palette],
  );
  // The marks as elements of their own (VoiceOver, the tests). Given whenever the live UI is on, so the pager's pages
  // keep one shape through takes.
  const pageAccessories = useMemo(
    () =>
      liveOn && qw
        ? (page: number, scale: number) => (
            <>
              <LiveMarkTargets page={page} scale={scale} words={qw} marks={showing ? shownOnPage(page) : pageMarks(page)} />
              <RememberedTargets page={page} scale={scale} words={qw} memories={pastOnPage(page)} />
            </>
          )
        : undefined,
    [liveOn, qw, pageMarks, pastOnPage, showing, shownOnPage],
  );

  const liveStatus = live.state.status;
  // An immersive page (Majd, Nov 15 2026; Tarteel's): during a take a tap on the page puts the header and the bar away
  // too, leaving the page, the juz and surah above it and the take's time beside its number. The status bar stays (the
  // time and battery). A tap brings them back, and so do a mark's card and the take's end. With VoiceOver or TalkBack
  // the bar never goes, so Stop is always there.
  const [takeImmersive, setTakeImmersive] = useState(false);
  const takeListening = liveStatus === 'connecting' || liveStatus === 'listening';
  useEffect(() => {
    if (!takeListening || cardAt) setTakeImmersive(false);
  }, [takeListening, cardAt]);
  const immersive = takeImmersive && takeListening && !screenReader && !cardAt;
  const chromeShown = modeMenu || (live.active ? !immersive : chrome.visible);
  const onTapReader = useCallback(() => {
    if (takeListening && !screenReader) {
      dismissHint();
      setTakeImmersive((v) => !v);
      return;
    }
    onTapPage();
  }, [takeListening, screenReader, dismissHint, onTapPage]);
  const barPhase: 'live' | 'checking' | 'done' =
    liveStatus === 'checking' ? 'checking' : liveStatus === 'done' || liveStatus === 'failed' ? 'done' : 'live';
  const baseStatus =
    liveStatus === 'connecting'
      ? 'Starting…'
      : liveStatus === 'checking'
        ? 'Checking…'
        : liveStatus === 'failed'
          ? LIVE_FAILURE[live.state.failure ?? 'server']
          : liveStatus === 'done'
            ? 'Done'
            : 'Listening…';
  // In a test: which place it is, and once it's done, how it went ("Clean · 2 of 5").
  const placeResult = test && liveStatus === 'done' ? test.results[test.at] : undefined;
  const barStatus = test
    ? `${placeResult ? outcomeText(placeResult) : baseStatus} · ${test.at + 1} of ${test.places.length}`
    : baseStatus;

  // Previous / next go when the capsule is crowded (a recording, a timer) on
  // anything narrower than the largest phones.
  const crowded = recorder.phase !== 'idle' || timer != null;
  // Recording: the recorder is the whole capsule, the timer beside it (compact).
  const recordingLive = recorderTakesCapsule(recorder);
  const compact = (width < 430 && crowded) || (recordingLive && timer != null);

  return (
    <View style={styles.container}>
      <ReaderFrame
        chromeVisible={chromeShown}
        keepStatusBar={live.active}
        active={isScreenFocused}
        onBackgroundPress={onTapReader}
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
              // While a take is open: how Recite works (Revisely Dev); otherwise the reader's own help.
              screen={live.active ? 'recite' : 'reader'}
              liveRecite={liveOn}
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
            {live.active && qw ? (
              <ReciteBar
                hidden={hidden}
                onToggleHidden={toggleHidden}
                onNextWord={showNextWord}
                onWholeAyah={showWholeAyah}
                score={checkTake ? scorePill(live.state, qw, live.startWord) : null}
                seconds={live.seconds}
                recording={live.recording && live.mic === 'on'}
                // A test's place, once done, says how it went in the words' place.
                words={placeResult ? [] : barWords(live.state, qw, { check: checkTake, startWord: live.startWord })}
                status={barStatus}
                phase={barPhase}
                paused={live.paused}
                onPause={() => void live.pause()}
                onResume={() => void live.resume()}
                onStop={live.stop}
                onClose={() => {
                  if (test) {
                    endTest(test.results);
                    return;
                  }
                  setCardAt(null);
                  setSummaryShown(null);
                  live.clear();
                }}
                next={
                  test && placeResult && test.at + 1 < test.places.length
                    ? { label: `Next place, ${test.at + 2} of ${test.places.length}`, onPress: nextPlace }
                    : undefined
                }
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
          live.active ? (
            <TakeActivity seconds={live.seconds} recording={live.recording && live.mic === 'on'} onPress={() => setTakeImmersive(false)} />
          ) : (
            <ReaderActivity recorder={recorder} playback={verseActions.player.state} onPress={chrome.show} />
          )
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
            (live.state.status === 'connecting' || live.state.status === 'listening' || live.state.status === 'checking' ? null : searchHighlight)
          }
          onTap={onTapReader}
          onUserSwipe={chrome.hide}
          pageUnderlay={pageUnderlay}
          pageOverlay={pageOverlay}
          pageAccessories={pageAccessories}
          onTapPoint={onTapPoint}
          extraData={liveOn ? `${live.state.cursor}|${live.state.saidUpTo}|${Object.keys(live.state.marks).length}|${hidden}|${revealed.size}|${offWord}|${veiled.length}|${showPast ? memoryRecords.length : -1}|${pastAt?.w ?? ''}|${showing ? `${shownTake?.id}:${shownTake?.marks.length}` : ''}|${shownCardAt?.w ?? ''}` : undefined}
        />
      </ReaderFrame>

      <RecordingSavedToast
        saved={savedRecording}
        onClose={() => setSavedRecording(null)}
        quiet={live.mic === 'on'}
        // At the bottom of the room under the page, never over the text.
        bottomInset={insets.bottom - spacing.sm}
      />

      <SittingSavedToast saved={sittingSaved} onClose={() => setSittingSaved(null)} bottomInset={insets.bottom - spacing.sm} />

      {liveOn ? (
        <UndoToast
          visible={undoFor != null}
          message="Marked not a mistake"
          duration={undoMs(screenReader)}
          onUndo={() => {
            const id = undoFor;
            setUndoFor(null);
            if (id) live.restore(id);
          }}
          onDismiss={() => setUndoFor(null)}
          // Above the recite bar.
          bottomInset={insets.bottom + spacing.sm + CAPSULE_HEIGHT + spacing.sm}
        />
      ) : null}

      <HelpToast screen="reader" bottomInset={insets.bottom - spacing.sm} />
      {verseActions.overlay}
      {liveOn ? (
        <>
          <ReciteModeMenu
            visible={modeMenu}
            mode={reciteSettings.mode}
            markMistakes={markMistakes}
            owned={owned}
            bottom={insets.bottom + spacing.sm + CAPSULE_HEIGHT + spacing.sm}
            right={spacing.sm + 2}
            onPick={pickMode}
            onMarkMistakes={setMarkMistakes}
            onLocked={() => {
              setModeMenu(false);
              setIntroOpen(true);
            }}
            onTest={() => {
              setModeMenu(false);
              setTestPick(true);
            }}
            testReady={testableJuz.length > 0}
            onClose={() => setModeMenu(false)}
            drill={menuDrill}
            onDrill={drillHere}
          />
          <TestMeScopeSheet visible={testPick} juz={testableJuz} onStart={startTest} onClose={() => setTestPick(false)} />
          <TestSummarySheet
            visible={testSummary != null}
            results={testSummary?.results ?? []}
            onPlace={(r) => {
              setTestSummary(null);
              setHidden(false);
              if (qw) pagerRef.current?.scrollToPage(qw.pageOf(r.place.cue[0]));
            }}
            onAgain={() => startTest(testSummary?.juz ?? null)}
            onDone={() => setTestSummary(null)}
          />
          {qw ? (
            <MarkCard
              marks={cardMarks}
              words={qw}
              anchor={cardAt?.anchor ?? null}
              onDismiss={(id) => {
                live.dismiss(id);
                setUndoFor(id);
                if (live.mic !== 'on') say('Marked not a mistake. Undo is at the bottom of the screen.');
              }}
              // The reciter's ayah on the card's own player (lib/reciteLive/hearAudio): a take still listening pauses first,
              // so it isn't ended and its microphone doesn't hear the reciter (Majd, Nov 15 2026).
              onHear={async (m) => {
                if (live.state.status === 'listening' && live.mic === 'on') await live.pause();
                void playReference({ sura: m.ayah[0], ayah: m.ayah[1] });
              }}
              // The reciter's own voice at the mark, from the take kept on the phone (Majd: Tarteel plays both).
              onYours={
                cardMarks[0] && live.hasClip(cardMarks[0])
                  ? async (m) => {
                      if (live.state.status === 'listening' && live.mic === 'on') await live.pause();
                      const pcm = live.clipFor(m);
                      if (pcm) void playClip(pcm);
                    }
                  : undefined
              }
              onSimilar={(m) => {
                setCardAt(null);
                setSimilarFor(m.w);
              }}
              hasSimilar={cardHasSimilar}
              onClose={() => setCardAt(null)}
            />
          ) : null}
          {qw ? (
            <WordHistoryCard
              memory={pastMemory}
              words={qw}
              anchor={pastAt?.anchor ?? null}
              now={Date.now()}
              today={today ?? null}
              canPlay={(a) => a.t != null && a.take.recordingId != null && takeRecordings.has(a.take.recordingId)}
              onPlay={(a) => {
                if (a.t == null || !a.take.recordingId) return;
                void clipOfTake(a.take.recordingId, a.t).then((pcm) => (pcm ? playClip(pcm) : undefined));
              }}
              onClear={clearPast}
              onHear={(m) => {
                if (m.lastMark) void playReference({ sura: m.lastMark.ayah[0], ayah: m.lastMark.ayah[1] });
              }}
              onSimilar={(m) => {
                setPastAt(null);
                setSimilarFor(m.w);
              }}
              hasSimilar={pastHasSimilar}
              onSeeAll={(m) => {
                const t = m.attempts[m.attempts.length - 1]?.take;
                setPastAt(null);
                if (t) setProgressFor({ from: t.from, to: t.to, back: null });
              }}
              onClose={() => setPastAt(null)}
            />
          ) : null}
          {showing && shownTake ? (
            <ShownTakeBar take={shownTake} now={Date.now()} bottom={insets.bottom + spacing.sm + CAPSULE_HEIGHT + spacing.sm} onDone={endShowing} />
          ) : null}
          {qw && showing ? (
            <MarkCard
              marks={shownCardMarks}
              words={qw}
              anchor={shownCardAt?.anchor ?? null}
              onDismiss={dismissShown}
              onHear={(m) => void playReference({ sura: m.ayah[0], ayah: m.ayah[1] })}
              onYours={
                shownCardMarks[0]?.t && shownTake?.recordingId && takeRecordings.has(shownTake.recordingId)
                  ? (m) => {
                      if (m.t && shownTake?.recordingId) void clipOfTake(shownTake.recordingId, m.t[0]).then((pcm) => (pcm ? playClip(pcm) : undefined));
                    }
                  : undefined
              }
              onSimilar={(m) => {
                setShownCardAt(null);
                setSimilarFor(m.w);
              }}
              hasSimilar={qw && shownCardAt ? similarPhrases(qw, shownCardAt.w).length > 0 : false}
              onClose={() => setShownCardAt(null)}
            />
          ) : null}
          <PassageProgressSheet
            visible={progressFor != null}
            words={qw}
            from={progressFor?.from ?? 0}
            to={progressFor?.to ?? 0}
            takes={progressTakes}
            memories={memories}
            now={Date.now()}
            onOpenTake={(t) => {
              setProgressFor(null);
              setSummaryShown(null);
              setPastAt(null);
              if (live.active) live.clear();
              setShowTakeId(t.id);
              if (qw) pagerRef.current?.scrollToPage(qw.pageOf(t.from));
            }}
            onClose={() => {
              const back = progressFor?.back;
              setProgressFor(null);
              if (back === 'summary' && live.state.status === 'done' && takeId) setSummaryShown(takeId);
            }}
          />
          <UndoToast
            visible={clearedUndo != null}
            message="Cleared from the page"
            duration={undoMs(screenReader)}
            onUndo={() => {
              const r = clearedUndo;
              setClearedUndo(null);
              if (r && user?.id) remember(user.id, { ...r, rev: Date.now(), deleted: true }).catch(() => undefined);
            }}
            onDismiss={() => setClearedUndo(null)}
            bottomInset={insets.bottom - spacing.sm}
          />
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
            // What was recited: the furthest word reached. The final answer's `to` is the passage's end (exclusive): the
            // end of the starting surah when no end ayah is sent, so a take of two ayat read as the whole surah and the
            // next one's first ayah ("An-Naml 23 to Al-Qasas 1").
            to={furthestWord(live.state)}
            seconds={live.seconds}
            marks={Object.values(live.state.marks).sort((a, b) => a.w - b.w)}
            score={checkTake && qw ? scorePill(live.state, qw, live.startWord) : null}
            kept={live.testData}
            removed={removedMarks(live.state)}
            onPutBack={(id) => {
              if (undoFor === id) setUndoFor(null);
              const m = live.state.removed[id]?.mark;
              live.restore(id);
              // The row it was on goes: say where it went.
              if (m) say(`${markTitle(m)} put back`);
            }}
            checkOwned={owned}
            onFinding={(m) => {
              setSummaryShown(null);
              if (!qw) return;
              pagerRef.current?.scrollToPage(qw.pageOf(m.w));
              setCardAt({ w: m.w, anchor: { x: width / 2, y: insets.top + 120, width: 1, height: 1 } });
            }}
            onInto={(into) => {
              // That ayah, highlighted as a search result is, until the page is turned (once its page is the one shown).
              setSummaryShown(null);
              setCardAt(null);
              const target = toAyahRef({ sura: into.ayah[0], ayah: into.ayah[1] });
              setIntoTarget(target);
              pagerRef.current?.scrollToPage(target.page);
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
            onDrill={() => {
              const marks = Object.values(live.state.marks);
              const peekedAyahs = qw ? peekedByAyah(qw, peeked).map((p) => p.ayah) : [];
              const range = drillRange(marks, peekedAyahs);
              if (!range) return;
              setSummaryShown(null);
              setCardAt(null);
              live.clear();
              setRevealed(NOTHING_SHOWN);
              setDrillBefore([findingsLine(drillMarks(marks)), peeked.size ? peekedLine(peeked.size) : ''].filter(Boolean).join(', '));
              setPeeked(NOTHING_PEEKED);
              void live.start('check', range);
            }}
            before={drillBefore}
            memory={checkTake ? summaryMemory : null}
            onProgress={() => {
              if (!takeRecord) return;
              setSummaryShown(null);
              setProgressFor({ from: takeRecord.from, to: takeRecord.to, back: 'summary' });
            }}
            peeked={qw ? peekedByAyah(qw, peeked) : []}
            onPeeked={(w) => {
              setSummaryShown(null);
              if (qw) pagerRef.current?.scrollToPage(qw.pageOf(w));
            }}
            onDone={() => setSummaryShown(null)}
            // The summary is on screen: the take's Stop trace ends (lib/reciteLive/stopTrace).
            onShown={() => stopTrace.end()}
          />
          <CheckIntroPage
            visible={introOpen}
            getting={gettingPremium}
            onGet={getPremium}
            onSupport={applyForSupport}
            onClose={() => setIntroOpen(false)}
          />
          <ReciteNoticeSheet
            visible={noticeFor != null}
            onAgree={() => {
              const asked = noticeFor;
              setReciteCheckSettings(user?.id, { noticeSeen: true });
              setNoticeFor(null);
              if (asked) {
                setRevealed(asked.reveal);
                setPeeked(NOTHING_PEEKED);
                void live.start(asked.mode, asked.span);
              }
            }}
            onClose={() => {
              // A stretch's take that never started (Recite your mistakes here) leaves no "Before:" behind.
              if (noticeFor?.span) setDrillBefore(null);
              setNoticeFor(null);
            }}
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
