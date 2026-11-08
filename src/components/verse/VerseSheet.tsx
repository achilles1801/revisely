import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { DISMISS_VELOCITY, shouldDismiss } from '../v2/Sheet';
import { useReduceMotion } from '../../design/motion';
import { Ionicons } from '@expo/vector-icons';
import { Backdrop } from '../Backdrop';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
import { arabicV2, layoutV2, PaletteV2, radiusV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { PillButton } from '../v2/PillButton';
import { getSurahDisplay } from '../../lib/quranData';
import {
  ARABIC_CREDIT,
  creditLine,
  DEFAULT_TRANSLATION_ID,
  getVerseText,
  fallbackTranslation,
  hasArabicForPage,
  hasTranslationSura,
  isTranslationAvailable,
  nameWithLanguage,
  offeredTranslations,
  pickerTitle,
  CLEAR_QURAN_ID,
  resolveTranslation,
  peekVerseText,
  prefetchVerseNeighbours,
  TRANSLATIONS,
  VerseText,
} from '../../lib/translation';
import { clearQuranErrorHint, clearQuranSegments } from '../../lib/clearQuran';
import { hasSaheehSura, saheehFootnotes, saheehSegments } from '../../lib/saheeh';
import { knownOffline, onNetworkState } from '../../lib/networkState';
import { nextVerse, previousVerse } from '../../lib/verses';
import { resolveVoice, voiceLabel } from '../../lib/recitation';
import { ReciterList } from './ReciterList';
import { TranslationPicker } from './TranslationPicker';
import { AyahRef } from '../../lib/ayahBounds';

interface VerseSheetProps {
  /** Verse shown; null hides the sheet. */
  verse: AyahRef | null;
  translationId: string | undefined;
  onChangeTranslation: (id: string) => void;
  /** The picker offers every translation (lib/translationsOffered: any account), else the short list. */
  everyTranslation?: boolean;
  /** The account: the picker's favorites are kept on the phone for each. */
  accountId?: string;
  /** Reciter and style for Play ('<reciter>:<style>'). */
  reciter: string | undefined;
  onChangeReciter: (choice: string) => void;
  /** Previous / next verse. */
  onNavigate: (verse: { sura: number; ayah: number }) => void;
  onClose: () => void;
}

// `for` names the translation and verse a result belongs to: until the next
// result arrives, the previous one is not shown (a credit must never sit under
// another translation's text, not even for one frame).
export type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; text: VerseText; for: string }
  | { status: 'error'; error: unknown; for: string };

/** What a render may show: a result for another translation or verse counts as loading. */
export function visibleLoadState(state: LoadState, current: string): LoadState {
  return state.status !== 'loading' && state.for !== current ? { status: 'loading' } : state;
}

/**
 * The sheet's height limit, in points: as it opens (70% of the screen), and
 * expanded (swipe the grabber up, or tap it) to everything below the status bar.
 * The sheet fits a short verse; a longer one scrolls inside the limit.
 */
export function sheetMaxHeight(screenHeight: number, topInset: number, expanded: boolean): number {
  return Math.round(expanded ? screenHeight - topInset - 8 : screenHeight * 0.7);
}

/** Header and credit text grow with Dynamic Type only this far, so the verse keeps the room. */
const CHROME_TEXT_SCALE = 1.4;

const SPRING_BACK = { damping: 22, stiffness: 320, mass: 0.8 };

/**
 * What a drag that ended here does (translationY: points moved, up negative;
 * velocityY in pt/s). At normal height it closes like every sheet (v2/Sheet's
 * shouldDismiss); expanded, a long drag (half the sheet, or a quarter flung)
 * closes it and a shorter one brings it back to normal height. Up expands.
 */
