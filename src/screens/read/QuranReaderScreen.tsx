import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useIsFocused, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MushafPager, MushafPagerHandle } from '../../components/MushafPager';
import { MushafScrubber } from '../../components/MushafScrubber';
import { useVerseActions } from '../../components/verse/useVerseActions';
import { navigateToActivityDay } from '../../navigation/navigationRef';
import { RecordingSavedToast, SavedRecording } from '../../components/recordings/RecordingSavedToast';
import { releaseUpload } from '../../lib/recordings';
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
import { reciteLiveEnabled } from '../../lib/reciteLive/availability';
import { premiumErrorText, setDevPremium, supportLinkUrl, usePremium } from '../../lib/premium';
import { setReciteCheckSettings, useReciteCheckSettings } from '../../lib/reciteCheck/settings';
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
} from '../../lib/reciteLive/view';
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
import { drillMarks, drillRange } from '../../lib/reciteLive/drill';
import { CheckIntroPage } from '../../components/reciteLive/CheckIntroPage';
import { markAt, wordBox } from '../../lib/reciteLive/geometry';
import { similarPhrases } from '../../lib/reciteLive/similar';
import type { Mark } from '../../lib/reciteLive/contract';
import type { Box } from '../../components/verse/menuPlacement';
import { playClip, playReference, stopHearing } from '../../lib/reciteLive/hearAudio';
import { useKeepCheckerWarm } from '../../components/reciteLive/useKeepCheckerWarm';
import { needsPremium, type LiveFailure } from '../../lib/reciteLive/contract';
import { logger } from '../../lib/logger';
import { useRememberTake } from '../../components/reciteMemory/useRememberTake';
import { useMemoryRecords } from '../../lib/reciteMemory/store';

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
  // After ending a recording: "Recording saved · Undo · View" (View opens it in Activity).
  const [savedRecording, setSavedRecording] = useState<SavedRecording | null>(null);
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
      // Its note is the sitting's, with no Undo: it uploads now.
      else releaseUpload(info.recordingId);
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
  noteTakeRecording.current = useRememberTake({
    uid: user?.id,
    enabled: liveOn,
    live,
    hidden,
    day: today ?? null,
    level: reciteSettings.level === 'strict' ? 'strict' : 'words',
    records: memoryRecords,
  }).noteRecording;
  const [modeMenu, setModeMenu] = useState(false);
  const [noticeFor, setNoticeFor] = useState<LiveMode | null>(null);
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
  const liveInfo = useMemo(
    () => ({ saidUpTo: furthestWord(live.state), startWord: live.startWord, cursor: live.state.cursor }),
    [live.state, live.startWord],
  );

  // Recite the mistakes again: what the take before found in the stretch, for its summary ("Before: …").
  const [drillBefore, setDrillBefore] = useState<string | null>(null);
  const startMode = useCallback(
    (mode: ReciteMicMode) => {
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
        setNoticeFor(mode);
        return;
      }
      setRevealed(NOTHING_SHOWN);
      setDrillBefore(null);
      void live.start(mode);
    },
    [recorder, owned, reciteSettings.noticeSeen, live],
  );
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
  const showNextWord = useCallback(() => {
    if (!qw) return;
    const next = revealNextWord(qw, currentPage, revealed, liveInfo);
    const added = [...next].find((w) => !revealed.has(w));
    if (added == null) return;
    live.hint(added, 'word');
    setRevealed(next);
  }, [qw, currentPage, revealed, liveInfo, live]);
  const showWholeAyah = useCallback(() => {
    if (!qw) return;
    const next = revealAyah(qw, currentPage, revealed, liveInfo);
    const added = [...next].find((w) => !revealed.has(w));
    if (added == null) return;
    live.hint(added, 'ayah');
    setRevealed(next);
  }, [qw, currentPage, revealed, liveInfo, live]);

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
  const [summaryShown, setSummaryShown] = useState<string | null>(null);
  // A new take may get the id of the one before (E2E's recorded takes all do): its summary must still show.
  useEffect(() => {
    if (live.state.status === 'connecting') setSummaryFor(null);
  }, [live.state.status]);
  useEffect(() => {
    if (live.state.status !== 'done' || !takeId || summaryFor === takeId) return;
    setSummaryFor(takeId);
    // The checker never found where the reciter started: it fails silently (Majd, Nov 14 2026). No summary or
    // message; Stop just ends the take.
    if (startNotFound(live.state)) {
      live.clear();
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
      liveOn && qw && live.active
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
    [liveOn, qw, live.active, live.state, v2, cardMarks, pageMarks, hidden, markColours],
  );
  const pageOverlay = useMemo(
    () =>
      liveOn && qw && hidden
        ? (page: number, scale: number) => (
            <LiveOverlay page={page} scale={scale} hidden={{ follow: hiddenFollow(qw, revealed, liveInfo), ...coverColors }} />
          )
        : undefined,
    [liveOn, qw, hidden, revealed, liveInfo, coverColors],
  );
  // The marks as elements of their own (VoiceOver, the tests). Given whenever the live UI is on, so the pager's pages
  // keep one shape through takes.
  const pageAccessories = useMemo(
    () =>
      liveOn && qw
        ? (page: number, scale: number) => <LiveMarkTargets page={page} scale={scale} words={qw} marks={pageMarks(page)} />
        : undefined,
    [liveOn, qw, pageMarks],
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
                recording={live.recording && live.mic === 'on'}
                words={barWords(live.state, qw, { check: checkTake, startWord: live.startWord })}
                status={barStatus}
                phase={barPhase}
                paused={live.paused}
                onPause={() => void live.pause()}
                onResume={() => void live.resume()}
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
          pageAccessories={pageAccessories}
          onTapPoint={onTapPoint}
          extraData={liveOn ? `${live.state.cursor}|${live.state.saidUpTo}|${Object.keys(live.state.marks).length}|${hidden}|${revealed.size}` : undefined}
        />
      </ReaderFrame>

      <RecordingSavedToast
        saved={savedRecording}
        onClose={() => setSavedRecording(null)}
        quiet={live.mic === 'on'}
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
            onClose={() => setModeMenu(false)}
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
              const range = drillRange(marks);
              if (!range) return;
              setSummaryShown(null);
              setCardAt(null);
              live.clear();
              setRevealed(NOTHING_SHOWN);
              setDrillBefore(findingsLine(drillMarks(marks)));
              void live.start('check', range);
            }}
            before={drillBefore}
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
