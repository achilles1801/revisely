import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { getVerseText, resolveTranslation, TRANSLATIONS, VerseText } from '../../lib/translation';
import { nextVerse, previousVerse } from '../../lib/verses';
import { AyahRef } from '../../lib/ayahBounds';

interface VerseSheetProps {
  /** Verse shown; null hides the sheet. */
  verse: AyahRef | null;
  translationId: string | undefined;
  onChangeTranslation: (id: string) => void;
  /** Previous / next verse. */
  onNavigate: (verse: { sura: number; ayah: number }) => void;
  onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; text: VerseText }
  | { status: 'error' };

/**
 * A held verse's Arabic text and translation, with previous/next and the
 * translation picker under "…". A plain Modal rather than a gorhom sheet, like
 * the other overlays on the reading screens.
 */
export function VerseSheet({
  verse,
  translationId,
  onChangeTranslation,
  onNavigate,
  onClose,
}: VerseSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [menu, setMenu] = useState<'closed' | 'root' | 'translations'>('closed');
  const translation = resolveTranslation(translationId);

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
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <SafeAreaView style={styles.safe}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
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

            {menu !== 'closed' && (
              <View style={styles.dropdown}>
                <GlassCard elevated style={StyleSheet.absoluteFillObject} />
                {menu === 'root' ? (
                  <Pressable style={styles.dropRow} onPress={() => setMenu('translations')}>
                    <Text style={[typography.bodyMedium, { color: theme.textPrimary, flex: 1 }]}>
                      Select translation
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                  </Pressable>
                ) : (
                  TRANSLATIONS.map((t) => (
                    <Pressable
                      key={t.id}
                      style={[styles.dropRow, !t.available && { opacity: 0.5 }]}
                      disabled={!t.available}
                      onPress={() => {
                        onChangeTranslation(t.id);
                        setMenu('closed');
                      }}
                      accessibilityState={{ selected: t.id === translation.id, disabled: !t.available }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodyMedium, { color: theme.textPrimary }]}>{t.name}</Text>
                        <Text style={[typography.caption, { color: theme.textMuted }]}>
                          {t.available ? `${t.language} · ${t.author}` : `${t.author} · not available yet`}
                        </Text>
                      </View>
                      {t.id === translation.id && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                    </Pressable>
                  ))
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
              <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <View style={[styles.keyChip, { borderColor: theme.border, backgroundColor: theme.glass }]}>
                  <Text style={[typography.caption, { color: theme.textSecondary }]}>
                    {state.text.sura}:{state.text.ayah}
                  </Text>
                </View>
                <Text style={styles.arabic}>{state.text.arabic}</Text>
                <Text style={styles.translation}>{state.text.translation}</Text>
                <Text style={styles.source}>{state.text.translationName}</Text>
              </ScrollView>
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
      maxHeight: '70%',
      minHeight: 240,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      overflow: 'hidden',
    },
    safe: { flexShrink: 1 },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: spacing.sm, marginBottom: spacing.md },
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
      top: 96,
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
    scroll: { flexGrow: 0 },
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
  });
