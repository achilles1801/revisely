// Recite on a page of the mushaf (Revisely Dev): the one mic and everything a take brings, for any screen with a
// MushafPager. The reader has it on every page; a revision session on its day's pages (Majd, Nov 17 2026: "add the
// mistake detection and mic functionality same as mushaf to the revision sessions themselves").
//
// What it holds: the mic and its held menu (Record, Recite, Mark mistakes, Test me), the
// take's bar, the page's layers (the cursor, the marks, the hidden view, peeked words, past mistakes, a past take shown),
// the mark and word cards, the summary, Test me, the AI notice and the Premium page.
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
import { isATake } from '../../lib/reciteLive/takeEnough';
import { toAyahRef } from '../../lib/verses';
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
  guessCursor,
  mistakeCount,
  type LiveState,
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
import { NOTHING_PEEKED, Peeked, peekedByAyah } from '../../lib/reciteLive/peeked';
import { LiveMode, useLiveRecitation } from './useLiveRecitation';
import { ReciteMic, ReciteMicMode } from './ReciteMic';
import { ReciteMenuMode, ReciteModeMenu } from './ReciteModeMenu';
import { BarButton, ReciteBar } from './ReciteBar';
import { LiveMarkTargets, LiveOverlay, LiveUnderlay, ShownWashes } from './LivePageLayers';
import { shownOnHiddenPage } from './HiddenInkLayer';
import type { PageImage } from '../MushafPager';
import { followCues } from '../../lib/reciteLive/wash';
import { hiddenTakeInfo, keepRecited, revealedOnHide } from '../../lib/reciteLive/hideSwitch';

const NO_VERSES: ReadonlySet<string> = new Set();
import { ReciteNoticeSheet } from './ReciteNoticeSheet';
import { MarkCard } from './MarkCard';
import { SimilarPhrasesSheet } from './SimilarPhrasesSheet';
import { TakeSummarySheet } from './TakeSummarySheet';
import { say, undoMs, useScreenReaderOn } from './a11y';
import { navigateToActivityDay } from '../../navigation/navigationRef';
import { markTitle } from '../../lib/reciteLive/describe';
import { TakeSpan } from '../../lib/reciteLive/span';
import { pickTest, type SpotTest, testFinished, testJuz, testLengthLabel } from '../../lib/reciteLive/testMe';
import { memorizedAyahs } from '../../lib/memorizedAyahs';
import { HasbukNote } from './HasbukNote';
import { TestMeScopeSheet } from './TestMeSheets';
import { CheckIntroPage } from './CheckIntroPage';
import { TakeActivity } from './TakeActivity';
import { markAt, wordBox } from '../../lib/reciteLive/geometry';
import { similarPhrases } from '../../lib/reciteLive/similar';
import type { Mark } from '../../lib/reciteLive/contract';
import type { Box } from '../verse/menuPlacement';
import { playClip, playReference, stopHearing } from '../../lib/reciteLive/hearAudio';
import { useKeepCheckerWarm } from './useKeepCheckerWarm';
import { type LiveFailure, markGroup, needsPremium } from '../../lib/reciteLive/contract';
import { logger } from '../../lib/logger';
import { useRememberTake } from '../reciteMemory/useRememberTake';
import { remember, useMemoryRecords } from '../../lib/reciteMemory/store';
import { clearedBy, memoryOfWord, openInRange, wordMemories, type WordMemory } from '../../lib/reciteMemory/memory';
import { comparableTakes, passageTakes, progressLine } from '../../lib/reciteMemory/progress';
import { historyRows, passageHistory } from '../../lib/reciteMemory/history';
import { PassageProgressSheet } from '../reciteMemory/PassageProgressSheet';
import { memoryId, takeOfWord, type ClearRecord } from '../../lib/reciteMemory/record';
import { clipOfTake, useTakeRecordings } from '../../lib/reciteMemory/takeAudio';
import { markOf, PAST_OPACITY, RememberedTargets, RememberedUnderlay } from '../reciteMemory/RememberedLayers';
import { markFill, markFirm } from './markColours';
import { WordHistoryCard } from '../reciteMemory/WordHistoryCard';
import { ShownTakeBar } from '../reciteMemory/ShownTakeBar';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { pastMemory as pastTakeMemory, pastScore, pastWhen, withMarkBack, withoutMark } from '../../lib/reciteMemory/pastTake';
import { deleteTake } from '../../lib/reciteMemory/apart';
import { mistakesLabel } from '../../lib/reciteLive/score';
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


