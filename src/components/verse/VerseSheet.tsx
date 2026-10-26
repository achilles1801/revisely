import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  resolveTranslation,
  TRANSLATIONS,
  VerseText,
} from '../../lib/translation';
import { useClearQuranPreview } from '../../lib/clearQuranPreview';
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

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; text: VerseText }
  | { status: 'error' };

/** Sheet height: as it opens, and expanded (swipe the grabber up, or tap it). */
export const SHEET_HEIGHT = { normal: '70%', expanded: '92%' } as const;

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
 * screen (swipe up or tap) and back (swipe down; down again closes it).
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
  // A tester's preview of The Clear Quran (turned on or off) changes the choice.
  useClearQuranPreview();
  const translation = resolveTranslation(translationId);
  const [expanded, setExpanded] = useState(false);
  // Where the "…" menu opens: under the header, however tall large text makes it.
  const [headerBottom, setHeaderBottom] = useState(96);

  // A closed sheet reopens at normal height. (Another verse starts at its top
  // by itself: loading it replaces the scrolling part.)
  useEffect(() => {
    if (verse == null) setExpanded(false);
  }, [verse]);

  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const grabberPan = useMemo(
    () =>
      PanResponder.create({
        // Claimed from the start, so a swipe from the title works too; the
        // header's buttons are deeper and still take their taps.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          const action = grabberSwipe(g.dy, expandedRef.current);
          if (action === 'expand') setExpanded(true);
          else if (action === 'shrink') setExpanded(false);
          else if (action === 'close') onCloseRef.current();
        },
      }),
    [],
  );

  useEffect(() => {
    if (verse == null) {
      setMenu('closed');
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    getVerseText(verse.page, verse.sura, verse.ayah, translation.id)
      .then((text) => live && setState({ status: 'ready', text }))
      .catch(() => live && setState({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [verse, translation.id, attempt]);

  const surah = verse ? getSurahDisplay(verse.sura) : undefined;
  const prev = verse ? previousVerse(verse) : null;
  const next = verse ? nextVerse(verse) : null;

  return (
    <Modal visible={verse != null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close translation">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { maxHeight: expanded ? SHEET_HEIGHT.expanded : SHEET_HEIGHT.normal }]}
          testID="verse-sheet"
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <SafeAreaView style={styles.safe}>
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
                    <Text style={styles.surahName} numberOfLines={1}>
                      {surah?.nameDisplay ?? ''}
                    </Text>
                    {surah ? <Text style={styles.surahArabic}>{surah.nameArabicVoweled}</Text> : null}
                  </View>
                  <Text style={styles.ayahLabel}>Ayah {verse?.ayah}</Text>
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
                <GlassCard elevated style={StyleSheet.absoluteFillObject} />
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
                    maxHeight={320}
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

            {state.status === 'loading' && (
              <View style={styles.center}>
                <ActivityIndicator color={theme.accent} />
              </View>
            )}
            {state.status === 'error' && (
              <View style={styles.center}>
                <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>
                  Couldn't load this verse. Check your connection.
                </Text>
                <PressableScale onPress={() => setAttempt((a) => a + 1)} haptic="light" style={styles.retryBtn}>
                  <Text style={[typography.bodySmall, { color: '#fff', fontWeight: '700' }]}>Try again</Text>
                </PressableScale>
              </View>
            )}
            {state.status === 'ready' && (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator
                testID="verse-scroll"
              >
                <View style={[styles.keyChip, { borderColor: theme.border, backgroundColor: theme.glass }]}>
                  <Text style={[typography.caption, { color: theme.textSecondary }]}>
                    {state.text.sura}:{state.text.ayah}
                  </Text>
                </View>
                <Text style={styles.arabic}>{state.text.arabic}</Text>
                <Text style={[styles.translation, state.text.placeholder && styles.placeholder]}>
                  {state.text.translation}
                </Text>
                {/* A credited translation has its credit pinned below instead. */}
                {!translation.credit && <Text style={styles.source}>{state.text.translationName}</Text>}
              </ScrollView>
            )}
            {state.status === 'ready' && translation.credit && (
              // Pinned under the verse, however long it is: always in view.
              <View style={[styles.credit, { borderTopColor: theme.border }]} testID="translation-credit">
                <Text style={styles.creditText}>{translation.credit.text}</Text>
                <Text
                  style={styles.creditLink}
                  onPress={() => Linking.openURL(translation.credit!.url).catch(() => undefined)}
                  accessibilityRole="link"
                  accessibilityLabel={`${translation.credit.linkLabel}, opens the website`}
                  suppressHighlighting={false}
                >
                  {translation.credit.linkLabel}
                </Text>
              </View>
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
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
    safe: { flexShrink: 1 },
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
    // Sized to the verse up to the space left under the header, then scrolls:
    // without flexShrink a long verse grew past the sheet and was cut off.
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
    placeholder: { color: theme.textSecondary, fontStyle: 'italic' },
    credit: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: spacing.sm,
      marginTop: spacing.xs,
      gap: 2,
    },
    creditText: { ...typography.caption, color: theme.textSecondary },
    creditLink: { ...typography.caption, color: theme.accent, fontWeight: '600', alignSelf: 'flex-start' },
  });
