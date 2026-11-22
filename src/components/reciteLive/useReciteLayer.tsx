// Recite on a page of the mushaf (Revisely Dev): the one mic and everything a take brings, for any screen with a
// MushafPager. The reader has it on every page; a revision session on its day's pages (Majd, Nov 17 2026: "add the
// mistake detection and mic functionality same as mushaf to the revision sessions themselves").
//
// What it holds: the mic and its held menu (Record, Recite, Mark mistakes, Recite your N mistakes here, Test me), the
// take's bar, the page's layers (the cursor, the marks, the hidden view, peeked words, past mistakes, a past take shown),
// the mark and word cards, the summary, Recite the mistakes again, Test me, the AI notice and the Premium page.
//
// What the screen keeps: its pager, header, player, recorder and timer. It gives the pager `pager`'s props, puts `bar`
// in its footer during a take (else its player, with `controls` in the record slot while the recorder is idle), and
// renders `sheets` last.
//
// A take never marks a session's page revised: its own page turns go through `showPage` (MushafPager's scrollToPage,
// which never reports an advance), so only the session's swipe or ✓ marks a page (RECITE-9, SESS-1).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { getReadPalette } from '../../theme/readPalette';
import { spacing } from '../../theme/spacing';
import { CAPSULE_HEIGHT } from '../reader/PlayerCapsule';
import { UndoToast } from '../revision/UndoToast';
import { toAyahRef } from '../../lib/verses';
import { ayahKey, ayahsBetween } from '../../lib/ayahKeys';
import type { AyahRef } from '../../lib/ayahBounds';
import { useMushafEdition } from '../../lib/mushafEdition';
import { openWebPage } from '../../lib/openWebPage';
import { reciteLiveEnabled } from '../../lib/reciteLive/availability';
import { isDevVariant } from '../../lib/variant';
import { premiumErrorText, setDevPremium, supportLinkUrl, usePremium } from '../../lib/premium';
import { claimEarlyAccess, useEarlyAccess } from '../../lib/earlyAccess';
import { checkLevel, setReciteCheckSettings, useReciteCheckSettings } from '../../lib/reciteCheck/settings';
import { loadQuranWords, getQuranWords, QuranWords } from '../../lib/recite/quranWords';
import {
  furthestWord,
  isUnfinished,
  marksOnPage,
  removedMarks,
  startNotFound,
  shownUpTo,
  revealDelay,
  wordLetters,
  VOICE_SAID_PROTOCOL,
} from '../../lib/reciteLive/state';
import { stopTrace } from '../../lib/reciteLive/stopTrace';
import {
  barWords,
  hiddenFollow,
  coverHighlights,
  NOTHING_SHOWN,
  revealAyah,
  revealNextWord,
  Revealed,
  scorePill,
  scoreTapOpens,
  wordShown,
} from '../../lib/reciteLive/view';
import { NOTHING_PEEKED, Peeked, peekedByAyah, peekedLine } from '../../lib/reciteLive/peeked';
import { LiveMode, useLiveRecitation } from './useLiveRecitation';
import { ReciteMic, ReciteMicMode } from './ReciteMic';
import { ReciteMenuMode, ReciteModeMenu } from './ReciteModeMenu';
import { BarButton, ReciteBar } from './ReciteBar';
import { LiveMarkTargets, LiveOverlay, LiveUnderlay } from './LivePageLayers';
import { ReciteNoticeSheet } from './ReciteNoticeSheet';
import { MarkCard } from './MarkCard';
import { SimilarPhrasesSheet } from './SimilarPhrasesSheet';
import { findingsLine, TakeSummarySheet } from './TakeSummarySheet';
import { say, undoMs, useScreenReaderOn } from './a11y';
import { navigateToActivityDay } from '../../navigation/navigationRef';
import { markTitle } from '../../lib/reciteLive/describe';
import { drillMarks, drillRange, openDrill } from '../../lib/reciteLive/drill';
import { describeAyahs } from '../../lib/passages';
import { TakeSpan } from '../../lib/reciteLive/span';
import { TestPlace, testJuz, testPlaces, TestResult, testResult } from '../../lib/reciteLive/testMe';
import { memorizedAyahs } from '../../lib/memorizedAyahs';
import { outcomeText, TestMeScopeSheet, TestSummarySheet } from './TestMeSheets';
import { CheckIntroPage } from './CheckIntroPage';
import { TakeActivity } from './TakeActivity';
import { markAt, wordBox } from '../../lib/reciteLive/geometry';
import { similarPhrases } from '../../lib/reciteLive/similar';
import type { Mark } from '../../lib/reciteLive/contract';
import type { Box } from '../verse/menuPlacement';
import { playClip, playReference, stopHearing } from '../../lib/reciteLive/hearAudio';
import { useKeepCheckerWarm } from './useKeepCheckerWarm';
import { countsAsMistake, isUnclear, type LiveFailure, markGroup, needsPremium } from '../../lib/reciteLive/contract';
import { logger } from '../../lib/logger';
import { useRememberTake } from '../reciteMemory/useRememberTake';
import { remember, useMemoryRecords } from '../../lib/reciteMemory/store';
import { clearedBy, memoryOfWord, openInRange, wordMemories, type WordMemory } from '../../lib/reciteMemory/memory';
import { passageTakes, progressLine } from '../../lib/reciteMemory/progress';
import { PassageProgressSheet } from '../reciteMemory/PassageProgressSheet';
import { memoryId, type ClearRecord } from '../../lib/reciteMemory/record';
import { clipOfTake, useTakeRecordings } from '../../lib/reciteMemory/takeAudio';
import { markOf, PAST_OPACITY, RememberedTargets, RememberedUnderlay } from '../reciteMemory/RememberedLayers';
import { markFill } from './markColours';
import { WordHistoryCard } from '../reciteMemory/WordHistoryCard';
import { ShownTakeBar } from '../reciteMemory/ShownTakeBar';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { pageAccuracy } from '../../lib/reciteLive/score';
import { sendLabel } from '../../lib/reciteCheck/service';
import { t } from '../../i18n';
import type { Strings } from '../../i18n/en';

