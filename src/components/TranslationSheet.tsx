import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from './GlassCard';
import { PressableScale } from './PressableScale';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import {
  getVersesByPage,
  VerseWithTranslations,
} from '../services/quranFoundation';

interface TranslationSheetProps {
  visible: boolean;
  pageNumber: number | null;
  onClose: () => void;
}

/**
 * Bottom sheet that pulls verse text + English translation for the given page
 * via the Quran Foundation Content API. Lets the user understand what's on
 * the page they're revising — useful both for context and accountability
 * (e.g. confirming you actually know what you just checked off).
 */
export function TranslationSheet({
  visible,
  pageNumber,
  onClose,
}: TranslationSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(theme);
  const [verses, setVerses] = useState<VerseWithTranslations[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || pageNumber == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVerses([]);
    getVersesByPage(pageNumber)
      .then((v) => {
        if (!cancelled) setVerses(v);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load translation');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, pageNumber]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* Dismiss target above the sheet only — wrapping the whole backdrop
            in a Pressable steals the responder from the ScrollView when it
            reaches its top, blocking further scroll. Keeping these as
            siblings lets the ScrollView own its own gestures cleanly. */}
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheet}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.titleLarge, { color: theme.textPrimary }]}>
                Translation
              </Text>
              <Text style={[typography.bodySmall, { color: theme.textSecondary }]}>
                {pageNumber != null
                  ? `Page ${pageNumber} · Saheeh International`
                  : ''}
              </Text>
            </View>
            <PressableScale onPress={onClose} haptic="light">
              <Ionicons name="close-circle" size={28} color={theme.textMuted} />
            </PressableScale>
          </View>

          {loading && (
            <View style={styles.center}>
              <ActivityIndicator color={theme.accent} />
              <Text
                style={[
                  typography.bodySmall,
                  { color: theme.textMuted, marginTop: spacing.sm },
                ]}
              >
                Pulling from Quran.com…
              </Text>
            </View>
          )}

          {error && !loading && (
            <View style={styles.center}>
              <Text style={[typography.bodyMedium, { color: theme.error }]}>
                {error}
              </Text>
            </View>
          )}

          {!loading && !error && verses.length > 0 && (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                // Home-indicator clearance — the sheet anchors to the bottom
                // of the window so without this the last verse sits under
                // the indicator and feels cut off.
                { paddingBottom: spacing.xl + insets.bottom },
              ]}
            >
              {verses.map((v) => (
                <View key={v.id} style={styles.verseBlock}>
                  <Text style={[typography.label, { color: theme.accent }]}>
                    {v.verse_key}
                  </Text>
                  {v.text_uthmani && (
                    <Text style={[styles.arabic, { color: theme.textPrimary }]}>
                      {v.text_uthmani}
                    </Text>
                  )}
                  {(v.translations ?? []).map((t, i) => (
                    <Text
                      key={i}
                      style={[
                        typography.bodyMedium,
                        { color: theme.textSecondary, marginTop: spacing.xs },
                      ]}
                    >
                      {stripHtml(t.text)}
                    </Text>
                  ))}
                </View>
              ))}
              <Text
                style={[
                  typography.bodySmall,
                  {
                    color: theme.textMuted,
                    textAlign: 'center',
                    marginTop: spacing.md,
                  },
                ]}
              >
                Content provided by Quran.Foundation
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// QF translations sometimes embed footnote/tag markup like <sup foot_note="123">1</sup>.
// Strip it for clean display; expanded inline-footnote rendering can come later.
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    dismissArea: {
      flex: 1,
    },
    sheet: {
      height: '85%',
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      overflow: 'hidden',
      padding: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xl,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    verseBlock: {
      marginBottom: spacing.lg,
    },
    arabic: {
      fontSize: 22,
      lineHeight: 38,
      textAlign: 'right',
      marginTop: spacing.xs,
      writingDirection: 'rtl',
    },
  });