export function verseSheetRelease(
  translationY: number,
  velocityY: number,
  sheetHeight: number,
  expanded: boolean,
): 'expand' | 'shrink' | 'close' | 'back' {
  'worklet';
  if (translationY < -30) return expanded ? 'back' : 'expand';
  if (!expanded) return shouldDismiss(translationY, velocityY, sheetHeight) ? 'close' : 'back';
  const h = sheetHeight > 0 ? sheetHeight : 600;
  if (translationY > h * 0.5 || (velocityY > DISMISS_VELOCITY && translationY > h * 0.25)) return 'close';
  return shouldDismiss(translationY, velocityY, sheetHeight) ? 'shrink' : 'back';
}

/**
 * A held verse's Arabic text and translation, with previous/next and the
 * translation picker under "…". A plain Modal rather than a gorhom sheet, like
 * the other overlays on the reading screens.
 *
 * The header stays put and the verse scrolls under it: a long verse (2:282)
 * runs well past the sheet. The grabber expands the sheet to nearly the whole
 * screen (swipe up or tap). Dragging the grabber or the header down moves the
 * sheet with the finger and the backdrop fades with it, as on every sheet
 * (v2/Sheet): past the threshold or flung it closes (expanded, a shorter drag
 * brings it back to normal height), otherwise it springs back. The verse itself
 * drags the sheet down only once it is scrolled to its top. A credited
 * translation's credit stays pinned under the verse.
 *
 * The dimmed backdrop sits behind the sheet, not around it: a scroll view inside
 * a Pressable doesn't scroll on iOS (see Backdrop).
 *
 * It keeps this frame (it does more than v2/Sheet) in the sheets' colours and
 * corners: bare icons in the header, the "…" menu as a flat panel.
 */
