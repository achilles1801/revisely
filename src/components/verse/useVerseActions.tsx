import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '../../context/AppContext';
import { AyahRef } from '../../lib/ayahBounds';
import { getRecitation, RecitationState } from '../../lib/recitation';
import { nextVerseInJuz, pageOfVerse, toAyahRef, VerseKey } from '../../lib/verses';
import { logger } from '../../lib/logger';
import { VerseMenu } from './VerseMenu';
import { VerseSheet } from './VerseSheet';
import { NowPlayingBar } from './NowPlayingBar';

interface Options {
  /** Pages this screen shows. Playback and verse navigation stay within them. */
  pages: number[];
  /** Bring a page into view (playback or the sheet moved to a verse on it). */
  onShowPage?: (page: number) => void;
  /** Distance of the now-playing bar from the bottom of the screen. */
  playerBottom?: number;
}

/**
 * Press and hold a verse on a mushaf page: it is highlighted and a menu offers
 * Play (Husary, to the end of the juz) and Translation (the verse sheet). Shared
 * by the Quran tab and revision sessions. Returns the props for MushafPager and
 * the overlay to render on top of it.
 */
export function useVerseActions({ pages, onShowPage, playerBottom = 24 }: Options) {
  const { user, saveUser } = useApp();
  const recitation = getRecitation();
  const [playback, setPlayback] = useState<RecitationState>(recitation.getState());
  const [selected, setSelected] = useState<AyahRef | null>(null);
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const [sheetVerse, setSheetVerse] = useState<AyahRef | null>(null);
  const allowed = useMemo(() => new Set(pages), [pages]);
  const onShowPageRef = useRef(onShowPage);
  onShowPageRef.current = onShowPage;

  useEffect(() => recitation.subscribe(setPlayback), [recitation]);
  // Leaving the screen stops the recitation.
  useEffect(() => () => recitation.stop(), [recitation]);

  // While playing, the highlight follows the recited verse onto its page.
  const playingRef = useMemo(
    () => (playback.status !== 'idle' && playback.verse ? toAyahRef(playback.verse) : null),
    [playback],
  );
  useEffect(() => {
    if (playingRef && allowed.has(playingRef.page)) onShowPageRef.current?.(playingRef.page);
  }, [playingRef, allowed]);

  const onLongPressAyah = useCallback((ayah: AyahRef, point?: { x: number; y: number }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelected(ayah);
    const { width, height } = Dimensions.get('window');
    setMenuPoint(point ?? { x: width / 2, y: height / 2 });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuPoint(null);
    setSelected(null);
  }, []);

  const play = useCallback(() => {
    if (!selected) return;
    const advance = (v: VerseKey) => {
      const next = nextVerseInJuz(v);
      return next && allowed.has(pageOfVerse(next)) ? next : null;
    };
    recitation.play(selected, advance);
    setMenuPoint(null);
    setSelected(null);
  }, [selected, allowed, recitation]);

  const openTranslation = useCallback(() => {
    setSheetVerse(selected);
    setMenuPoint(null);
  }, [selected]);

  const navigateSheet = useCallback(
    (v: VerseKey) => {
      const ref = toAyahRef(v);
      setSheetVerse(ref);
      setSelected(ref);
      if (allowed.has(ref.page)) onShowPageRef.current?.(ref.page);
    },
    [allowed],
  );

  const closeSheet = useCallback(() => {
    setSheetVerse(null);
    setSelected(null);
    recitation.stop();
  }, [recitation]);

  const changeTranslation = useCallback(
    (translationId: string) => {
      if (!user) return;
      saveUser({ ...user, translationId }).catch((err) =>
        logger.warn('Could not save translation choice', err),
      );
    },
    [user, saveUser],
  );

  const overlay = (
    <>
      <VerseMenu point={menuPoint} onPlay={play} onTranslation={openTranslation} onClose={closeMenu} />
      <VerseSheet
        verse={sheetVerse}
        translationId={user?.translationId}
        onChangeTranslation={changeTranslation}
        onNavigate={navigateSheet}
        onClose={closeSheet}
      />
      <NowPlayingBar
        state={playback}
        onPause={() => recitation.pause()}
        onResume={() => recitation.resume()}
        onStop={() => recitation.stop()}
        bottom={playerBottom}
      />
    </>
  );

  return {
    highlightedAyah: selected ?? playingRef,
    onLongPressAyah,
    overlay,
  };
}
