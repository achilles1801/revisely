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
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import {
  getPageTranslation,
  TranslatedAyah,
  TRANSLATION_NAME,
} from '../../lib/translation';

interface TranslationSheetProps {
  /** Page to translate; null hides the sheet. */
  pageNumber: number | null;
  onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; ayahs: TranslatedAyah[] }
  | { status: 'error' };

/**
 * The English translation of one mushaf page, opened by pressing and holding the
 * page during revision. A plain Modal rather than a gorhom sheet, like the
 * other revision overlays.
 */
export function TranslationSheet({ pageNumber, onClose }: TranslationSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (pageNumber == null) return;
    let live = true;
    setState({ status: 'loading' });
    getPageTranslation(pageNumber)
      .then((ayahs) => live && setState({ status: 'ready', ayahs }))
      .catch(() => live && setState({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [pageNumber, attempt]);

  return (
    <Modal
      visible={pageNumber != null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close translation">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={styles.sheet}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <SafeAreaView style={styles.safe}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Page {pageNumber}</Text>
                <Text style={styles.subtitle}>{TRANSLATION_NAME}</Text>
              </View>
              <PressableScale
                onPress={onClose}
                haptic="light"
                style={styles.closeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </PressableScale>
            </View>

            {state.status === 'loading' && (
              <View style={styles.center}>
                <ActivityIndicator color={theme.accent} />
              </View>
            )}

            {state.status === 'error' && (
              <View style={styles.center}>
                <Text style={styles.errorText}>Couldn't load the translation.</Text>
                <PressableScale
                  onPress={() => setAttempt((a) => a + 1)}
                  haptic="light"
                  style={styles.retryBtn}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </PressableScale>
              </View>
            )}

            {state.status === 'ready' && (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator
              >
                {state.ayahs.map((a, i) => {
                  const newSurah = i === 0 || state.ayahs[i - 1].surahNumber !== a.surahNumber;
                  return (
                    <View key={`${a.surahNumber}:${a.ayahNumber}`}>
                      {newSurah && <Text style={styles.surah}>{a.surahName}</Text>}
                      <View style={styles.ayah}>
                        <Text style={styles.ayahNumber}>
                          {a.surahNumber}:{a.ayahNumber}
                        </Text>
                        <Text style={styles.ayahText}>{a.text}</Text>
                      </View>
                    </View>
                  );
                })}
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
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '75%',
      minHeight: 220,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.lg,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      overflow: 'hidden',
    },
    safe: { flexShrink: 1 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    title: { ...typography.titleLarge, color: theme.textPrimary },
    subtitle: { ...typography.caption, color: theme.textMuted },
    closeBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    center: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
      gap: spacing.md,
    },
    errorText: { ...typography.bodyMedium, color: theme.textSecondary },
    retryBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      backgroundColor: theme.accent,
    },
    retryText: { ...typography.bodySmall, color: '#fff', fontWeight: '700' },
    scroll: { flexGrow: 0 },
    scrollContent: { paddingBottom: spacing.md },
    surah: {
      ...typography.titleSmall,
      color: theme.accent,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    ayah: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    ayahNumber: {
      ...typography.caption,
      color: theme.textMuted,
      minWidth: 44,
      paddingTop: 2,
    },
    ayahText: { ...typography.bodyMedium, color: theme.textPrimary, flex: 1 },
  });
