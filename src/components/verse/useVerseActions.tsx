import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Dimensions, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { AyahRef, ayahRects, versesOnPage } from '../../lib/ayahBounds';
import { getRecitation, RecitationState } from '../../lib/recitation';
import { nextVerse, nextVerseInJuz, pageOfVerse, previousVerse, toAyahRef, VerseKey } from '../../lib/verses';
import { logger } from '../../lib/logger';
import { isRecordingActive } from '../../lib/recordings';
import { prefetchVerseText } from '../../lib/translation';
import { VerseMenu } from './VerseMenu';
import type { Box } from './menuPlacement';
import { VerseSheet } from './VerseSheet';
import type { PlayerControls } from '../reader/PlayerCapsule';
import { ReciterList } from './ReciterList';
import { resolveVoice, shortVoiceLabel } from '../../lib/recitation';
import { useHaptics } from '../../design/haptics';
import { Sheet } from '../v2/Sheet';
import { getSurahDisplay } from '../../lib/quranData';
import { updateAudioOptions, useAudioOptions } from '../../lib/audioOptions';
import {
  compareVerses,
  nextInRange,
  PLAY_UP_TO_LABELS,
  previousInRange,
  rangeEnd,
  VerseRange,
} from '../../lib/playbackPlan';
import { AudioOptionsSheet, verseLabel } from './AudioOptionsSheet';
import { Anchor, SpeedMenu } from '../reader/SpeedMenu';
import { UndoToast } from '../revision/UndoToast';
import { copyText } from '../../lib/clipboard';
import { verseShareText } from '../../lib/verseShare';
import { spacing } from '../../theme/spacing';

// The last To chosen by hand (Custom), for the next Play while it still fits.
let lastCustomTo: VerseKey | null = null;

interface Options {
  /** Pages this screen shows. Playback and verse navigation stay within them. */
  pages: number[];
  /** Bring a page into view (playback or the sheet moved to a verse on it). */
  onShowPage?: (page: number) => void;
  /** The page on screen; recitation only turns the page when its verse has no
   *  lines here. */
  currentPage?: number;
}

/**
 * Press and hold a verse on a mushaf page: it is highlighted and a menu offers
 * Play (Husary, to the end of the juz), Translation (the verse sheet), Copy and
 * Share (the verse's Arabic with its reference; lib/verseShare). Shared
 * by the Quran tab and revision sessions. Returns the props for MushafPager and
 * the overlay to render on top of it.
 */
