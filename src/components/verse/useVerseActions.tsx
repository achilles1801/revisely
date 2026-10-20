import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Modal, Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '../../context/AppContext';
import { AyahRef, ayahRects } from '../../lib/ayahBounds';
import { getRecitation, RecitationState } from '../../lib/recitation';
import { nextVerse, nextVerseInJuz, pageOfVerse, previousVerse, toAyahRef, VerseKey } from '../../lib/verses';
import { logger } from '../../lib/logger';
import { isRecordingActive } from '../../lib/recordings';
import { isCheckListening } from '../../lib/recite/checkState';
import { VerseMenu } from './VerseMenu';
import { VerseSheet } from './VerseSheet';
import { NowPlayingBar } from './NowPlayingBar';
import { ReciterList } from './ReciterList';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../context/ThemeContext';
import { resolveVoice, voiceLabel } from '../../lib/recitation';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

interface Options {
  /** Pages this screen shows. Playback and verse navigation stay within them. */
  pages: number[];
  /** Bring a page into view (playback or the sheet moved to a verse on it). */
  onShowPage?: (page: number) => void;
  /** The page on screen; recitation only turns the page when its verse has no
   *  lines here. */
  currentPage?: number;
  /** "Recite from here": check recitation starting at the held verse. */
  onReciteFrom?: (verse: AyahRef) => void;
}

/**
 * Press and hold a verse on a mushaf page: it is highlighted and a menu offers
 * Play (Husary, to the end of the juz) and Translation (the verse sheet). Shared
 * by the Quran tab and revision sessions. Returns the props for MushafPager and
 * the overlay to render on top of it.
 */
export function useVerseActions({ pages, onShowPage, currentPage, onReciteFrom }: Options) {
  const { user, saveUser } = useApp();
  const { theme } = useTheme();
  const recitation = getRecitation();
  const [playback, setPlayback] = useState<RecitationState>(recitation.getState());
  const [selected, setSelected] = useState<AyahRef | null>(null);
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const [sheetVerse, setSheetVerse] = useState<AyahRef | null>(null);
  const allowed = useMemo(() => new Set(pages), [pages]);
  const [owner] = useState(() => `verse-actions-${Math.random().toString(36).slice(2)}`);
  const onShowPageRef = useRef(onShowPage);
  onShowPageRef.current = onShowPage;
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  useEffect(() => recitation.subscribe(setPlayback), [recitation]);
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
    if (isRecordingActive()) {
      // It would play into the microphone.
      setMenuPoint(null);
      setSelected(null);
      Alert.alert('Recording in progress', 'Pause the recording to play the recitation.');
      return;
    }
    if (isCheckListening()) {
      // It would be heard as the reciter.
      setMenuPoint(null);
      setSelected(null);
      Alert.alert('Listening to your recitation', 'Stop checking to play the recitation.');
      return;
    }
    const advance = (v: VerseKey) => {
      const next = nextVerseInJuz(v);
      return next && allowed.has(pageOfVerse(next)) ? next : null;
    };
    recitation.play(selected, advance, owner);
    setMenuPoint(null);
    setSelected(null);
  }, [selected, allowed, recitation, owner]);

  const reciteFrom = useCallback(() => {
    if (!selected || !onReciteFrom) return;
    onReciteFrom(selected);
    setMenuPoint(null);
    setSelected(null);
  }, [selected, onReciteFrom]);

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

  // Previous / next verse while playing, within this screen's pages.
  const playingVerse = playerVisibleState(mine, playback) ? playback.verse : null;
  const stepTo = (v: VerseKey | null) =>
    v && allowed.has(pageOfVerse(v))
      ? () => {
          const advance = (cur: VerseKey) => {
            const next = nextVerseInJuz(cur);
            return next && allowed.has(pageOfVerse(next)) ? next : null;
          };
          recitation.play(v, advance, owner);
        }
      : undefined;

  /** The recitation controls, for the screen's bottom bar. Null when nothing plays. */
  const player = playingVerse ? (
    <NowPlayingBar
      state={playback}
      onPause={() => recitation.pause()}
      onResume={() => recitation.resume()}
      onStop={() => recitation.stop(owner)}
      onPrevious={stepTo(previousVerse(playingVerse))}
      onNext={stepTo(nextVerse(playingVerse))}
      voiceName={voiceLabel(resolveVoice(user?.reciter))}
      onPickReciter={() => setReciterPickerOpen(true)}
    />
  ) : null;

  const overlay = (
    <>
      <VerseMenu
        point={menuPoint}
        playSubtitle={`${resolveVoice(user?.reciter).reciter.short} · to the end of the juz`}
        onPlay={play}
        onTranslation={openTranslation}
        onReciteFrom={onReciteFrom ? reciteFrom : undefined}
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
      <Modal
        visible={reciterPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReciterPickerOpen(false)}
      >
        <Pressable style={pickerStyles.overlay} onPress={() => setReciterPickerOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={pickerStyles.sheet}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            <SafeAreaView>
              <Text style={[pickerStyles.title, { color: theme.textPrimary }]}>Reciter</Text>
              <ReciterList
                value={user?.reciter}
                onChange={(choice) => {
                  changeReciter(choice);
                  setReciterPickerOpen(false);
                }}
                maxHeight={460}
              />
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  return {
    highlightedAyah: selected ?? playingRef,
    onLongPressAyah,
    overlay,
    player,
    /** Something is playing (the screen shows `player` in its bottom bar). */
    playerVisible: player != null,
  };
}

function playerVisibleState(mine: boolean, playback: RecitationState): boolean {
  return mine && playback.status !== 'idle' && playback.verse != null;
}

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    overflow: 'hidden',
  },
  title: { ...typography.titleLarge, paddingHorizontal: spacing.md, marginBottom: spacing.xs },
});
