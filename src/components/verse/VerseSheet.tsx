import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Backdrop } from '../Backdrop';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { fonts, typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { getSurahDisplay } from '../../lib/quranData';
import {
  getVerseText,
  isTranslationAvailable,
  pickerTitle,
  CLEAR_QURAN_ID,
  resolveTranslation,
  peekVerseText,
  prefetchVerseNeighbours,
  TRANSLATIONS,
  VerseText,
} from '../../lib/translation';
import { clearQuranErrorHint, clearQuranSegments } from '../../lib/clearQuran';
import { nextVerse, previousVerse } from '../../lib/verses';
import { resolveVoice, voiceLabel } from '../../lib/recitation';
import { ReciterList } from './ReciterList';
import { AyahRef } from '../../lib/ayahBounds';

interface VerseSheetProps {
  /** Verse shown; null hides the sheet. */
  verse: AyahRef | null;
  translationId: string | undefined;
  onChangeTranslation: (id: string) => void;
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

/** Pulling the verse down past its top by this much (iOS overscroll) shrinks an
 *  expanded sheet, or closes one at normal height. */
export const OVERSCROLL_TO_DISMISS = 80;
export function overscrollAction(offsetY: number, expanded: boolean): 'shrink' | 'close' | null {
  if (offsetY > -OVERSCROLL_TO_DISMISS) return null;
  return expanded ? 'shrink' : 'close';
}

/** Header and credit text grow with Dynamic Type only this far, so the verse keeps the room. */
const CHROME_TEXT_SCALE = 1.4;

/** What a vertical swipe on the grabber does (dy: points moved, up negative). */
export function grabberSwipe(dy: number, expanded: boolean): 'expand' | 'shrink' | 'close' | null {
  if (dy < -30) return expanded ? null : 'expand';
  if (dy > 30) return expanded ? 'shrink' : 'close';
  return null;
}

/**
 * A held verse's Arabic text and translation, with previous/next and the
 * translation picker under "…". A plain Modal rather than a gorhom sheet, like
 * the other overlays on the reading screens.
 *
 * The header stays put and the verse scrolls under it: a long verse (2:282)
 * runs well past the sheet. The grabber expands the sheet to nearly the whole
 * screen (swipe up or tap) and back (swipe down; down again closes it); pulling
 * the verse down past its top does the same. A credited translation's credit
 * stays pinned under the verse.
 *
 * The dimmed backdrop sits behind the sheet, not around it: a scroll view inside
 * a Pressable doesn't scroll on iOS (see Backdrop).
 */
export function VerseSheet({
  verse,
  translationId,
  onChangeTranslation,
  reciter,
  onChangeReciter,
  onNavigate,
  onClose,
}: VerseSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [menu, setMenu] = useState<'closed' | 'root' | 'translations' | 'reciters'>('closed');
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

  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const act = (action: 'expand' | 'shrink' | 'close' | null) => {
    if (action === 'expand') setExpanded(true);
    else if (action === 'shrink') setExpanded(false);
    else if (action === 'close') onCloseRef.current();
  };
  const actRef = useRef(act);
  actRef.current = act;
  const grabberPan = useMemo(
    () =>
      PanResponder.create({
        // Claimed from the start, so a swipe from the title works too; the
        // header's buttons are deeper and still take their taps.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => actRef.current(grabberSwipe(g.dy, expandedRef.current)),
      }),
    [],
  );

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

  return (
    <Modal visible={verse != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Backdrop onPress={onClose} label="Close translation" />
        <View
          style={[styles.sheet, { maxHeight, paddingBottom: Math.max(insets.bottom, spacing.md) }]}
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
          testID="verse-sheet"
        >
          <GlassCard surface="chrome" style={StyleSheet.absoluteFillObject} />
            {/* Grabber and header: swipe up to expand, down to shrink or close. */}
            <View
              {...grabberPan.panHandlers}
              onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
            >
              <Pressable
                onPress={() => setExpanded((e) => !e)}
                hitSlop={{ top: 8, bottom: 8, left: 40, right: 40 }}
                style={styles.grabberHit}
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Make the translation smaller' : 'Expand the translation'}
              >
                <View style={[styles.grabber, { backgroundColor: theme.border }]} />
              </Pressable>
              <View style={styles.headerRow}>
                <PressableScale onPress={onClose} haptic="light" style={styles.roundBtn} accessibilityLabel="Close">
                  <Ionicons name="close" size={20} color={theme.textPrimary} />
                </PressableScale>
                <View style={styles.titleBox}>
                  <View style={styles.titleLine}>
                    <Text style={styles.surahName} numberOfLines={1} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                      {surah?.nameDisplay ?? ''}
                    </Text>
                    {surah ? (
                      <Text style={styles.surahArabic} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                        {surah.nameArabicVoweled}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.ayahLabel} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                    Ayah {verse?.ayah}
                  </Text>
                </View>
                <View style={styles.pill}>
                  <Pressable
                    onPress={() => prev && onNavigate(prev)}
                    disabled={!prev}
                    hitSlop={6}
                    accessibilityLabel="Previous verse"
                    style={styles.pillBtn}
                  >
                    <Ionicons name="chevron-back" size={18} color={prev ? theme.textPrimary : theme.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => next && onNavigate(next)}
                    disabled={!next}
                    hitSlop={6}
                    accessibilityLabel="Next verse"
                    style={styles.pillBtn}
                  >
                    <Ionicons name="chevron-forward" size={18} color={next ? theme.textPrimary : theme.textMuted} />
                  </Pressable>
                </View>
                <PressableScale
                  onPress={() => setMenu(menu === 'closed' ? 'root' : 'closed')}
                  haptic="light"
                  style={styles.roundBtn}
                  accessibilityLabel="More"
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={theme.textPrimary} />
                </PressableScale>
              </View>
            </View>

            {menu !== 'closed' && (
              <View style={[styles.dropdown, { top: headerBottom }]}>
                <GlassCard surface="chrome" elevated style={StyleSheet.absoluteFillObject} />
                {menu === 'root' ? (
                  <>
                    <Pressable style={styles.dropRow} onPress={() => setMenu('translations')}>
                      <Text style={[typography.bodyMedium, { color: theme.textPrimary, flex: 1 }]}>
                        Select translation
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                    </Pressable>
                    <Pressable style={styles.dropRow} onPress={() => setMenu('reciters')}>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodyMedium, { color: theme.textPrimary }]}>Select reciter</Text>
                        <Text style={[typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
                          {voiceLabel(resolveVoice(reciter))}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                    </Pressable>
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
                    return (
                      <Pressable
                        key={t.id}
                        style={[styles.dropRow, !available && { opacity: 0.5 }]}
                        disabled={!available}
                        onPress={() => {
                          onChangeTranslation(t.id);
                          setMenu('closed');
                        }}
                        accessibilityState={{ selected: t.id === translation.id, disabled: !available }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.bodyMedium, { color: theme.textPrimary }]}>{pickerTitle(t)}</Text>
                          {t.credit ? (
                            // Credited as in the sheet: the publisher's site.
                            <Text style={styles.creditText}>
                              {available ? `${t.language} · ` : 'Not available yet · '}
                              <Text style={styles.creditLink}>{t.credit.linkLabel}</Text>
                            </Text>
                          ) : (
                            <Text style={[typography.caption, { color: theme.textMuted }]}>
                              {available ? `${t.language} · ${t.author}` : `${t.author} · not available yet`}
                            </Text>
                          )}
                        </View>
                        {t.id === translation.id && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                      </Pressable>
                    );
                  })
                )}
              </View>
            )}

            {view.status === 'loading' && (
              <View style={styles.center}>
                <ActivityIndicator color={theme.accent} />
              </View>
            )}
            {view.status === 'error' && (
              <View style={styles.center} testID="verse-error">
                {translation.id === CLEAR_QURAN_ID ? (
                  // Only ever this, or its own text: never another translation under its name.
                  <>
                    <Text style={[typography.bodyMedium, { color: theme.textPrimary, fontWeight: '600' }]}>
                      Couldn't load translation
                    </Text>
                    <Text style={[typography.bodySmall, { color: theme.textSecondary, textAlign: 'center' }]}>
                      {clearQuranErrorHint(view.error)}
                    </Text>
                  </>
                ) : (
                  <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>
                    Couldn't load this verse. Check your connection.
                  </Text>
                )}
                <PressableScale onPress={() => setAttempt((a) => a + 1)} haptic="light" style={styles.retryBtn}>
                  <Text style={[typography.bodySmall, { color: '#fff', fontWeight: '700' }]}>Try again</Text>
                </PressableScale>
              </View>
            )}
            {view.status === 'ready' && (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator
                onScrollEndDrag={(e) => act(overscrollAction(e.nativeEvent.contentOffset.y, expanded))}
                testID="verse-scroll"
              >
                <View style={[styles.keyChip, { borderColor: theme.border, backgroundColor: theme.glass }]}>
                  <Text style={[typography.caption, { color: theme.textSecondary }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                    {view.text.sura}:{view.text.ayah}
                  </Text>
                </View>
                {/* The Arabic grows to twice its size; the translation as far as the reader's setting goes. */}
                <Text style={styles.arabic} maxFontSizeMultiplier={2}>
                  {view.text.arabic}
                </Text>
                <Text style={styles.translation} testID="verse-translation">
                  {translation.id === CLEAR_QURAN_ID
                    ? // Exactly as given; its footnote markers shown as raised numbers.
                      clearQuranSegments(view.text.translation).map((seg, i) =>
                        'footnote' in seg ? (
                          <Text key={i} style={styles.footnote}>
                            {seg.footnote}
                          </Text>
                        ) : (
                          seg.text
                        ),
                      )
                    : view.text.translation}
                </Text>
                {/* A credited translation has its credit pinned below instead. */}
                {!translation.credit && <Text style={styles.source}>{view.text.translationName}</Text>}
              </ScrollView>
            )}
            {view.status === 'ready' && translation.credit && (
              // Pinned under the verse, however long it is: always in view.
              <View style={[styles.credit, { borderTopColor: theme.border }]} testID="translation-credit">
                <Text style={styles.creditText} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                  {translation.credit.text}
                </Text>
                <Text
                  style={styles.creditLink}
                  maxFontSizeMultiplier={CHROME_TEXT_SCALE}
                  onPress={() => Linking.openURL(translation.credit!.url).catch(() => undefined)}
                  accessibilityRole="link"
                  accessibilityLabel={`${translation.credit.linkLabel}, opens the website`}
                  suppressHighlighting={false}
                >
                  {translation.credit.linkLabel}
                </Text>
              </View>
            )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
    sheet: {
      minHeight: 240,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      overflow: 'hidden',
    },
    grabberHit: { alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg },
    grabber: { width: 40, height: 5, borderRadius: 3 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
    roundBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    titleBox: { flex: 1 },
    titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    surahName: { ...typography.bodyMedium, color: theme.textSecondary, flexShrink: 1 },
    surahArabic: { fontFamily: fonts.arabic, fontSize: 16, color: theme.textSecondary },
    ayahLabel: { ...typography.titleMedium, color: theme.textPrimary, fontWeight: '700' },
    pill: {
      flexDirection: 'row',
      borderRadius: radius.full,
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    pillBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2 },
    dropdown: {
      position: 'absolute',
      right: 0,
      width: 280,
      borderRadius: radius.md,
      overflow: 'hidden',
      zIndex: 10,
    },
    dropRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    center: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.md },
    retryBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      backgroundColor: theme.accent,
    },
    // Sized to the verse up to the room left between the header and the credit,
    // then scrolls: without flexShrink a long verse grew past the sheet.
    scroll: { flexGrow: 0, flexShrink: 1 },
    scrollContent: { paddingBottom: spacing.lg },
    keyChip: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: spacing.md,
    },
    arabic: {
      fontFamily: fonts.arabic,
      fontSize: 28,
      lineHeight: 54,
      color: theme.textPrimary,
      textAlign: 'right',
      writingDirection: 'rtl',
      marginBottom: spacing.md,
    },
    translation: { ...typography.bodyLarge, fontSize: 18, lineHeight: 27, color: theme.textPrimary },
    source: { ...typography.caption, color: theme.textMuted, marginTop: spacing.md },
    footnote: { color: theme.accent },
    credit: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: spacing.sm,
      marginTop: spacing.xs,
      gap: 2,
    },
    creditText: { ...typography.caption, color: theme.textSecondary },
    creditLink: { ...typography.caption, color: theme.accent, fontWeight: '600', alignSelf: 'flex-start' },
  });
