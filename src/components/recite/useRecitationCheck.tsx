import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { CheckSession, CheckEnd } from '../../lib/recite/checkSession';
import { CheckKind, CheckRecord, onChecksChanged, pastMistakes, saveCheck, dismissMistakes } from '../../lib/recite/checkHistory';
import { getQuranWords, loadQuranWords, QuranWords } from '../../lib/recite/quranWords';
import { isMicStreamAvailable, startMicStream } from '../../lib/recite/micSource';
import { closeSpeechEngine, openSpeechEngine } from '../../lib/recite/speechEngine';
import { downloadedModelPath } from '../../lib/recite/speechModel';
import { setRecitePrefs, useRecitePrefs } from '../../lib/recite/recitePrefs';
import type { WordStatus } from '../../lib/recite/tracker';
import { claimAudio, enterRecordingMode, isAudioSessionError, onAudioClaimed, setAudioMode } from '../../lib/audioFocus';
import { getRecitation } from '../../lib/recitation';
import { isRecordingActive } from '../../lib/recordings';
import { setCheckListening } from '../../lib/recite/checkState';
import { logger } from '../../lib/logger';
import { useTheme } from '../../context/ThemeContext';
import { getReadPalette } from '../../theme/readPalette';
import type { PageLayers } from '../MushafPager';
import { wordLayers } from './wordLayers';
import { countMistakes } from '../../lib/recite/checkSummary';
import { ReciteBar, ReciteStatus } from './ReciteBar';
import { ReciteButton } from './ReciteButton';
import { SpeechModelSheet } from './SpeechModelSheet';
import { CheckSummarySheet } from './CheckSummarySheet';

export type RecitePhase = 'idle' | 'starting' | 'listening' | 'finishing';