/**
 * A finished take's result in a few words, for the bar and a screen reader: Mark mistakes' score and mistakes ("96% · 1
 * mistake"), or "Done" for following along.
 */
function takeResultText(state: LiveState, qw: QuranWords | null, startWord: number | null, check: boolean): string {
  const score = check && qw ? scorePill(state, qw, startWord) : null;
  // i18n-ignore (two texts joined as a list)
  return score ? `${score.text} · ${mistakesLabel(mistakeCount(state))}` : t('reciteLive.bar.resultDone');
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
  const [tooShort, setTooShort] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState<Revealed>(NOTHING_SHOWN);
  // Words shown by hand during the take (‹, ‹‹): kept in quiet grey on the page, listed in the summary, and kept
  // with the take's record for its summary later (RMEM-8).
  const [peeked, setPeeked] = useState<Peeked>(NOTHING_PEEKED);
  // Test me (RECITE-8; Majd, Nov 23 2026; lib/reciteLive/testMe): one spot test at a time. A Mark mistakes take with the
  // page hidden but for its starting verse, that stops by itself at the length chosen. `finished`: null until it ends.
  const [test, setTest] = useState<{ juz: number | null; spot: SpotTest; hiddenBefore: boolean; finished: boolean | null } | null>(null);
  const testRef = useRef(test);
  testRef.current = test;
  // Goes up each time a test reaches its end: Hasbuk.
  const [hasbuk, setHasbuk] = useState(0);
  const remembering = useRememberTake({
    uid: user?.id,
    enabled: liveOn,
    live,
    hidden,
    day,
    level: checkLevel(reciteSettings),
    records: memoryRecords,
    peeked,
    spotTest: test?.spot ?? null,
  });
  noteTakeRecording.current = remembering.noteRecording;
  const takeRecord = remembering.current;
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
    // Stop ends it too: the bar's middle is the take's result's then, and the summary's Removed list has Put back.
    if (live.state.status === 'connecting' || live.state.status === 'idle' || live.state.status === 'checking') setUndoFor(null);
  }, [live.state.status]);
  // The Undo is in the take's bar, for 5 s (15 with VoiceOver or TalkBack), as the note it replaced (RECITE-25).
  useEffect(() => {
    if (!undoFor) return undefined;
    const timer = setTimeout(() => setUndoFor(null), undoMs(screenReader));
    return () => clearTimeout(timer);
  }, [undoFor, screenReader]);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  // Keep the checker awake while the reader is open and in front (Cloud Run stops an idle one after about 15 minutes, and
  // waking takes 6–9 s): on opening, then every 10 minutes, never while a take's connection already holds it.
  const takeBusy = live.state.status === 'connecting' || live.state.status === 'listening' || live.state.status === 'checking';
  useKeepCheckerWarm(liveOn && focused, takeBusy);
  // What a tap on the mic starts: Record, or Recite, marking mistakes when the switch is on and the account has it.
  const markMistakes = owned && reciteSettings.markMistakes;
  const micMode: ReciteMicMode = reciteSettings.mode === 'record' ? 'record' : markMistakes ? 'check' : 'recite';
  const [testPick, setTestPick] = useState(false);
  const memorized = useMemo(() => (liveOn ? memorizedAyahs(pages ?? []) : []), [liveOn, pages]);
  const testableJuz = useMemo(() => (liveOn && qw ? testJuz(memorized, qw) : []), [liveOn, qw, memorized]);
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
    const backstop = live.state.voiceSaid === true;
    const id = setTimeout(() => setHeldCursor(cursorNow), revealDelay(wordLetters(qw.uthmani(cursorNow)), median, backstop));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorNow, listeningNow, qw, live.state.voiceSaid]);
  const liveInfo = useMemo(
    () => ({
      // What the hidden page shows (RECITE-6): what's decided or left behind, and the word being said once it has been
      // under the cursor REVEAL_AFTER_MS.
      saidUpTo: shownUpTo(live.state, heldCursor),
      // Before the checker has found a test's start: from its verse (‹ shows the word after it, not the page's first).
      startWord: live.startWord ?? test?.spot.cue[0] ?? null,
      cursor: live.state.cursor,
    }),
    [live.state, live.startWord, test?.spot, heldCursor],
  );
  // Switched to hidden after a take, the page hides everything, the take's recited words too (RECITE-21; Majd, Nov 22
  // 2026, of Tarteel's: "do the same"); a new take starts from that again. While it runs, its recited words show.
  const [hiddenAfterTake, setHiddenAfterTake] = useState(false);
  const takeRunning = live.active && (live.state.status === 'listening' || live.state.status === 'connecting');
  useEffect(() => {
    if (live.state.status === 'connecting') setHiddenAfterTake(false);
  }, [live.state.status]);
  const hiddenInfo = useMemo(() => hiddenTakeInfo(liveInfo, hiddenAfterTake && !takeRunning), [liveInfo, hiddenAfterTake, takeRunning]);
  // When a take stops, the words it recited stay shown with those shown by hand, until the page is hidden again (Majd's
  // Dev take, Nov 22 2026: "it should show me the first two verses revealed since that's what i recited"). The take's
  // own state goes when it is cleared; what it recited is kept here.
  const recitedSoFar = useRef<{ startWord: number | null; saidUpTo: number | null }>({ startWord: null, saidUpTo: null });
  const wasRunning = useRef(false);
  useEffect(() => {
    if (takeRunning) recitedSoFar.current = { startWord: liveInfo.startWord, saidUpTo: liveInfo.saidUpTo };
  }, [takeRunning, liveInfo.startWord, liveInfo.saidUpTo]);
  useEffect(() => {
    if (wasRunning.current && !takeRunning) {
      const { startWord, saidUpTo } = recitedSoFar.current;
      setRevealed((r) => keepRecited(r, startWord, saidUpTo));
    }
    wasRunning.current = takeRunning;
  }, [takeRunning]);

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
      void live.start(mode, span);
    },
    [recorder, owned, reciteSettings.noticeSeen, live],
  );
  // A spot test: the page hidden but for its starting verse, and a take from there to the length chosen.
  const startTest = useCallback(
    (juz: number | null) => {
      setTestPick(false);
      if (!qw) return;
      const spot = pickTest(memorized, qw, { juz, pages: reciteSettings.testPages });
      if (!spot) return;
      setTest({ juz, spot, finished: null, hiddenBefore: testRef.current?.hiddenBefore ?? hidden });
      setCardAt(null);
      setHidden(true);
      startMode('check', spot.span, new Set(spot.cue));
    },
    [qw, memorized, reciteSettings.testPages, hidden, startMode],
  );
  /** The test is over (✕, or nothing of it to keep): the take goes, and the page is as it was. */
  const endTest = useCallback(() => {
    const run = testRef.current;
    live.clear();
    setCardAt(null);
    setRevealed(NOTHING_SHOWN);
    setTest(null);
    if (run) setHidden(run.hiddenBefore);
  }, [live]);
  // A test whose take never started (the notice closed, the microphone refused, Premium refused): it ends, so the next
  // take isn't taken for it.
  const testStalled = test != null && live.state.status === 'idle' && live.mic !== 'starting' && noticeFor == null;
  useEffect(() => {
    if (testStalled && testRef.current) endTest();
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
  // Switched to hidden during a take, everything behind the reciter stays and only what is ahead hides; after a take,
  // everything hides (RECITE-21).
  const toggleHidden = useCallback(() => {
    const hide = !hidden;
    setRevealed(hide && qw ? revealedOnHide(qw, currentPage, { running: takeRunning, startWord: liveInfo.startWord }) : NOTHING_SHOWN);
    setHiddenAfterTake(hide && !takeRunning);
    setHidden(hide);
  }, [hidden, qw, currentPage, takeRunning, liveInfo.startWord]);
  // Each tells the checker which word was shown (the ayah's first word not shown before, for ‹‹).
  /** During a take, the words that `next` shows that weren't showing: peeks. */
  const notePeeks = useCallback(
    (next: Revealed) => {
      if (!live.active) return;
      const newly = [...next].filter((w) => !wordShown(w, revealed, hiddenInfo));
      if (newly.length) setPeeked((p) => new Set([...p, ...newly]));
    },
    [live.active, revealed, hiddenInfo],
  );
  const showNextWord = useCallback(() => {
    if (!qw) return;
    const next = revealNextWord(qw, currentPage, revealed, hiddenInfo);
    const added = [...next].find((w) => !revealed.has(w));
    if (added == null) return;
    live.hint(added, 'word');
    notePeeks(next);
    setRevealed(next);
  }, [qw, currentPage, revealed, hiddenInfo, live, notePeeks]);
  const showWholeAyah = useCallback(() => {
    if (!qw) return;
    const next = revealAyah(qw, currentPage, revealed, hiddenInfo);
    const added = [...next].find((w) => !revealed.has(w));
    if (added == null) return;
    live.hint(added, 'ayah');
    notePeeks(next);
    setRevealed(next);
  }, [qw, currentPage, revealed, hiddenInfo, live, notePeeks]);

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
  // The shown take's summary, opened from its card (RMEM-8, Revisely Dev; Majd, Nov 22 2026: "make that take card
  // clickable and have it open that days summary popup sheet"). Revisely Dev's until the next release (its Dev guide says
  // so).
  const pastSummaryOn = isDevVariant();
  const [pastOpen, setPastOpen] = useState(false);
  const endShowing = useCallback(() => {
    setShowTakeId(null);
    setShownCardAt(null);
    setPastOpen(false);
    onShowTakeEndRef.current?.();
  }, []);
  // Not a mistake on a past take's mark: the take is kept again without it (and its score with it), the mark listed apart
  // for its summary's Put back (RMEM-8), and the checker hears it as a label.
  const dismissShown = useCallback(
    (id: string) => {
      if (!shownTake || !user?.id || !qw) return;
      const next = withoutMark(shownTake, id, qw, Date.now());
      const m = shownTake.marks.find((x) => x.id === id);
      if (!next || !m) return;
      remember(user.id, next).catch((err) => logger.warn('Recite memory: Not a mistake was not kept', err));
      // The take that judged it (a long recitation's own link, RECITE-22).
      const judgedBy = takeOfWord(shownTake, m.w);
      if (judgedBy) void sendLabel('dismiss', judgedBy, id, Date.now());
    },
    [shownTake, user?.id, qw],
  );
  // Put back from the shown take's summary: the mark is the take's again, and the checker hears that too.
  const putBackShown = useCallback(
    (id: string) => {
      if (!shownTake || !user?.id || !qw) return;
      const m = shownTake.removed?.find((x) => x.id === id);
      const next = withMarkBack(shownTake, id, qw, Date.now());
      if (!next || !m) return;
      remember(user.id, next).catch((err) => logger.warn('Recite memory: Put back was not kept', err));
      const judgedBy = takeOfWord(shownTake, m.w);
      if (judgedBy) void sendLabel('undismiss', judgedBy, id, Date.now());
      say(t('reciteLive.layer.putBack', { title: markTitle(m) }));
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
  // Stop ends in the bar's result, the summary only on a tap (Majd, Nov 22 2026): Revisely Dev's until the release.
  const quietEnd = isDevVariant();
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
  // The take's summary: this passage's takes before it, newest first, and its progress comparing like with like (RMEM-7).
  // Revisely Dev's until the next release (its Dev guide says so).
  const historyOn = isDevVariant();
  // The take's summary: the words it cleared, and its passage's trend (with this take in, before it has synced): in
  // Revisely Dev only the takes of the same stretch, so a longer take's mistakes elsewhere never count for or against it.
  const summaryMemory = useMemo(() => {
    if (!takeRecord || !qw) return null;
    const all = [...memoryRecords.filter((r) => r.id !== takeRecord.id), takeRecord];
    const here = passageTakes(all, takeRecord.from, takeRecord.to);
    const takes = historyOn ? comparableTakes(here, takeRecord.from, takeRecord.to) : here;
    return {
      cleared: clearedBy(all, takeRecord).map((m) => qw.uthmani(m.w)),
      trend: takes.map((t) => t.accuracy),
      line: progressLine(takes, Date.now()),
    };
  }, [historyOn, takeRecord, memoryRecords, qw]);
  const summaryHistory = useMemo(
    () => (historyOn && takeRecord && qw ? historyRows(qw, takeRecord, passageHistory(memoryRecords, takeRecord), Date.now()) : []),
    [historyOn, takeRecord, memoryRecords, qw],
  );
  // A passage's progress: from the summary (Done goes back to it) or a word's card.
  const [progressFor, setProgressFor] = useState<{ from: number; to: number; back: 'summary' | 'past' | null } | null>(null);
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
  // A past take from the progress page or the summary's history (RMEM-5, RMEM-7): on its page here, its marks shown until
  // Done; a page this screen doesn't hold (a session's) opens the reader showing it.
  const openPastTake = (t: TakeRecord) => {
    setProgressFor(null);
    setSummaryShown(null);
    setPastOpen(false);
    setSoFar(false);
    setPastAt(null);
    if (live.active) live.clear();
    if (!qw) return;
    const page = qw.pageOf(t.from);
    if (showPage(page) !== false) setShowTakeId(t.id);
    else openElsewhere?.({ page, showTake: t.id });
  };
  // The shown take's summary, from its record (RMEM-8): as the summary said when the take ended, its trend up to it.
  const pastNow = Date.now();
  const past = useMemo(() => {
    if (!pastSummaryOn || !pastOpen || !shownTake || !qw) return null;
    return {
      take: shownTake,
      when: pastWhen(shownTake, pastNow),
      score: pastScore(shownTake),
      memory: pastTakeMemory(memoryRecords, shownTake, qw, pastNow, historyOn),
      history: historyOn ? historyRows(qw, shownTake, passageHistory(memoryRecords, shownTake), pastNow) : [],
      peeked: shownTake.peeked?.length ? peekedByAyah(qw, new Set(shownTake.peeked)) : [],
    };
    // pastNow moves every render; the rest says when to work it out again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastSummaryOn, pastOpen, shownTake, qw, memoryRecords, historyOn]);
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
    // A spot test: finished (Hasbuk) or stopped early, in the bar, and its record says which. Under an ayah, or with no
    // start found, there's no test to keep (RECITE-27): it ends, and the take goes the way any such take does.
    const run = testRef.current;
    if (run) {
      if (qw && isATake(live.state, qw, live.links)) {
        stopTrace.end();
        const finished = testFinished(qw, run.spot, live.state);
        setTest({ ...run, finished });
        if (finished) setHasbuk((n) => n + 1);
        if (screenReader) say(finished ? t('reciteLive.test.hasbukSpoken') : t('reciteLive.test.stoppedEarly'));
        return;
      }
      endTest();
      if (!qw) return;
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
    // Less than an ayah isn't a take (RECITE-27): no summary, just a word on why.
    if (qw && !isATake(live.state, qw, live.links)) {
      stopTrace.end();
      live.clear();
      setTooShort(true);
      if (screenReader) say(t('reciteLive.layer.tooShort'));
      return;
    }
    // Nothing opens by itself (Majd, Nov 22 2026: "nothing pops up in my face at any time"; Tarteel leaves the page as it
    // was): the bar settles into the take's result, and a tap on it opens the summary. Said once to a screen reader.
    if (!quietEnd) {
      stopTrace.step('summary-asked');
      setSummaryShown(takeId);
      return;
    }
    stopTrace.step('result');
    stopTrace.end();
    if (screenReader) say(t('reciteLive.bar.resultSpoken', { result: takeResultText(live.state, qw, live.startWord, checkTake) }));
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
  // Every mark on a hidden page, with its colour: a shown word's behind its ink (the underlay), a word still hidden's over
  // its cover with no take running (LiveOverlay). `picked`: the one a card is open for, in its firm shade.
  const coverMarksOn = useCallback(
    (page: number): { mark: Mark; fill: string; opacity?: number; picked?: boolean }[] => {
      if (!qw || !hidden || !coversKeepMarks) return [];
      const liveMarks = live.active && checkTake ? marksOnPage(live.state, qw, page) : [];
      const past = pastOnCovers
        ? openInRange(memories, ...qw.pageRange(page)).flatMap((p) => {
            const m = markOf(p);
            return m ? [m] : [];
          })
        : [];
      const pickedLive = cardMarks[0]?.w ?? null;
      const pickedPast = pastAt?.w ?? null;
      return coverHighlights(qw, page, () => false, liveMarks, past).map(({ mark, past: before }) =>
        before
          ? mark.w === pickedPast
            ? { mark, fill: markFirm(v2, mark), opacity: 1, picked: true }
            : { mark, fill: markFill(v2, mark), opacity: isDark ? PAST_OPACITY.dark : PAST_OPACITY.light }
          : mark.w === pickedLive
            ? { mark, fill: markFirm(v2, mark), picked: true }
            : { mark, fill: markFill(v2, mark) },
      );
    },
    [qw, hidden, coversKeepMarks, live.active, live.state, checkTake, pastOnCovers, memories, v2, isDark, cardMarks, pastAt],
  );
  // What a hidden page shows: the take's recited words while it runs, and every word shown by hand or kept from a take.
  const hiddenShown = useMemo(
    () => (qw ? shownOnHiddenPage(qw, hiddenFollow(qw, revealed, hiddenInfo), NO_VERSES) : null),
    [qw, revealed, hiddenInfo],
  );
  const pageUnderlay = useMemo(
    () =>
      liveOn && qw && hidden && hiddenShown
        ? (page: number, scale: number) => (
            <ShownWashes page={page} scale={scale} words={qw} marks={coverMarksOn(page).filter((c) => hiddenShown(c.mark.w))} />
          )
        : showing && qw
        ? (page: number, scale: number) => (
            <LiveUnderlay
              page={page}
              scale={scale}
              words={qw}
              cursor={null}
              marks={shownOnPage(page)}
              selected={shownCardMarks[0] ?? null}
              hidden={false}
              colors={{ band: v2.highlight, box: v2.highlightFirm, marks: v2 }}
            />
          )
        : showPast && qw && !pastOnCovers
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
              // The band behind the cursor's ayah, on a shown page only (followCues); a hidden page's newest word is inked over
              // the ink (LiveOverlay's follow).
              cursor={live.state.status !== 'listening' ? null : live.state.cursor ?? guessCursor(live.state)}
              // A hidden page draws its marks over its covers (LiveOverlay).
              marks={hidden ? [] : pageMarks(page)}
              selected={cardMarks[0] ?? null}
              hidden={hidden}
              colors={{ band: v2.highlight, box: v2.highlightFirm, marks: v2 }}
            />
          )
        : undefined,
    [liveOn, qw, live.active, live.state, v2, cardMarks, pageMarks, hidden, hiddenShown, coverMarksOn, showPast, pastOnPage, pastAt, isDark, showing, shownOnPage, shownCardMarks, liveInfo, pastOnCovers],
  );
  // The next word's cover turns red while something else is being said in its slot (the checker's `off`, draft 7).
  const offWord = live.state.off?.w ?? null;
  // Peeked words in quiet grey while the take lasts, but for one with a mistake (its highlight shows as it is).
  const veiled = useMemo(() => {
    if (!live.active || peeked.size === 0) return [];
    const marked = new Set(Object.values(live.state.marks).map((m) => m.w));
    return [...peeked].filter((w) => !marked.has(w));
  }, [live.active, peeked, live.state.marks]);
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
  // On a hidden page, the newest word shown, in the following ink (followCues: none for a word with a mark, whose wash
  // says more; Majd, Nov 22 2026: "i dont see the words being a different color as its recited with page hidden").
  const followWord = useMemo(() => {
    if (!hidden || !qw || live.state.status !== 'listening') return null;
    const newest =
      liveInfo.saidUpTo != null && liveInfo.startWord != null && liveInfo.saidUpTo >= liveInfo.startWord ? liveInfo.saidUpTo : null;
    return followCues(true, null, newest, (w) => pageMarks(qw.pageOf(w)).some((m) => m.w === w)).ink;
  }, [hidden, qw, live.state.status, liveInfo, pageMarks]);
  const pageOverlay = useMemo(
    () =>
      liveOn && qw && (hidden || veiled.length > 0)
        ? (page: number, scale: number, image: PageImage | null) => (
            <LiveOverlay
              page={page}
              scale={scale}
              image={image}
              follow={followWord != null ? { w: followWord, words: qw, colour: v2.followInk } : null}
              hidden={
                hidden
                  ? {
                      follow: hiddenFollow(qw, revealed, hiddenInfo),
                      ...coverColors,
                      off: offWord != null ? { w: offWord, words: qw, colour: v2.markWord } : null,
                      // Nothing on a word still hidden during a take (Majd's Dev take, Nov 22 2026).
                      duringTake: takeRunning,
                    }
                  : null
              }
              peeked={veiled.length ? { words: qw, peeked: veiled, veil: palette.peekVeil } : null}
              coverMarks={hidden ? { words: qw, marks: coverMarksOn(page) } : null}
            />
          )
        : undefined,
    [liveOn, qw, hidden, revealed, hiddenInfo, coverColors, offWord, v2, veiled, palette, coverMarksOn, takeRunning, followWord],
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
  // A past take shown on its page keeps the controls up: its card is the footer (RECITE-25), there while it shows, as the
  // take's bar is during a take.
  const chromeShown = modeMenu || showing || (live.active ? !immersive : chromeVisible);
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
  // In a test: its length while it runs; once done, how it ended (the result's words, when the bar has a result).
  const testEnded = test && liveStatus === 'done' ? test.finished : null;
  const barStatus = test
    ? testEnded != null
      ? testEnded
        ? t('reciteLive.test.finished')
        : t('reciteLive.test.stoppedEarly')
      : liveStatus === 'listening' || liveStatus === 'connecting'
        ? testLengthLabel(test.spot.pages)
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
        ? `${live.state.cursor}|${live.state.guess ?? ''}|${live.state.saidUpTo}|${heldCursor ?? ''}|${Object.keys(live.state.marks).length}|${hidden}|${revealed.size}|${offWord}|${veiled.length}|${showPast || pastOnCovers ? memoryRecords.length : -1}|${pastAt?.w ?? ''}|${showing ? `${shownTake?.id}:${shownTake?.marks.length}` : ''}|${shownCardAt?.w ?? ''}`
        : undefined,
    },
    /**
     * The take's bar, in the footer's place while a take is open; while a past take shows on its page, its card there
     * (RECITE-25: the room under the page holds both, so neither covers a line).
     */
    bar:
      showing && shownTake ? (
        <ShownTakeBar
          take={shownTake}
          now={Date.now()}
          onDone={endShowing}
          onOpen={pastSummaryOn ? () => setPastOpen(true) : undefined}
          surface={{ background: palette.control, border: palette.divider }}
        />
      ) : live.active && qw ? (
        <ReciteBar
          hidden={hidden}
          onToggleHidden={toggleHidden}
          onNextWord={showNextWord}
          onWholeAyah={showWholeAyah}
          // A test has no score while it runs: its result comes at the end.
          score={checkTake && !test ? scorePill(live.state, qw, live.startWord) : null}
          clock={live.clock}
          recording={live.recording && live.mic === 'on'}
          // A test, once done, says how it ended in the words' place.
          words={testEnded != null ? [] : barWords(live.state, qw, { check: checkTake, startWord: live.startWord, upTo: hidden ? liveInfo.saidUpTo : undefined, held: heldCursor, now: live.seconds })}
          status={barStatus}
          phase={barPhase}
          paused={live.paused}
          slow={live.slow}
          onPause={() => void live.pause()}
          onResume={() => void live.resume()}
          onStop={live.stop}
          result={
            (quietEnd || test) && barPhase === 'done' && takeId
              ? {
                  text: test?.finished === false ? t('reciteLive.test.stoppedEarly') : takeResultText(live.state, qw, live.startWord, checkTake),
                  onPress: () => setSummaryShown(takeId),
                }
              : null
          }
          // Not a mistake's Undo, in the words' place: never a note over the page (RECITE-25).
          undo={
            undoFor
              ? {
                  text: t('reciteLive.layer.marked'),
                  onUndo: () => {
                    const id = undoFor;
                    setUndoFor(null);
                    if (id) live.restore(id);
                  },
                }
              : null
          }
          onScore={() => {
            const opens = scoreTapOpens(live.state.status);
            if (opens === 'summary' && takeId) setSummaryShown(takeId);
            else if (opens === 'so-far') setSoFar(true);
          }}
          onClose={() => {
            if (test) {
              endTest();
              return;
            }
            setCardAt(null);
            setSummaryShown(null);
            live.clear();
          }}
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
        />
        <TestMeScopeSheet
          visible={testPick}
          juz={testableJuz}
          pages={reciteSettings.testPages}
          onPages={(testPages) => setReciteCheckSettings(user?.id, { testPages })}
          onStart={startTest}
          onClose={() => setTestPick(false)}
        />
        <HasbukNote trigger={hasbuk} bottom={insets.bottom + spacing.sm + CAPSULE_HEIGHT + spacing.sm} />
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
          sameStretch={historyOn}
          onOpenTake={openPastTake}
          onClose={() => {
            const back = progressFor?.back;
            setProgressFor(null);
            if (back === 'summary' && live.state.status === 'done' && takeId) setSummaryShown(takeId);
            if (back === 'past' && showing) setPastOpen(true);
          }}
        />
        <UndoToast
          visible={tooShort}
          message={t('reciteLive.layer.tooShort')}
          onDismiss={() => setTooShort(false)}
          bottomInset={insets.bottom - spacing.sm}
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
            const run = testRef.current;
            setSummaryShown(null);
            setCardAt(null);
            live.clear();
            // A spot test's Again is a new test, from the same scope and at the same length.
            if (run) startTest(run.juz);
            else if (mode) startMode(mode);
          }}
          againLabel={test ? t('reciteLive.test.again') : undefined}
          spotTest={test && test.finished != null ? { pages: test.spot.pages, finished: test.finished } : null}
          memory={checkTake ? summaryMemory : null}
          onProgress={() => {
            if (!takeRecord) return;
            setSummaryShown(null);
            setProgressFor({ from: takeRecord.from, to: takeRecord.to, back: 'summary' });
          }}
          history={checkTake ? summaryHistory : []}
          onPastTake={openPastTake}
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
        {/* A finished take's summary again, from its card on the page (RMEM-8): built from its record. */}
        <TakeSummarySheet
          visible={showing && past != null}
          check
          words={qw}
          from={past?.take.from ?? null}
          to={past?.take.to ?? null}
          seconds={past?.take.secs ?? 0}
          marks={past?.take.marks ?? []}
          score={past?.score ?? null}
          removed={past?.take.removed ?? []}
          onPutBack={putBackShown}
          checkOwned
          when={past?.when ?? null}
          unfinished={past?.take.unfinished === true}
          spotTest={past?.take.spotTest ?? null}
          onFinding={(m) => {
            setPastOpen(false);
            if (!qw) return;
            goTo(qw.pageOf(m.w));
            setShownCardAt({ w: m.w, anchor: { x: width / 2, y: insets.top + 120, width: 1, height: 1 } });
          }}
          onInto={(into) => {
            setPastOpen(false);
            const target = toAyahRef({ sura: into.ayah[0], ayah: into.ayah[1] });
            if (openElsewhere) openElsewhere({ page: target.page, highlight: { sura: target.sura, ayah: target.ayah } });
            else if (showPage(target.page) !== false) onInto(target);
          }}
          onCheck={() => undefined}
          memory={past?.memory ?? null}
          onProgress={() => {
            if (!past) return;
            setPastOpen(false);
            setProgressFor({ from: past.take.from, to: past.take.to, back: 'past' });
          }}
          history={past?.history ?? []}
          onPastTake={openPastTake}
          peeked={past?.peeked ?? []}
          onPeeked={(w) => {
            setPastOpen(false);
            if (qw) goTo(qw.pageOf(w));
          }}
          onDone={() => setPastOpen(false)}
          onDelete={
            past && user?.id
              ? () => {
                  const uid = user.id;
                  const gone = past.take;
                  endShowing();
                  deleteTake(uid, gone).catch((err) => logger.warn('Could not delete the take', err));
                  say(t('reciteLive.layer.deleted'));
                }
              : undefined
          }
          onRecited={
            past
              ? () => {
                  setPastOpen(false);
                  navigateToActivityDay(past.take.day, undefined, 'recited');
                }
              : undefined
          }
          recitedToday={past?.take.day === day}
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
            setNoticeFor(null);
          }}
        />
      </>
    ) : null,
  };
}