/** What the recite bar says when a take ends without its answer (src/i18n/en/reciteLive.ts, `failure`). */
const LIVE_FAILURE: Record<LiveFailure, keyof Strings['reciteLive']['failure']> = {
  sign_in: 'signIn',
  testers_only: 'testersOnly',
  limit: 'limit',
  too_long: 'tooLong',
  idle: 'idle',
  bad_request: 'cantStart',
  server: 'server',
  check_locked: 'needsPremium',
  premium_required: 'needsPremium',
  // Never shown in practice: the socket moves such a take to recite-check (lib/reciteLive/socket).
  level_elsewhere: 'cantStart',
  // Production's checker (recite-server-prod-plan.md): its switch, every instance busy, and App Check.
  paused: 'paused',
  busy: 'busy',
  app_check: 'appCheck',
  offline: 'offline',
};

/** A place the screen's pager doesn't hold, for the reader to open (a session holds its day's pages only). */
export interface ElsewherePlace {
  page: number;
  /** An ayah a take slipped into, highlighted there. */
  highlight?: { sura: number; ayah: number };
  /** A past take, shown on its page. */
  showTake?: string;
}

export interface ReciteLayerOptions {
  /** The page on screen. */
  currentPage: number;
  /** Turns the pager to a page; false when the pager doesn't hold it (MushafPager's scrollToPage). */
  showPage: (page: number) => boolean;
  /** A place the pager doesn't hold (a similar ayah, a past take, a test's place): the reader opens there. */
  openElsewhere?: (place: ElsewherePlace) => void;
  /** The revision day: a take's recording and its record in Recite's memory are the day's. */
  day: string | null;
  /** The screen is in front (the checker is kept warm only then). */
  focused: boolean;
  /** The screen's recorder: Record (the held mic's menu) starts it, and the mic stands in for its button while idle. */
  recorder: { phase: string; start: () => Promise<unknown> | unknown };
  /** The screen's controls, shown or put away (a tap on the page). */
  chromeVisible: boolean;
  /** The screen's own tap on the page; while a take listens, a tap makes the page immersive instead. */
  onTapPage: () => void;
  /** The "Tap the page for the controls" hint goes with the first tap. */
  dismissHint: () => void;
  /** An ayah a take slipped into (the summary's "You continued with …"), on a page the pager holds: the screen highlights it. */
  onInto: (target: AyahRef) => void;
  /** Test me (places anywhere in what's memorized) in the held mic's menu: the reader's, not a session's. */
  testMe?: boolean;
  /** A past take to show on its page (Activity's Show on the page), and the screen told when showing it ends. */
  showTake?: string | null;
  onShowTakeEnd?: () => void;
}