interface Options {
  kind: CheckKind;
  /** Revision day the check belongs to. */
  day: string | null;
  /** Pages this screen shows; following stays within them. */
  pages: number[];
  /** The page on screen. */
  currentPage: number;
  /** Bring a page into view (the reciter reached it). */
  onShowPage: (page: number) => void;
  /** A page was recited through (revision credits it). */
  onPageRecited?: (page: number) => void;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Recitation checking on a mushaf screen: Recite listens on the device, follows
 * along word by word (turning pages), and marks wrong and missed words; Stop
 * shows what was caught. Optionally the words are hidden until recited.
 */
export function useRecitationCheck({ kind, day, pages, currentPage, onShowPage, onPageRecited }: Options) {
  const { isDark } = useTheme();
  const palette = getReadPalette(isDark);
  const [phase, setPhase] = useState<RecitePhase>('idle');
  const [version, setVersion] = useState(0);
  const prefs = useRecitePrefs();
  const [words, setWords] = useState<QuranWords | null>(getQuranWords());
  const [past, setPast] = useState<Map<number, number> | null>(null);
  const [modelSheet, setModelSheet] = useState(false);
  const [summary, setSummary] = useState<CheckRecord | null>(null);
  const [hints, setHints] = useState<Set<number>>(new Set());
  const sessionRef = useRef<CheckSession | null>(null);
  const phaseRef = useRef<RecitePhase>('idle');
  const pendingStartRef = useRef<number | undefined>(undefined);
  /** The page this hook asked the screen to show (to tell it from the user's). */
  const turningToRef = useRef<number | null>(null);
  const [owner] = useState(() => `recite-${Math.random().toString(36).slice(2)}`);
  const unmountedRef = useRef(false);

  const optsRef = useRef({ kind, day, pages, currentPage, onShowPage, onPageRecited, prefs });
  optsRef.current = { kind, day, pages, currentPage, onShowPage, onPageRecited, prefs };

  const setPhaseBoth = (p: RecitePhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // Past mistakes, once the word data is loaded (it is, after a first check).
  useEffect(() => {
    if (!prefs.showPastMistakes) {
      setPast(null);
      return;
    }
    let live = true;
    const load = () => pastMistakes().then((m) => live && setPast(m.size > 0 ? m : null));
    load();
    if (!words) loadQuranWords().then((w) => live && setWords(w)).catch(() => undefined);
    const unsub = onChecksChanged(load);
    return () => {
      live = false;
      unsub();
    };
  }, [prefs.showPastMistakes, words]);

  /** Stop listening, save the check and show its summary. */
  const finish = useCallback(async (reason: CheckEnd | 'user') => {
    const session = sessionRef.current;
    if (!session || phaseRef.current === 'finishing' || phaseRef.current === 'idle') return;
    setPhaseBoth('finishing');
    try {
      await session.stop();
    } catch (err) {
      logger.warn('Recitation check did not stop cleanly', err);
    }
    setCheckListening(false);
    setAudioMode(false);
    closeSpeechEngine();
    const record = session.record(`check-${Date.now().toString(36)}`);
    sessionRef.current = null;
    setHints(new Set());
    setPhaseBoth('idle');
    if (record && record.recited > 0) {
      saveCheck(record).catch((err) => logger.error('Could not save recitation check', err));
      setSummary(record);
      if (reason === 'finished') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (reason === 'user' || reason === 'ended') {
      Alert.alert('Nothing recited', 'Revisely didn’t hear any of this page. Recite clearly, close to the phone.');
    }
    if (reason === 'interrupted') logger.warn('Recitation check interrupted');
  }, []);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const begin = useCallback(async (startWord?: number) => {
    if (phaseRef.current !== 'idle') return;
    if (Platform.OS !== 'ios' || !isMicStreamAvailable()) {
      Alert.alert('Not available yet', 'Recitation checking needs the latest version of Revisely on iPhone.');
      return;
    }
    if (isRecordingActive()) {
      Alert.alert('Recording in progress', 'Pause the recording to check your recitation.');
      return;
    }
    const modelPath = downloadedModelPath();
    if (!modelPath) {
      pendingStartRef.current = startWord;
      setModelSheet(true);
      return;
    }
    setPhaseBoth('starting');
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setPhaseBoth('idle');
        Alert.alert(
          'Microphone access is off',
          'Allow Revisely to use the microphone in Settings to check your recitation.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      const [loadedWords, engine] = await Promise.all([loadQuranWords(), openSpeechEngine(modelPath)]);
      setWords(loadedWords);
      // Recitation and recording playback stop; then recording mode, then the mic.
      claimAudio('recitation-check', owner);
      getRecitation().stop();
      const o = optsRef.current;
      const session = new CheckSession({
        words: loadedWords,
        engine,
        startSource: async (handlers) => {
          await enterRecordingMode();
          try {
            return await startMicStream(handlers);
          } catch (err) {
            if (!isAudioSessionError(err)) throw err;
            await wait(400);
            await enterRecordingMode();
            return startMicStream(handlers);
          }
        },
        pages: o.pages,
        page: o.currentPage,
        startWord,
        kind: o.kind,
        day: o.day ?? '',
        onChange: () => setVersion((v) => v + 1),
        onMistakes: () => {
          if (optsRef.current.prefs.vibrate) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
        onReachPage: (page) => {
          if (page === optsRef.current.currentPage) return;
          turningToRef.current = page;
          optsRef.current.onShowPage(page);
        },
        onPageDone: (page) => optsRef.current.onPageRecited?.(page),
        onEnd: (reason) => finishRef.current(reason),
      });
      sessionRef.current = session;
      await session.start();
      // Ended while starting (the screen closed, something took the audio).
      if (sessionRef.current !== session) return;
      setCheckListening(true);
      setPhaseBoth('listening');
      // The screen closed while the microphone was starting.
      if (unmountedRef.current) {
        await finishRef.current('interrupted');
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      logger.error('Could not start recitation check', err);
      sessionRef.current = null;
      setCheckListening(false);
      setAudioMode(false);
      closeSpeechEngine();
      setPhaseBoth('idle');
      if (unmountedRef.current) return;
      Alert.alert(
        "Couldn't start listening",
        isAudioSessionError(err)
          ? 'The microphone is busy, maybe with a call or another app. Close it and try again.'
          : 'Please try again.',
      );
    }
  }, [owner]);

  // The user turned the page themselves: look for the reciter there.
  useEffect(() => {
    const session = sessionRef.current;
    if (!session || phaseRef.current !== 'listening') return;
    if (turningToRef.current === currentPage) {
      turningToRef.current = null;
      return;
    }
    session.pageTurnedByUser(currentPage);
  }, [currentPage]);

  // Something else took the audio (a recording, a recitation): stop listening.
  useEffect(
    () =>
      onAudioClaimed((activity, by) => {
        if (by !== owner && sessionRef.current) finishRef.current('interrupted');
      }),
    [owner],
  );

  // No listening in the background; leaving the screen ends the check.
  useEffect(() => {
    // Set here, not only initially: effects can be torn down and set up again
    // while the screen stays (Fast Refresh, strict mode).
    unmountedRef.current = false;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' && sessionRef.current) finishRef.current('interrupted');
    });
    return () => {
      sub.remove();
      unmountedRef.current = true;
      if (sessionRef.current) finishRef.current('interrupted');
    };
  }, []);

  const toggleHide = useCallback(() => {
    setRecitePrefs({ hideWords: !optsRef.current.prefs.hideWords });
  }, []);

  /** Show the next word while words are hidden. */
  const hint = useCallback(() => {
    const pos = sessionRef.current?.position;
    if (pos == null) return;
    Haptics.selectionAsync();
    setHints((h) => new Set(h).add(pos));
  }, []);

  const dismissInSummary = useCallback((word: number) => {
    setSummary((s) => {
      if (!s) return s;
      dismissMistakes(s.id, [word]).catch((err) => logger.warn('Could not update check', err));
      return { ...s, mistakes: s.mistakes.filter((m) => m.w !== word) };
    });
  }, []);

  // What the pages show: the live check, or the check being summarised.
  const session = sessionRef.current;
  const summaryStatus = useMemo(() => {
    if (!summary) return null;
    const map = new Map<number, WordStatus>();
    for (const m of summary.mistakes) map.set(m.w, m.c ? 'corrected' : m.k);
    return (w: number): WordStatus =>
      map.get(w) ?? (w >= summary.from && w <= summary.to ? 'correct' : 'pending');
  }, [summary]);

  const pageLayers = useCallback(
    (page: number, scale: number): PageLayers | null => {
      if (!words) return null;
      if (session) {
        return wordLayers({
          words,
          page,
          scale,
          status: (w) => session.tracker.statusOf(w),
          position: session.position,
          hide: prefs.hideWords,
          revealed: (w) => session.isPreviewCorrect(w) || hints.has(w),
          past: prefs.showPastMistakes ? past : null,
          pageColor: palette.pageBg,
          inkColor: palette.textPrimary,
          trail: true,
        });
      }
      if (summaryStatus) {
        return wordLayers({
          words,
          page,
          scale,
          status: summaryStatus,
          position: null,
          hide: false,
          revealed: () => true,
          past: null,
          pageColor: palette.pageBg,
          inkColor: palette.textPrimary,
        });
      }
      if (past && prefs.showPastMistakes) {
        return wordLayers({
          words,
          page,
          scale,
          status: () => 'pending',
          position: null,
          hide: false,
          revealed: () => true,
          past,
          pageColor: palette.pageBg,
          inkColor: palette.textPrimary,
        });
      }
      return null;
    },
    // version: the live session changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, session, version, prefs, past, summaryStatus, hints, palette],
  );

  const mistakeCount = session
    ? countMistakes(
        session.tracker
          .mistakes()
          .filter((m) => !m.corrected)
          .map((m) => ({ w: m.word, k: m.kind })),
      )
    : 0;
  const active = phase !== 'idle';

  const button = !active ? (
    <ReciteButton onPress={() => begin()} busy={false} palette={palette} />
  ) : null;

  const bar = active ? (
    <ReciteBar
      phase={phase}
      finding={!!session && session.position == null}
      levelDb={() => sessionRef.current?.levelDb ?? -100}
      speaking={() => sessionRef.current?.speaking ?? false}
      hidden={prefs.hideWords}
      onToggleHide={toggleHide}
      onHint={hint}
      onStop={() => finish('user')}
      palette={palette}
    />
  ) : null;

  const status = active ? (
    <ReciteStatus
      phase={phase}
      finding={!!session && session.position == null}
      verse={session?.position != null && words ? words.ref(Math.min(session.position, words.count - 1)) : null}
      mistakes={mistakeCount}
    />
  ) : null;

  const overlay = (
    <>
      <SpeechModelSheet
        visible={modelSheet}
        onClose={() => setModelSheet(false)}
        onReady={() => {
          setModelSheet(false);
          const from = pendingStartRef.current;
          pendingStartRef.current = undefined;
          // After the sheet has gone (a Modal closing blocks the permission alert).
          setTimeout(() => begin(from), 400);
        }}
      />
      <CheckSummarySheet
        record={summary}
        words={words}
        onDismissMistake={dismissInSummary}
        onShowWord={(w) => {
          if (!words) return;
          const page = words.pageOf(w);
          setSummary(null);
          if (optsRef.current.pages.includes(page)) optsRef.current.onShowPage(page);
        }}
        onClose={() => setSummary(null)}
      />
    </>
  );

  return {
    phase,
    active,
    /** The Recite button (null while checking). */
    button,
    /** The controls while checking (null otherwise). */
    bar,
    /** Where the reciter is and the mistakes so far, for the breadcrumb row
     *  (null while not checking). */
    status,
    overlay,
    pageLayers,
    /** Changes whenever the layers do (for the pager's extraData). */
    layersKey: `${version}|${summary?.id ?? ''}|${summary?.mistakes.length ?? 0}|${prefs.hideWords}|${hints.size}|${past?.size ?? 0}|${words ? 1 : 0}`,
    /** "Recite from here" on a verse. */
    startFromVerse: async (sura: number, ayah: number) => {
      const loaded = await loadQuranWords();
      const word = loaded.verseFirstWord(sura, ayah);
      const s = sessionRef.current;
      if (s) s.startFrom(word);
      else begin(word);
    },
  };
}