export function useVerseActions({ pages, onShowPage, currentPage }: Options) {
  const { user, saveUser } = useApp();
  // A held verse is an outcome (it's selected): Medium; the Haptics setting
  // can turn it off.
  const haptics = useHaptics();
  const recitation = getRecitation();
  const [playback, setPlayback] = useState<RecitationState>(recitation.getState());
  const [selected, setSelected] = useState<AyahRef | null>(null);
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(null);
  // The held verse's lines on screen: its menu goes beside them.
  const [menuAnchor, setMenuAnchor] = useState<Box | null>(null);
  const [sheetVerse, setSheetVerse] = useState<AyahRef | null>(null);
  const allowed = useMemo(() => new Set(pages), [pages]);
  const [owner] = useState(() => `verse-actions-${Math.random().toString(36).slice(2)}`);
  const onShowPageRef = useRef(onShowPage);
  onShowPageRef.current = onShowPage;
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const translationIdRef = useRef(user?.translationId);
  translationIdRef.current = user?.translationId;

  useEffect(() => recitation.subscribe(setPlayback), [recitation]);

  // Audio Options (kept per account): speed, repeats and the pause drive the
  // shared player; "Play up to" sets where a Play ends.
  const audio = useAudioOptions(user?.id);
  useEffect(() => {
    recitation.setOptions({ speed: audio.speed, repeat: audio.repeat, pauseFactor: audio.pauseFactor });
  }, [recitation, audio.speed, audio.repeat, audio.pauseFactor]);
  // The ayahs this screen's recitation plays: From to To.
  const rangeRef = useRef<VerseRange | null>(null);
  const rangeFrom = useCallback(
    (from: VerseKey): VerseRange => ({ from, to: rangeEnd(from, audio.playUpTo, lastCustomTo) }),
    [audio.playUpTo],
  );
  // Leaving the screen stops the recitation it started.
  useEffect(() => () => recitation.stop(owner), [recitation, owner]);
  const mine = playback.owner === owner;

  // While playing, the highlight follows the recited verse onto its page.
  const playingRef = useMemo(
    () => (mine && playback.status !== 'idle' && playback.verse ? toAyahRef(playback.verse) : null),
    [playback, mine],
  );
  // Only when a new verse starts, so pausing, resuming or a re-render never
  // pulls the reader back from a page they swiped to.
  const playingKey = playingRef ? `${playingRef.sura}:${playingRef.ayah}` : null;
  useEffect(() => {
    if (!playingKey) return;
    const [sura, ayah] = playingKey.split(':').map(Number);
    const here = currentPageRef.current;
    // A verse continuing from the previous page is already on screen.
    if (here != null && ayahRects(here, sura, ayah).length > 0) return;
    const page = pageOfVerse({ sura, ayah });
    if (allowedRef.current.has(page)) onShowPageRef.current?.(page);
  }, [playingKey]);

  const onLongPressAyah = useCallback((ayah: AyahRef, point?: { x: number; y: number }, verse?: Box | null) => {
    haptics.impact();
    // The menu offers Translation: its text starts loading now, not on the tap.
    prefetchVerseText(ayah.page, ayah.sura, ayah.ayah, translationIdRef.current);
    setSelected(ayah);
    setMenuAnchor(verse ?? null);
    const { width, height } = Dimensions.get('window');
    setMenuPoint(point ?? { x: width / 2, y: height / 2 });
  }, [haptics]);

  const closeMenu = useCallback(() => {
    setMenuPoint(null);
    setSelected(null);
  }, []);

  // Play continues to the end of its range (Play up to; the juz by default),
  // within this screen's pages.
  const advance = useCallback((v: VerseKey) => {
    const range = rangeRef.current;
    const next = range ? nextInRange(range, v) : nextVerseInJuz(v);
    return next && allowedRef.current.has(pageOfVerse(next)) ? next : null;
  }, []);
  const start = useCallback(
    (range: VerseRange) => {
      rangeRef.current = range;
      recitation.play(range.from, advance, owner);
    },
    [recitation, advance, owner],
  );

  const play = useCallback(() => {
    if (!selected) return;
    if (isRecordingActive()) {
      // It would play into the microphone.
      setMenuPoint(null);
      setSelected(null);
      Alert.alert('Recording in progress', 'Pause the recording to play the recitation.');
      return;
    }
    start(rangeFrom(selected));
    setMenuPoint(null);
    setSelected(null);
  }, [selected, start, rangeFrom]);

  /** ▶ in the controls: recite from the first verse that begins on a page (the
   *  one continuing from the page before is part of that page's reading). */
  const playPage = useCallback(
    (page: number) => {
      const verses = versesOnPage(page);
      const first = verses.find((v) => pageOfVerse(v) === page) ?? verses[0];
      if (!first || !allowed.has(page)) return;
      if (isRecordingActive()) {
        Alert.alert('Recording in progress', 'Pause the recording to play the recitation.');
        return;
      }
      start(rangeFrom(first));
    },
    [allowed, start, rangeFrom],
  );

  const openTranslation = useCallback(() => {
    setSheetVerse(selected);
    // The verse stays highlighted under its sheet; the menu goes.
    setMenuPoint(null);
  }, [selected]);

  // A short note at the bottom ("Copied"), also read out by VoiceOver.
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<string | null>(null);
  const showNote = useCallback((text: string) => {
    setNote(text);
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  // Copy and Share: the verse the menu was opened on; the menu closes.
  const copyVerse = useCallback(() => {
    const verse = selected;
    setMenuPoint(null);
    setSelected(null);
    if (!verse) return;
    verseShareText(verse.page, verse.sura, verse.ayah)
      .then((text) => {
        copyText(text);
        haptics.light();
        showNote('Copied');
      })
      .catch((err) => {
        logger.warn('Could not copy the verse', err);
        showNote('Couldn’t copy. Check your connection.');
      });
  }, [selected, haptics, showNote]);

  const shareVerse = useCallback(() => {
    const verse = selected;
    setMenuPoint(null);
    setSelected(null);
    if (!verse) return;
    verseShareText(verse.page, verse.sura, verse.ayah)
      .then((message) => Share.share({ message }))
      .catch((err) => {
        logger.warn('Could not share the verse', err);
        showNote('Couldn’t share. Check your connection.');
      });
  }, [selected, showNote]);

  const navigateSheet = useCallback(
    (v: VerseKey) => {
      const ref = toAyahRef(v);
      setSheetVerse(ref);
      setSelected(ref);
      if (allowed.has(ref.page)) onShowPageRef.current?.(ref.page);
    },
    [allowed],
  );

  // Closing the sheet leaves a recitation playing; the player bar stops it.
  const closeSheet = useCallback(() => {
    setSheetVerse(null);
    setSelected(null);
  }, []);

  // The saved reciter drives the shared player.
  useEffect(() => {
    recitation.setVoice(user?.reciter);
  }, [recitation, user?.reciter]);
  const [reciterPickerOpen, setReciterPickerOpen] = useState(false);

  const changeReciter = useCallback(
    (reciter: string) => {
      recitation.setVoice(reciter);
      if (!user) return;
      saveUser({ ...user, reciter }).catch((err) => logger.warn('Could not save reciter', err));
    },
    [user, saveUser, recitation],
  );

  const changeTranslation = useCallback(
    (translationId: string) => {
      if (!user) return;
      saveUser({ ...user, translationId }).catch((err) =>
        logger.warn('Could not save translation choice', err),
      );
    },
    [user, saveUser],
  );

  // Previous / next verse while playing, within the range and this screen's pages.
  const playingVerse = playerVisibleState(mine, playback) ? playback.verse : null;
  const stepTo = (v: VerseKey | null) =>
    v && allowed.has(pageOfVerse(v)) ? () => recitation.play(v, advance, owner) : undefined;
  const range = rangeRef.current;
  const previous = playingVerse ? (range ? previousInRange(range, playingVerse) : previousVerse(playingVerse)) : null;
  const next = playingVerse ? (range ? nextInRange(range, playingVerse) : nextVerse(playingVerse)) : null;

  // The speed chip's menu, and Audio Options.
  const [speedAnchor, setSpeedAnchor] = useState<Anchor | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsStart: VerseKey = useMemo(() => {
    if (playingVerse) return playingVerse;
    const page = currentPageRef.current ?? pages[0] ?? 1;
    const verses = versesOnPage(page);
    const first = verses.find((v) => pageOfVerse(v) === page) ?? verses[0];
    return first ? { sura: first.sura, ayah: first.ayah } : { sura: 1, ayah: 1 };
    // Recomputed when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsOpen]);
  const playWithOptions = useCallback(
    (r: VerseRange) => {
      setOptionsOpen(false);
      if (audio.playUpTo === 'custom') lastCustomTo = r.to;
      if (isRecordingActive()) {
        Alert.alert('Recording in progress', 'Pause the recording to play the recitation.');
        return;
      }
      start(r);
    },
    [audio.playUpTo, start],
  );

  /** The recitation controls, for the screen's control capsule (PlayerCapsule). */
  const player: PlayerControls = {
    state: playingVerse ? playback : { status: 'idle', verse: null },
    voiceName: shortVoiceLabel(resolveVoice(user?.reciter)),
    onPlayPage: playPage,
    onPause: () => recitation.pause(),
    onResume: () => recitation.resume(),
    onStop: () => recitation.stop(owner),
    speed: audio.speed,
    onPrevious: stepTo(previous),
    onNext: stepTo(next),
    onPickReciter: () => setReciterPickerOpen(true),
    onSpeed: setSpeedAnchor,
    onOptions: () => setOptionsOpen(true),
  };

  const selectedSurah = selected ? getSurahDisplay(selected.sura)?.nameDisplay : undefined;
  const closeReciters = () => setReciterPickerOpen(false);
  const reciterList = (
    <ReciterList
      value={user?.reciter}
      onChange={(choice) => {
        changeReciter(choice);
        setReciterPickerOpen(false);
      }}
      maxHeight={460}
    />
  );

  const overlay = (
    <>
      <VerseMenu
        point={menuPoint}
        anchor={menuAnchor}
        verseLabel={selected ? `${selectedSurah ? `${selectedSurah} ` : ''}${selected.sura}:${selected.ayah}` : undefined}
        playSubtitle={`${resolveVoice(user?.reciter).reciter.short} · ${playUpToPhrase(selected, audio.playUpTo)}`}
        onPlay={play}
        onTranslation={openTranslation}
        onCopy={copyVerse}
        onShare={shareVerse}
        onClose={closeMenu}
      />
      <VerseSheet
        verse={sheetVerse}
        translationId={user?.translationId}
        onChangeTranslation={changeTranslation}
        reciter={user?.reciter}
        onChangeReciter={changeReciter}
        onNavigate={navigateSheet}
        onClose={closeSheet}
      />
      <Sheet visible={reciterPickerOpen} onClose={closeReciters} title="Reciter" testID="reciter-sheet">
        {reciterList}
      </Sheet>
      <SpeedMenu
        anchor={speedAnchor}
        value={audio.speed}
        onChange={(speed) => updateAudioOptions({ speed })}
        onClose={() => setSpeedAnchor(null)}
      />
      <AudioOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        start={optionsStart}
        options={audio}
        onChangeOptions={updateAudioOptions}
        reciter={user?.reciter}
        onChangeReciter={changeReciter}
        onPlay={playWithOptions}
      />
      <UndoToast
        visible={note != null}
        message={note ?? ''}
        // "Copied" is a glance; a failure gets time to be read.
        duration={note === 'Copied' ? 1500 : 3500}
        onDismiss={() => setNote(null)}
        // At the bottom of the room under the page, never over the text.
        bottomInset={insets.bottom - spacing.sm}
      />
    </>
  );

  return {
    highlightedAyah: selected ?? playingRef,
    onLongPressAyah,
    overlay,
    player,
    /** This screen's recitation is playing, paused or loading. */
    playerVisible: playingVerse != null,
  };
}

/** "to the end of the juz", "…of the surah", "…of the page", or "to Al-Baqarah 2:141". */
function playUpToPhrase(from: AyahRef | null, upTo: keyof typeof PLAY_UP_TO_LABELS): string {
  if (upTo === 'custom') {
    const to = from && lastCustomTo && compareVerses(lastCustomTo, from) >= 0 ? lastCustomTo : null;
    return to ? `to ${verseLabel(to)}` : 'to the end of the surah';
  }
  return `to the end of the ${upTo === 'juz' ? 'juz' : upTo}`;
}

function playerVisibleState(mine: boolean, playback: RecitationState): boolean {
  return mine && playback.status !== 'idle' && playback.verse != null;
}