export function useReciteLayer({
  currentPage,
  showPage,
  openElsewhere,
  day,
  focused,
  recorder,
  chromeVisible,
  onTapPage,
  dismissHint,
  onInto,
  testMe = true,
  showTake = null,
  onShowTakeEnd,
}: ReciteLayerOptions) {
  const { user, pages } = useApp();
  const { isDark, palette: v2 } = useTheme();
  const palette = getReadPalette(isDark);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const edition = useMushafEdition();
  const onShowTakeEndRef = useRef(onShowTakeEnd);
  onShowTakeEndRef.current = onShowTakeEnd;
  /** A page: turned to when the pager holds it, otherwise opened in the reader. */
  const goTo = useCallback(
    (page: number) => {
      if (showPage(page) === false) openElsewhere?.({ page });
    },
    [showPage, openElsewhere],
  );

  // ===== The one mic: Record, Recite, Check (Revisely Dev, testers, the 1405 print) =====
  const liveOn = reciteLiveEnabled(user, edition);
  const reciteSettings = useReciteCheckSettings(user?.id);
  // Marking mistakes needs Premium: the account's grant (lib/premium; apply-support's contract draft 2).
  const premium = usePremium(user?.id, liveOn);
  const owned = premium.has;
  const [gettingPremium, setGettingPremium] = useState(false);
  // Premium early access (lib/earlyAccess, PREM-1): every account has it for nothing, kept for life. Get Premium then
  // gives it at once (an account the sign-up grant hasn't reached), and Apply for support is hidden.
  const earlyAccessOn = useEarlyAccess();
  // Revisely Dev: Premium is free (nothing is charged); it says so before turning it on.
  const getPremium = useCallback(() => {
    if (earlyAccessOn) {
      setGettingPremium(true);
      claimEarlyAccess()
        .then((on) => {
          if (on) setIntroOpen(false);
        })
        .catch((err) => Alert.alert(t('reciteLive.layer.premiumFailed'), premiumErrorText(err)))
        .finally(() => setGettingPremium(false));
      return;
    }
    Alert.alert(t('reciteLive.layer.devPremiumTitle'), t('reciteLive.layer.devPremiumBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('reciteLive.layer.turnOn'),
        onPress: () => {
          setGettingPremium(true);
          setDevPremium(true)
            .then((on) => {
              if (on) setIntroOpen(false);
            })
            .catch((err) => Alert.alert(t('reciteLive.layer.premiumFailed'), premiumErrorText(err)))
            .finally(() => setGettingPremium(false));
        },
      },
    ]);
  }, [earlyAccessOn]);
  // "Can't afford it? Apply for support": the program's page, opened with a one-time link for this account.
  const applyForSupport = useCallback(() => {
    // The in-app browser, else the phone's, else the address to copy (LINK-1): only getting the link can fail here.
    supportLinkUrl()
      .then((url) => openWebPage(url))
      .catch((err) => Alert.alert(t('reciteLive.layer.support'), premiumErrorText(err)));
  }, []);
  // A take's audio stays with the take (RMEM-6: never a recording, so no "Recording saved" note): its record notes it.
  const live = useLiveRecitation({
    settings: reciteSettings,
    currentPage,
    onShowPage: showPage,
    recordingDay: day,
    onRecordingSaved: (saved) => noteTakeRecording.current(saved),
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
    day,
    level: checkLevel(reciteSettings),
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
  useKeepCheckerWarm(liveOn && focused, takeBusy);
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
  // The word under the cursor, once it has been there about as long as it takes to say (revealDelay: its letters at the
  // reciter's pace, 0.7–2.5 s) while the take listens: a hidden page shows it then (Majd, Nov 22 2026: "under one second
  // max"), and a held madd isn't shown before its end.
  const [heldCursor, setHeldCursor] = useState<number | null>(null);
  const cursorNow = live.state.cursor;
  const listeningNow = live.state.status === 'listening' && !live.paused;
  // The reciter's pace: each step of the cursor to the next word, per letter of the word left (the last 20).
  const pace = useRef<{ w: number | null; at: number; perLetter: number[] }>({ w: null, at: 0, perLetter: [] });
  const paceTake = live.state.take;
  useEffect(() => {
    pace.current = { w: null, at: 0, perLetter: [] };
  }, [paceTake]);
  useEffect(() => {
    setHeldCursor(null);
    if (cursorNow == null || !listeningNow || !qw) return;
    const now = Date.now();
    const p = pace.current;
    if (p.w != null && cursorNow === p.w + 1) {
      p.perLetter = [...p.perLetter, (now - p.at) / wordLetters(qw.uthmani(p.w))].slice(-20);
    }
    p.w = cursorNow;
    p.at = now;
    const sorted = [...p.perLetter].sort((a, b) => a - b);
    const median = sorted.length >= 3 ? sorted[Math.floor(sorted.length / 2)] : null;
    // From a checker whose `said` follows the voice, only a late backstop (babble).
    const backstop = (live.state.protocol ?? 0) >= VOICE_SAID_PROTOCOL;
    const id = setTimeout(() => setHeldCursor(cursorNow), revealDelay(wordLetters(qw.uthmani(cursorNow)), median, backstop));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorNow, listeningNow, qw, live.state.protocol]);
  const liveInfo = useMemo(
    () => ({
      // What the hidden page shows (RECITE-6): what's decided or left behind, and the word being said once it has been
      // under the cursor REVEAL_AFTER_MS.
      saidUpTo: shownUpTo(live.state, heldCursor),
      // Before the checker has found the start of a test's place: from the place (‹ shows its third word, not the page's first).
      startWord: live.startWord ?? testPlace?.cue[0] ?? null,
      cursor: live.state.cursor,
    }),
    [live.state, live.startWord, testPlace, heldCursor],
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
  // Not with Settings → Recite → "Show past mistakes" off: the page doesn't show them then (RMEM-3).
  const pageDrill = useMemo(
    () =>
      modeMenu && liveOn && owned && qw && reciteSettings.showPast && memoryRecords.length > 0
        ? openDrill(memoryRecords, qw, currentPage)
        : null,
    [modeMenu, liveOn, owned, qw, reciteSettings.showPast, memoryRecords, currentPage],
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
    setPeeked(NOTHING_PEEKED);
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
  const [showTakeId, setShowTakeId] = useState<string | null>(showTake ?? null);
  const showTakeParam = showTake;
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
    onShowTakeEndRef.current?.();
  }, []);
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
  // The hidden view keeps mistakes on the covers (Majd, Nov 20 2026; RECITE-13): a take's marks in their colour, and the
  // words Recite's memory still holds, lighter (with Show past mistakes on), during a take and outside one.
  // Revisely Dev's until the next release (its Dev guide says so).
  const coversKeepMarks = isDevVariant();
  const pastOnCovers = coversKeepMarks && liveOn && !!qw && hidden && reciteSettings.showPast && !showing;
  const pastOnPage = useCallback(
    (page: number): WordMemory[] => (showPast && qw ? openInRange(memories, ...qw.pageRange(page)) : []),
    [showPast, qw, memories],
  );
  const [pastAt, setPastAt] = useState<{ w: number; anchor: Box } | null>(null);
  useEffect(() => {
    if (!showPast && !pastOnCovers) setPastAt(null);
  }, [showPast, pastOnCovers]);
  // What its card plays stops when the card closes.
  useEffect(() => {
    if (!pastAt) stopHearing();
  }, [pastAt]);
  const takeRecordings = useTakeRecordings(showPast || pastOnCovers || showing);
  const pastMemory = useMemo(() => (pastAt ? memoryOfWord(memories, pastAt.w) : null), [pastAt, memories]);
  const pastHasSimilar = useMemo(() => (qw && pastAt ? similarPhrases(qw, pastAt.w).length > 0 : false), [qw, pastAt]);
  // Clear now can be undone for a few seconds (the clear is a record of its own; Undo forgets it).
  const [clearedUndo, setClearedUndo] = useState<ClearRecord | null>(null);
  const clearPast = useCallback(
    (m: WordMemory) => {
      if (!user?.id) return;
      const now = Date.now();
      const record: ClearRecord = { id: memoryId(), kind: 'clear', createdAt: now, rev: now, day: day ?? m.attempts[m.attempts.length - 1]?.take.day ?? '', w: m.w, group: m.group };
      setPastAt(null);
      setClearedUndo(record);
      remember(user.id, record).catch((err) => logger.warn('Recite memory: Clear now was not kept', err));
    },
    [user?.id, day],
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
  const similar = useMemo(() => (qw && similarFor != null ? similarPhrases(qw, similarFor) : []), [qw, similarFor]);
  const cardHasSimilar = useMemo(() => (qw && cardAt ? similarPhrases(qw, cardAt.w).length > 0 : false), [qw, cardAt]);
  // The summary, once a take has its final answer.
  const takeId = live.state.take;
  const [summaryShown, setSummaryShown] = useState<string | null>(null);
  // The score tapped during the take: what it has found so far (Majd, Nov 21 2026), the take going on.
  const [soFar, setSoFar] = useState(false);
  // A new take may get the id of the one before (E2E's recorded takes all do): its summary must still show.
  useEffect(() => {
    if (live.state.status === 'connecting') {
      setSummaryFor(null);
      setSoFar(false);
    }
  }, [live.state.status]);
  useEffect(() => {
    if (live.state.status !== 'done' || !takeId || summaryFor === takeId) return;
    setSummaryFor(takeId);
    setSoFar(false);
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
      // Said to screen reader users only (everyone else: nothing).
      if (screenReader) say(t('reciteLive.layer.startNotFound'));
      return;
    }
    stopTrace.step('summary-asked');
    setSummaryShown(takeId);
    // Only when a take finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.state.status, takeId]);
  // The microphone refused, or it couldn't start: say so (a tap that did nothing read as a broken mic; Majd's Android
  // store build, Nov 22 2026). Before, neither state showed anything.
  const micNow = live.mic;
  useEffect(() => {
    if (micNow === 'denied') {
      Alert.alert(t('reciteLive.layer.micOffTitle'), t('reciteLive.layer.micOffBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.openSettings'), onPress: () => void Linking.openSettings().catch(() => undefined) },
      ]);
    } else if (micNow === 'error') {
      Alert.alert(t('reciteLive.layer.micFailed'));
    }
  }, [micNow]);
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
              colors={{ band: v2.highlightSoft, word: v2.highlight, marks: markColours }}
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
              // A hidden page: the grey box on the newest word shown, behind its ink (the cursor's word is covered).
              cursor={
                live.state.status !== 'listening'
                  ? null
                  : hidden
                    ? liveInfo.saidUpTo != null && liveInfo.startWord != null && liveInfo.saidUpTo >= liveInfo.startWord
                      ? liveInfo.saidUpTo
                      : null
                    : live.state.cursor
              }
              marks={pageMarks(page)}
              selected={cardMarks[0] ?? null}
              hidden={hidden}
              colors={{ band: v2.highlightSoft, word: v2.highlight, marks: markColours }}
            />
          )
        : undefined,
    [liveOn, qw, live.active, live.state, v2, cardMarks, pageMarks, hidden, markColours, showPast, pastOnPage, pastAt, isDark, showing, shownOnPage, shownCardMarks, liveInfo],
  );
  // The next word's cover turns red while something else is being said in its slot (the checker's `off`, draft 7).
  const offWord = live.state.off?.w ?? null;
  // Peeked words in quiet grey while the take lasts, but for one with a mistake (its highlight shows as it is).
  const veiled = useMemo(() => {
    if (!live.active || peeked.size === 0) return [];
    const marked = new Set(Object.values(live.state.marks).map((m) => m.w));
    return [...peeked].filter((w) => !marked.has(w));
  }, [live.active, peeked, live.state.marks]);
  const coverMarksOn = useCallback(
    (page: number): { mark: Mark; fill: string; opacity?: number }[] => {
      if (!qw || !hidden || !coversKeepMarks) return [];
      const follow = hiddenFollow(qw, revealed, liveInfo);
      const liveMarks = live.active && checkTake ? marksOnPage(live.state, qw, page) : [];
      const past = pastOnCovers
        ? openInRange(memories, ...qw.pageRange(page)).flatMap((p) => {
            const m = markOf(p);
            return m ? [m] : [];
          })
        : [];
      return coverHighlights(qw, page, follow.shown, liveMarks, past).map(({ mark, past: before }) =>
        before
          ? { mark, fill: markFill(v2, mark), opacity: isDark ? PAST_OPACITY.dark : PAST_OPACITY.light }
          : { mark, fill: markColours[markGroup(mark)].fill },
      );
    },
    [qw, hidden, coversKeepMarks, revealed, liveInfo, live.active, live.state, checkTake, markColours, pastOnCovers, memories, v2, isDark],
  );
  // A tap on the page: the shown take's marks; else this take's marks, then the past mistakes on show (on the page, or
  // on a hidden page's covers: Majd, Nov 21 2026, "the shaded mistakes when the page is hidden aren't clickable"). The
  // take's marks never stand in the way of the past ones when none is under the finger.
  const pastTaps = showPast || pastOnCovers;
  const onTapPoint = useMemo(() => {
    if (!qw) return undefined;
    type ToWindow = (r: { x0: number; y0: number; x1: number; y1: number }) => Box;
    if (showing) {
      return (page: number, x: number, y: number, toWindow: ToWindow) => {
        const m = markAt(qw, shownOnPage(page), x, y);
        if (!m) return false;
        setShownCardAt({ w: m.w, anchor: toWindow(wordBox(qw, m.w)) });
        return true;
      };
    }
    const liveTaps = liveOn && checkTake;
    if (!liveTaps && !pastTaps) return undefined;
    return (page: number, x: number, y: number, toWindow: ToWindow) => {
      if (liveTaps) {
        const m = markAt(qw, marksOnPage(live.state, qw, page), x, y);
        if (m) {
          setCardAt({ w: m.w, anchor: toWindow(wordBox(qw, m.w)) });
          return true;
        }
      }
      if (!pastTaps) return false;
      // Hidden: exactly the past marks its covers draw (a word already shown has none).
      const past = pastOnCovers
        ? coverMarksOn(page).flatMap((c) => (c.opacity != null ? [c.mark] : []))
        : pastOnPage(page).map((p) => p.lastMark).filter((x): x is Mark => x != null);
      const m = markAt(qw, past, x, y);
      if (!m) return false;
      setPastAt({ w: m.w, anchor: toWindow(wordBox(qw, m.w)) });
      return true;
    };
  }, [liveOn, qw, checkTake, live.state, pastTaps, pastOnCovers, coverMarksOn, pastOnPage, showing, shownOnPage]);
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
                      current:
                        live.state.status === 'listening' && live.state.cursor != null ? { w: live.state.cursor, words: qw, colour: v2.highlight } : null,
                    }
                  : null
              }
              peeked={veiled.length ? { words: qw, peeked: veiled, veil: palette.peekVeil } : null}
              coverMarks={hidden ? { words: qw, marks: coverMarksOn(page) } : null}
            />
          )
        : undefined,
    [liveOn, qw, hidden, revealed, liveInfo, coverColors, offWord, v2, veiled, palette, coverMarksOn, live.state.status, live.state.cursor],
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
  const chromeShown = modeMenu || (live.active ? !immersive : chromeVisible);
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
      ? t('reciteLive.layer.starting')
      : liveStatus === 'checking'
        ? t('reciteLive.layer.checking')
        : liveStatus === 'failed'
          ? t(`reciteLive.failure.${LIVE_FAILURE[live.state.failure ?? 'server']}`)
          : liveStatus === 'done'
            ? t('reciteLive.layer.done')
            : t('reciteLive.layer.listening');
  // In a test: which place it is, and once it's done, how it went ("Clean · 2 of 5").
  const placeResult = test && liveStatus === 'done' ? test.results[test.at] : undefined;
  // Short, for a crowded bar (an SE at the largest text): while listening which place it is; once done, how it went
  // (Next says which place comes).
  const barStatus = test
    ? placeResult
      ? outcomeText(placeResult)
      : liveStatus === 'listening' || liveStatus === 'connecting'
        ? t('common.nOfTotal', { n: test.at + 1, total: test.places.length })
        : baseStatus
    : baseStatus;

  const busy = liveStatus === 'connecting' || liveStatus === 'listening' || liveStatus === 'checking';

  return {
    /** The live check is on for this account and print (Revisely Dev). */
    liveOn,
    words: qw,
    /** A take is open (its bar is up). */
    active: live.active,
    /** The page is hidden (the hidden view). */
    hidden,
    /** The microphone is listening: a recording's note keeps quiet. */
    micOn: live.mic === 'on',
    /** A take is starting, listening or checking: the page shows only Recite's own colours (no other highlight). */
    busy,
    /** The screen's controls: up, or put away (a take's immersive page). */
    chromeVisible: chromeShown,
    /** During a take the status bar stays (the time and battery). */
    keepStatusBar: live.active,
    /** A tap on the page. */
    onTap: onTapReader,
    /** The MushafPager's props for Recite's layers. */
    pager: {
      pageUnderlay,
      pageOverlay,
      pageAccessories,
      onTapPoint,
      extraData: liveOn
        ? `${live.state.cursor}|${live.state.saidUpTo}|${heldCursor ?? ''}|${Object.keys(live.state.marks).length}|${hidden}|${revealed.size}|${offWord}|${veiled.length}|${showPast || pastOnCovers ? memoryRecords.length : -1}|${pastAt?.w ?? ''}|${showing ? `${shownTake?.id}:${shownTake?.marks.length}` : ''}|${shownCardAt?.w ?? ''}`
        : undefined,
    },
    /** The take's bar, in the footer's place while a take is open. */
    bar:
      live.active && qw ? (
        <ReciteBar
          hidden={hidden}
          onToggleHidden={toggleHidden}
          onNextWord={showNextWord}
          onWholeAyah={showWholeAyah}
          // A test's place says how it went in words: no score pill (it crowded the bar out).
          score={checkTake && !test ? scorePill(live.state, qw, live.startWord) : null}
          clock={live.clock}
          recording={live.recording && live.mic === 'on'}
          // A test's place, once done, says how it went in the words' place.
          words={placeResult ? [] : barWords(live.state, qw, { check: checkTake, startWord: live.startWord, upTo: hidden ? liveInfo.saidUpTo : undefined })}
          status={barStatus}
          phase={barPhase}
          paused={live.paused}
          slow={live.slow}
          onPause={() => void live.pause()}
          onResume={() => void live.resume()}
          onStop={live.stop}
          onScore={() => {
            const opens = scoreTapOpens(live.state.status);
            if (opens === 'summary' && takeId) setSummaryShown(takeId);
            else if (opens === 'so-far') setSoFar(true);
          }}
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
              ? { label: t('reciteLive.layer.nextPlace', { n: test.at + 2, total: test.places.length }), onPress: nextPlace }
              : undefined
          }
          surface={{ background: palette.control, border: palette.divider }}
        />
      ) : null,
    /** The hide-the-page eye and the mic, for the player's record slot while the screen's recorder is idle. */
    controls:
      liveOn && recorder.phase === 'idle' ? (
        <>
          <BarButton
            icon={hidden ? 'eye-outline' : 'eye-off-outline'}
            label={hidden ? t('reciteLive.bar.show') : t('reciteLive.bar.hide')}
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
      ) : null,
    /** Beside the page's number during a take: its time (a tap brings the controls back). */
    activity: live.active ? (
      <TakeActivity clock={live.clock} recording={live.recording && live.mic === 'on'} onPress={() => setTakeImmersive(false)} />
    ) : null,
    /** The cards, sheets and notes, rendered last. */
    sheets: liveOn ? (
      <>
        <UndoToast
          visible={undoFor != null}
          message={t('reciteLive.layer.marked')}
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
          onTest={
            testMe
              ? () => {
                  setModeMenu(false);
                  setTestPick(true);
                }
              : undefined
          }
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
            if (qw) goTo(qw.pageOf(r.place.cue[0]));
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
              if (live.mic !== 'on') say(t('reciteLive.layer.markedSpoken'));
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
            today={day}
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
            if (!qw) return;
            // On its page, here; a page this screen doesn't hold (a session's) opens the reader showing it.
            const page = qw.pageOf(t.from);
            if (showPage(page) !== false) setShowTakeId(t.id);
            else openElsewhere?.({ page, showTake: t.id });
          }}
          onClose={() => {
            const back = progressFor?.back;
            setProgressFor(null);
            if (back === 'summary' && live.state.status === 'done' && takeId) setSummaryShown(takeId);
          }}
        />
        <UndoToast
          visible={clearedUndo != null}
          message={t('reciteLive.layer.cleared')}
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
            // Over this screen, the ayah highlighted, so Back returns to the page left (READ-2).
            if (openElsewhere) openElsewhere({ page: p.page, highlight: { sura: p.sura, ayah: p.ayah } });
            else goTo(p.page);
          }}
          onClose={() => setSimilarFor(null)}
        />
        <TakeSummarySheet
          visible={
            (summaryShown != null && live.state.status === 'done') ||
            (soFar && scoreTapOpens(live.state.status) === 'so-far')
          }
          during={live.state.status !== 'done'}
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
          removed={removedMarks(live.state)}
          unfinished={isUnfinished(live.state)}
          onPutBack={(id) => {
            if (undoFor === id) setUndoFor(null);
            const m = live.state.removed[id]?.mark;
            live.restore(id);
            // The row it was on goes: say where it went.
            if (m) say(t('reciteLive.layer.putBack', { title: markTitle(m) }));
          }}
          checkOwned={owned}
          onFinding={(m) => {
            setSummaryShown(null);
            setSoFar(false);
            if (!qw) return;
            goTo(qw.pageOf(m.w));
            setCardAt({ w: m.w, anchor: { x: width / 2, y: insets.top + 120, width: 1, height: 1 } });
          }}
          onInto={(into) => {
            // That ayah, highlighted as a search result is, until the page is turned (once its page is the one shown).
            setSummaryShown(null);
            setSoFar(false);
            setCardAt(null);
            const target = toAyahRef({ sura: into.ayah[0], ayah: into.ayah[1] });
            // Over this screen, so Back returns to the page left (READ-2); highlighted in place where nothing can open.
            if (openElsewhere) openElsewhere({ page: target.page, highlight: { sura: target.sura, ayah: target.ayah } });
            else if (showPage(target.page) !== false) onInto(target);
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
            if (qw) goTo(qw.pageOf(w));
          }}
          onDone={() => {
            setSummaryShown(null);
            setSoFar(false);
          }}
          // The summary is on screen: the take's Stop trace ends (lib/reciteLive/stopTrace).
          onShown={() => stopTrace.end()}
          // RMEM-6: a take is no recording, so its summary is where it can be deleted, and where to find it after.
          onDelete={
            takeRecord
              ? () => {
                  remembering.forget();
                  setSummaryShown(null);
                  setCardAt(null);
                  live.clear();
                  say(t('reciteLive.layer.deleted'));
                }
              : undefined
          }
          onRecited={
            takeRecord
              ? () => {
                  setSummaryShown(null);
                  navigateToActivityDay(takeRecord.day, undefined, 'recited');
                }
              : undefined
          }
        />
        <CheckIntroPage
          visible={introOpen}
          getting={gettingPremium}
          onGet={getPremium}
          onSupport={applyForSupport}
          earlyAccess={earlyAccessOn}
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
    ) : null,
  };
}
