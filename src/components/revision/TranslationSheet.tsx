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
  getAyahTranslation,
  TranslatedAyah,
  TRANSLATION_NAME,
} from '../../lib/translation';
import { AyahRef } from '../../lib/ayahBounds';

interface TranslationSheetProps {
  /** Verse to translate; null hides the sheet. */
  ayah: AyahRef | null;
  onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; ayah: TranslatedAyah }
  | { status: 'error' };

/**
 * The English translation of one verse, opened by pressing and holding the verse
 * on the page during revision; the verse stays highlighted on the page above.
 * A plain Modal rather than a gorhom sheet, like the other revision overlays.
 */
export function TranslationSheet({ ayah, onClose }: TranslationSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (ayah == null) return;
    let live = true;
    setState({ status: 'loading' });
    getAyahTranslation(ayah.page, ayah.sura, ayah.ayah)
      .then((t) => live && setState({ status: 'ready', ayah: t }))
      .catch(() => live && setState({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [ayah, attempt]);

  const title =
    state.status === 'ready'
      ? `${state.ayah.surahName} · ${ayah?.sura}:${ayah?.ayah}`
      : ayah
        ? `${ayah.sura}:${ayah.ayah}`
        : '';

  return (
    <Modal
      visible={ayah != null}
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
                <Text style={styles.title}>{title}</Text>
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
                <Text style={styles.ayahText}>{state.ayah.text}</Text>
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
      // Light, so the highlighted verse stays readable above the sheet.
      backgroundColor: 'rgba(0,0,0,0.12)',
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '50%',
      minHeight: 160,
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
    ayahText: { ...typography.bodyLarge, color: theme.textPrimary },
  });