export function VerseSheet({
  verse,
  translationId,
  onChangeTranslation,
  everyTranslation = false,
  accountId,
  reciter,
  onChangeReciter,
  onNavigate,
  onClose,
}: VerseSheetProps) {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStylesV2(palette), [palette]);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // 'translations' is the short list; 'picker' the picker of every translation.
  const [menu, setMenu] = useState<'closed' | 'root' | 'translations' | 'picker' | 'reciters'>('closed');
  const translation = resolveTranslation(translationId);
  const [expanded, setExpanded] = useState(false);
  // Where the "…" menu opens: under the header, however tall large text makes it.
  const [headerBottom, setHeaderBottom] = useState(96);
  const [sheetHeight, setSheetHeight] = useState(0);
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxHeight = sheetMaxHeight(screenHeight, insets.top, expanded);

  // A closed sheet reopens at normal height. (Another verse starts at its top
  // by itself: loading it replaces the scrolling part.)
  useEffect(() => {
    if (verse == null) setExpanded(false);
  }, [verse]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const visibleRef = useRef(verse != null);
  visibleRef.current = verse != null;
  // The connection: what an error says follows it, and a verse that couldn't
  // load is tried again when it comes back.
  const [, setNetworkChanges] = useState(0);
  const failedRef = useRef(false);
  useEffect(
    () =>
      onNetworkState((now, before) => {
        if (!visibleRef.current) return;
        setNetworkChanges((n) => n + 1);
        if (now.connected && before?.connected !== true && failedRef.current) setAttempt((a) => a + 1);
      }),
    [],
  );
  const reduceMotion = useReduceMotion();

  // The drag, on the UI thread: the sheet follows the finger down.
  const drag = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const expandedSV = useSharedValue(expanded);
  useEffect(() => {
    expandedSV.value = expanded;
  }, [expanded, expandedSV]);
  // The verse's scroll position: at its top, a drag down moves the sheet.
  const scrollY = useSharedValue(0);
  const bodyStart = useSharedValue(0);
  // Opened again: in place, whatever the last drag left.
  useEffect(() => {
    if (verse != null) drag.value = 0;
  }, [verse, drag]);

  const setExpandedJS = useCallback((on: boolean) => setExpanded(on), []);
  const dragClose = useCallback(() => {
    onCloseRef.current();
    // An owner that keeps the sheet open gets it back rather than an empty space.
    setTimeout(() => {
      if (visibleRef.current) drag.value = withSpring(0, SPRING_BACK);
    }, 400);
  }, [drag]);
  const release = useCallback(
    (translationY: number, velocityY: number) => {
      'worklet';
      const action = verseSheetRelease(translationY, velocityY, sheetH.value, expandedSV.value);
      if (action === 'close') {
        drag.value = withTiming(sheetH.value + 40, { duration: 180 });
        runOnJS(dragClose)();
        return;
      }
      drag.value = reduceMotion ? withTiming(0, { duration: 120 }) : withSpring(0, SPRING_BACK);
      if (action === 'expand') runOnJS(setExpandedJS)(true);
      if (action === 'shrink') runOnJS(setExpandedJS)(false);
    },
    [drag, sheetH, expandedSV, dragClose, setExpandedJS, reduceMotion],
  );
  // The grabber and the header (its buttons still take their taps).
  const headerPan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
          drag.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => release(e.translationY, e.velocityY))
        .withTestId('verse-sheet-drag'),
    [drag, release],
  );
  // The verse: alongside its own scrolling, a drag down moves the sheet only
  // once the verse is at its top (it doesn't bounce, so nothing else moves).
  const bodyScroll = useMemo(() => Gesture.Native(), []);
  const bodyPan = useMemo(
    () =>
      Gesture.Pan()
        .simultaneousWithExternalGesture(bodyScroll)
        .activeOffsetY(10)
        .failOffsetY(-10)
        .failOffsetX([-24, 24])
        .onStart(() => {
          bodyStart.value = 0;
        })
        .onUpdate((e) => {
          if (scrollY.value > 0.5) {
            // Still scrolling back up to the top: the sheet waits.
            bodyStart.value = e.translationY;
            drag.value = 0;
            return;
          }
          drag.value = Math.max(0, e.translationY - bodyStart.value);
        })
        .onEnd((e) => release(drag.value, drag.value > 0 ? e.velocityY : 0))
        .withTestId('verse-sheet-body-drag'),
    [bodyScroll, bodyStart, scrollY, drag, release],
  );
  const dragged = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));
  const dimmed = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, drag.value / Math.max(1, sheetH.value)),
  }));

  useEffect(() => {
    if (verse == null) {
      setMenu('closed');
      return;
    }
    let live = true;
    const loadFor = `${translation.id}|${verse.sura}:${verse.ayah}`;
    // The verses either side, so previous / next show at once.
    prefetchVerseNeighbours(verse, translation.id);
    const known = peekVerseText(verse.page, verse.sura, verse.ayah, translation.id);
    if (known) {
      setState({ status: 'ready', text: known, for: loadFor });
      return;
    }
    setState({ status: 'loading' });
    getVerseText(verse.page, verse.sura, verse.ayah, translation.id)
      .then((text) => live && setState({ status: 'ready', text, for: loadFor }))
      .catch((error) => live && setState({ status: 'error', error, for: loadFor }));
    return () => {
      live = false;
    };
  }, [verse, translation.id, attempt]);

  const surah = verse ? getSurahDisplay(verse.sura) : undefined;
  // What this render may show: a result for another translation or verse is
  // still loading as far as the reader can see.
  const current = verse ? `${translation.id}|${verse.sura}:${verse.ayah}` : '';
  let view = visibleLoadState(state, current);
  if (view.status === 'loading' && verse) {
    // Fetched ahead (a neighbour): shown in this very frame, without a spinner.
    const known = peekVerseText(verse.page, verse.sura, verse.ayah, translation.id);
    if (known) view = { status: 'ready', text: known, for: current };
  }
  const prev = verse ? previousVerse(verse) : null;
  const next = verse ? nextVerse(verse) : null;
  failedRef.current = view.status === 'error';
  // Offline, with this page's Arabic here: the translation is what's missing, and another one on the
  // phone can show the verse (TRANS-7): the same language first, then Saheeh International.
  const offline = view.status === 'error' && knownOffline();
  const arabicHere = offline && !!verse && hasArabicForPage(verse.page);
  const alternative =
    arabicHere && verse
      ? fallbackTranslation(translation, verse.sura, offeredTranslations(everyTranslation), (t, sura) =>
          t.id === DEFAULT_TRANSLATION_ID ? hasSaheehSura(sura) : hasTranslationSura(t, sura),
        )
      : null;
  const notDownloaded = arabicHere && translation.source === 'quranenc' && translation.id !== DEFAULT_TRANSLATION_ID;
  // Urdu, Persian, Kurdish, Pashto, Uyghur, N'Ko: the translation reads right to left.
  const rtl = translation.direction === 'rtl';

  return (
    <Modal visible={verse != null} transparent animationType="slide" onRequestClose={onClose}>
      {/* Gestures inside a native modal need their own root (iOS). */}
      <GestureHandlerRootView style={styles.overlay}>
        <Reanimated.View style={[StyleSheet.absoluteFill, styles.dim, dimmed]} pointerEvents="none" />
        <Backdrop onPress={onClose} label="Close translation" />
        <Reanimated.View style={dragged}>
          <View
            style={[
              styles.sheet,
              { maxHeight, paddingBottom: Math.max(insets.bottom, spacing.md) },
              // The picker fills the expanded sheet, however short the verse is.
              menu === 'picker' && { minHeight: maxHeight },
            ]}
            onLayout={(e) => {
              setSheetHeight(e.nativeEvent.layout.height);
              sheetH.value = e.nativeEvent.layout.height;
            }}
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            testID="verse-sheet"
          >
              {/* Grabber and header: drag down to close (or shrink), up to expand. */}
              <GestureDetector gesture={headerPan}>
                <View
                  collapsable={false}
                  onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
                  testID="verse-sheet-grab"
                >
                  <Pressable
                    onPress={() => setExpanded((e) => !e)}
                    hitSlop={{ top: 8, bottom: 8, left: 40, right: 40 }}
                    style={styles.grabberHit}
                    accessibilityRole="button"
                    accessibilityLabel={expanded ? 'Make the translation smaller' : 'Expand the translation'}
                    // VoiceOver: the grabber also closes the sheet (Actions rotor).
                    accessibilityActions={[
                      { name: 'activate', label: expanded ? 'Make smaller' : 'Expand' },
                      { name: 'close', label: 'Close' },
                    ]}
                    onAccessibilityAction={(e) => {
                      if (e.nativeEvent.actionName === 'close') onClose();
                      else if (e.nativeEvent.actionName === 'activate') setExpanded((x) => !x);
                    }}
                    testID="verse-sheet-handle"
                  >
                    <View style={styles.grabber} />
                  </Pressable>
                  <View style={styles.headerRow}>
                    <Tap
                      onPress={onClose}
                      hitSlop={8}
                      style={styles.roundBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                    >
                      <Ionicons name="close" size={24} color={palette.text} />
                    </Tap>
                    <View style={styles.titleBox}>
                      <View style={styles.titleLine}>
                        <Text style={styles.surahName} numberOfLines={1} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                          {surah?.nameDisplay ?? ''}
                        </Text>
                        {surah ? (
                          <Text style={styles.surahArabic} maxFontSizeMultiplier={CHROME_TEXT_SCALE} accessibilityLanguage="ar">
                            {surah.nameArabicVoweled}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.ayahLabel} accessibilityRole="header" maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                        Ayah {verse?.ayah}
                      </Text>
                    </View>
                    <View style={styles.pill}>
                      <Tap
                        onPress={() => prev && onNavigate(prev)}
                        disabled={!prev}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="Previous verse"
                        accessibilityState={{ disabled: !prev }}
                        style={[styles.pillBtn, !prev && v2Only.disabled]}
                      >
                        <Ionicons name="chevron-back" size={22} color={prev ? palette.text : palette.secondary} />
                      </Tap>
                      <Tap
                        onPress={() => next && onNavigate(next)}
                        disabled={!next}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="Next verse"
                        accessibilityState={{ disabled: !next }}
                        style={[styles.pillBtn, !next && v2Only.disabled]}
                      >
                        <Ionicons name="chevron-forward" size={22} color={next ? palette.text : palette.secondary} />
                      </Tap>
                    </View>
                    <Tap
                      onPress={() => setMenu(menu === 'closed' ? 'root' : 'closed')}
                      hitSlop={8}
                      style={styles.roundBtn}
                      accessibilityRole="button"
                      accessibilityLabel="More"
                      accessibilityState={{ expanded: menu !== 'closed' }}
                      testID="verse-more"
                    >
                      <Ionicons name="ellipsis-horizontal" size={22} color={palette.text} />
                    </Tap>
                  </View>
                </View>
              </GestureDetector>

              {menu === 'picker' && (
                // Every translation, by language: over the verse, under the header.
                <View style={[styles.pickerPanel, { top: headerBottom, bottom: Math.max(insets.bottom, spacing.md) }]}>
                  <TranslationPicker
                    translations={offeredTranslations(everyTranslation)}
                    chosenId={translation.id}
                    accountId={accountId}
                    onChoose={(id) => {
                      onChangeTranslation(id);
                      setMenu('closed');
                    }}
                  />
                </View>
              )}
              {menu !== 'closed' && menu !== 'picker' && (
                // A flat panel in the sheet, not a second modal (iOS can't stack one
                // over a sheet that is itself a modal).
                <View style={[styles.dropdown, { top: headerBottom }]} testID="verse-menu-panel">
                  {menu === 'root' ? (
                    <>
                      <Tap
                        style={styles.dropRow}
                        onPress={() => {
                          if (everyTranslation) {
                            setMenu('picker');
                            setExpanded(true);
                          } else {
                            setMenu('translations');
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Select translation, ${pickerTitle(translation)}`}
                        testID="verse-select-translation"
                      >
                        <Ionicons name="language-outline" size={22} color={palette.text} />
                        <View style={v2Only.flex}>
                          <Text style={[typeV2.menu, { color: palette.text }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                            Select translation
                          </Text>
                          <Text
                            style={[typeV2.meta, { color: palette.secondary }]}
                            numberOfLines={1}
                            maxFontSizeMultiplier={CHROME_TEXT_SCALE}
                          >
                            {translation.name}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
                      </Tap>
                      <Tap
                        style={styles.dropRow}
                        onPress={() => setMenu('reciters')}
                        accessibilityRole="button"
                        accessibilityLabel={`Select reciter, ${voiceLabel(resolveVoice(reciter))}`}
                      >
                        <Ionicons name="volume-high-outline" size={22} color={palette.text} />
                        <View style={v2Only.flex}>
                          <Text style={[typeV2.menu, { color: palette.text }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                            Select reciter
                          </Text>
                          <Text
                            style={[typeV2.meta, { color: palette.secondary }]}
                            numberOfLines={1}
                            maxFontSizeMultiplier={CHROME_TEXT_SCALE}
                          >
                            {voiceLabel(resolveVoice(reciter))}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
                      </Tap>
                    </>
                  ) : menu === 'reciters' ? (
                    <ReciterList
                      value={reciter}
                      onChange={(choice) => {
                        onChangeReciter(choice);
                      }}
                      // Within the sheet, however short a short verse leaves it.
                      maxHeight={Math.max(160, Math.min(320, sheetHeight - headerBottom - spacing.md))}
                    />
                  ) : (
                    TRANSLATIONS.map((t) => {
                      const available = isTranslationAvailable(t);
                      const chosen = t.id === translation.id;
                      return (
                        <Tap
                          key={t.id}
                          style={[styles.dropRow, !available && v2Only.disabled]}
                          disabled={!available}
                          onPress={() => {
                            onChangeTranslation(t.id);
                            setMenu('closed');
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: chosen, disabled: !available }}
                        >
                          <View style={v2Only.flex}>
                            <Text style={[typeV2.menu, { color: palette.text }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                              {pickerTitle(t)}
                            </Text>
                            {/* Credited as in the sheet: the source's site. */}
                            <Text style={styles.creditText} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                              {available ? `${t.language} · ` : 'Not available yet · '}
                              <Text style={styles.creditLink}>{t.credit.linkLabel}</Text>
                            </Text>
                          </View>
                          {chosen && <Ionicons name="checkmark" size={20} color={palette.text} />}
                        </Tap>
                      );
                    })
                  )}
                </View>
              )}
              {view.status === 'loading' && (
                <View style={styles.center}>
                  <ActivityIndicator color={palette.secondary} />
                </View>
              )}
              {view.status === 'error' && (
                <View style={styles.center} testID="verse-error">
                  {translation.id === CLEAR_QURAN_ID && arabicHere ? (
                    // Offline: kept only as read (its terms), so a verse not read before can't
                    // show. Saheeh International can, once it's on the phone; only if chosen.
                    <>
                      <Text style={[typeV2.name, v2Only.centerText, { color: palette.text }]} testID="verse-offline">
                        The Clear Quran® needs the internet
                      </Text>
                      <Text style={[typeV2.meta, v2Only.centerText, { color: palette.secondary }]}>
                        {alternative
                          ? `${nameWithLanguage(alternative)} is available offline.`
                          : "Verses you've read before show offline. Try again once you're online."}
                      </Text>
                    </>
                  ) : notDownloaded ? (
                    // A QuranEnc translation with this sura not on the phone (TRANS-7).
                    <>
                      <Text style={[typeV2.name, v2Only.centerText, { color: palette.text }]} testID="verse-offline">
                        This translation isn't downloaded
                      </Text>
                      <Text style={[typeV2.meta, v2Only.centerText, { color: palette.secondary }]}>
                        {alternative
                          ? `${nameWithLanguage(alternative)} is available offline.`
                          : 'Download it from Select translation to read it offline.'}
                      </Text>
                    </>
                  ) : offline ? (
                    <Text style={[typeV2.body, v2Only.centerText, { color: palette.secondary }]}>
                      This verse isn't downloaded yet. It shows when you're back online.
                    </Text>
                  ) : translation.id === CLEAR_QURAN_ID ? (
                    // Only ever this, or its own text: never another translation under its name.
                    <>
                      <Text style={[typeV2.name, { color: palette.text }]}>Couldn't load translation</Text>
                      <Text style={[typeV2.meta, v2Only.centerText, { color: palette.secondary }]}>
                        {clearQuranErrorHint(view.error)}
                      </Text>
                    </>
                  ) : (
                    <Text style={[typeV2.body, v2Only.centerText, { color: palette.secondary }]}>
                      Couldn't load this verse. Check your connection.
                    </Text>
                  )}
                  <View style={styles.errorActions}>
                    {alternative && (
                      <PillButton
                        title={`Show ${nameWithLanguage(alternative)}`}
                        variant="outline"
                        onPress={() => onChangeTranslation(alternative.id)}
                        testID={alternative.id === DEFAULT_TRANSLATION_ID ? 'verse-use-saheeh' : 'verse-use-offline'}
                      />
                    )}
                    <PillButton title="Try again" onPress={() => setAttempt((a) => a + 1)} testID="verse-retry" />
                  </View>
                </View>
              )}
              {view.status === 'ready' && (
                <GestureDetector gesture={Gesture.Simultaneous(bodyScroll, bodyPan)}>
                  <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator
                    // No bounce at the top: a drag down there moves the sheet instead.
                    bounces={false}
                    scrollEventThrottle={16}
                    onScroll={(e) => {
                      scrollY.value = e.nativeEvent.contentOffset.y;
                    }}
                    testID="verse-scroll"
                  >
                    <View style={styles.keyChip}>
                      <Text
                        style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}
                        maxFontSizeMultiplier={CHROME_TEXT_SCALE}
                      >
                        {view.text.sura}:{view.text.ayah}
                      </Text>
                    </View>
                    {/* The Arabic grows to twice its size; the translation as far as the reader's setting goes. */}
                    <Text style={styles.arabic} maxFontSizeMultiplier={2}>
                      {view.text.arabic}
                    </Text>
                    <Text
                      style={[styles.translation, rtl && styles.rtlText]}
                      accessibilityLanguage={translation.languageCode}
                      testID="verse-translation"
                    >
                      {/* Exactly as given; footnote markers shown as raised numbers. */}
                      {(translation.id === CLEAR_QURAN_ID
                        ? clearQuranSegments(view.text.translation)
                        : saheehSegments(view.text.translation, view.text.footnotes ?? '')
                      ).map((seg, i) =>
                        'footnote' in seg ? (
                          <Text key={i} style={styles.footnote}>
                            {seg.footnote}
                          </Text>
                        ) : (
                          seg.text
                        ),
                      )}
                    </Text>
                    {view.text.footnotes ? (
                      // A QuranEnc translation's footnotes, as given (its terms: nothing cut).
                      <View style={styles.footnotes} testID="verse-footnotes">
                        {saheehFootnotes(view.text.footnotes).map((f, i) => (
                          <Text key={i} style={[styles.footnoteText, rtl && styles.rtlFootnote]} accessibilityLanguage={translation.languageCode}>
                            {f.mark ? <Text style={styles.footnote}>{`${f.mark} `}</Text> : null}
                            {f.text}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {/* The Arabic's source, as Tanzil's terms ask; the translation's credit is pinned below. */}
                    <View style={styles.arabicCredit} testID="arabic-credit">
                      <Text style={styles.creditText} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                        {`${ARABIC_CREDIT.text} · `}
                      </Text>
                      <Text
                        style={styles.creditLink}
                        maxFontSizeMultiplier={CHROME_TEXT_SCALE}
                        onPress={() => Linking.openURL(ARABIC_CREDIT.url).catch(() => undefined)}
                        accessibilityRole="link"
                        accessibilityLabel={`${ARABIC_CREDIT.linkLabel}, opens the website`}
                        suppressHighlighting={false}
                      >
                        {ARABIC_CREDIT.linkLabel}
                      </Text>
                    </View>
                  </ScrollView>
                </GestureDetector>
              )}
              {view.status === 'ready' && (
                // Pinned under the verse, however long it is: always in view.
                <View style={styles.credit} testID="translation-credit">
                  <Text style={styles.creditText} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                    {creditLine(translation, view.text.version)}
                  </Text>
                  <Text
                    style={styles.creditLink}
                    maxFontSizeMultiplier={CHROME_TEXT_SCALE}
                    onPress={() => Linking.openURL(translation.credit.url).catch(() => undefined)}
                    accessibilityRole="link"
                    accessibilityLabel={`${translation.credit.linkLabel}, opens the website`}
                    suppressHighlighting={false}
                  >
                    {translation.credit.linkLabel}
                  </Text>
                </View>
              )}
          </View>
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** The sheet's styles, in the sheets' colours and corners. */
const makeStylesV2 = (p: PaletteV2) =>
  StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    // The dimmed backdrop: fades as the sheet is dragged down.
    dim: { backgroundColor: p.overlay },
    sheet: {
      minHeight: 240,
      backgroundColor: p.sheet,
      borderTopLeftRadius: radiusV2.sheet,
      borderTopRightRadius: radiusV2.sheet,
      paddingHorizontal: layoutV2.gutter,
      paddingBottom: layoutV2.gutter,
      overflow: 'hidden',
    },
    grabberHit: { alignSelf: 'center', paddingTop: 10, paddingBottom: 10, paddingHorizontal: spacing.lg },
    grabber: {
      width: layoutV2.handle.width,
      height: layoutV2.handle.height,
      borderRadius: layoutV2.handle.height / 2,
      backgroundColor: p.handle,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingBottom: 12,
      marginBottom: 12,
      borderBottomWidth: layoutV2.hairline,
      borderBottomColor: p.separator,
    },
    roundBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
    titleBox: { flex: 1, minWidth: 0 },
    titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    surahName: { ...typeV2.meta, color: p.secondary, flexShrink: 1 },
    surahArabic: { ...arabicV2(15), lineHeight: undefined, color: p.secondary },
    ayahLabel: { ...typeV2.sheetTitle, color: p.text },
    pill: { flexDirection: 'row', alignItems: 'center' },
    pillBtn: { minWidth: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
    // A menu: chrome, so it may lift off the sheet.
    dropdown: {
      position: 'absolute',
      right: layoutV2.gutter / 2,
      width: 280,
      paddingVertical: 4,
      borderRadius: radiusV2.media,
      backgroundColor: p.sheet,
      borderWidth: layoutV2.hairline,
      borderColor: p.separator,
      zIndex: 10,
      ...shadows.md,
    },
    dropRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 52,
      paddingHorizontal: layoutV2.gutter,
      paddingVertical: 10,
    },
    center: { paddingVertical: spacing.xl, paddingHorizontal: layoutV2.gutter, alignItems: 'center', gap: 12 },
    // Sized to the verse up to the room left between the header and the credit,
    // then scrolls: without flexShrink a long verse grew past the sheet.
    scroll: { flexGrow: 0, flexShrink: 1 },
    scrollContent: { paddingBottom: spacing.lg },
    keyChip: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderRadius: radiusV2.chip,
      backgroundColor: p.fill,
      marginBottom: layoutV2.gutter,
    },
    // Amiri's stacked marks need this line height on the longest verses.
    arabic: {
      ...arabicV2(28),
      lineHeight: 54,
      color: p.text,
      textAlign: 'right',
      writingDirection: 'rtl',
      marginBottom: layoutV2.gutter,
    },
    // Reading text: grows with Dynamic Type, uncapped.
    translation: { ...typeV2.body, fontSize: 18, lineHeight: 27, color: p.text },
    // A right-to-left translation: laid out from the right, with room for its script's marks.
    rtlText: { writingDirection: 'rtl', textAlign: 'right', lineHeight: 34 },
    rtlFootnote: { writingDirection: 'rtl', textAlign: 'right', lineHeight: 26 },
    // The picker of every translation: fills the sheet under the header.
    pickerPanel: {
      position: 'absolute',
      left: layoutV2.gutter,
      right: layoutV2.gutter,
      backgroundColor: p.sheet,
      zIndex: 10,
    },
    footnote: { color: p.accentText },
    footnotes: { marginTop: 12, gap: 8 },
    // Reading text too: grows with Dynamic Type, uncapped.
    footnoteText: { ...typeV2.body, fontSize: 14, lineHeight: 20, color: p.secondary },
    arabicCredit: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', marginTop: layoutV2.gutter },
    errorActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
    credit: {
      borderTopWidth: layoutV2.hairline,
      borderTopColor: p.separator,
      paddingTop: 12,
      marginTop: 8,
      gap: 2,
    },
    creditText: { ...typeV2.meta, color: p.secondary },
    creditLink: { ...typeV2.meta, color: p.link, fontWeight: '600', alignSelf: 'flex-start' },
  });

const v2Only = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.4 },
  centerText: { textAlign: 'center' },
});
