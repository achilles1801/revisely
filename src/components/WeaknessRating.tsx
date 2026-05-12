import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { useApp } from '../context/AppContext';
import { getQuranData } from '../lib/quranData';
import { logger } from '../lib/logger';
import { RATINGS } from '../lib/ratings';

interface WeaknessModalProps {
  pageNumber: number;
  surahName: string;
  currentRating?: number;
  onSave?: (rating: number, applyToJuz: boolean) => void | Promise<void>;
  onClose: () => void;
}

// Maps a 1–5 rating to a semantic color from the theme.
function ratingTone(rating: number, theme: ThemeColors): string {
  if (rating <= 2) return theme.error;
  if (rating === 3) return theme.warning;
  return theme.accent;
}

export function WeaknessModal({
  pageNumber,
  surahName,
  currentRating,
  onSave,
  onClose,
}: WeaknessModalProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { pages, updatePages } = useApp();
  const [selectedRating, setSelectedRating] = useState<number | null>(currentRating ?? null);
  const [applyToJuz, setApplyToJuz] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedRating) return;
    setSaving(true);

    try {
      const quranData = getQuranData();
      const changedPageNumbers: number[] = [];
      const pageJuz = quranData.find(q => q.pageNumber === pageNumber)?.juzNumber;

      if (applyToJuz && pageJuz) {
        const juzPages = quranData
          .filter(q => q.juzNumber === pageJuz)
          .map(q => q.pageNumber);
        changedPageNumbers.push(...juzPages);
      } else {
        changedPageNumbers.push(pageNumber);
      }

      const updatedPages = pages.map(p =>
        changedPageNumbers.includes(p.pageNumber)
          ? { ...p, weaknessRating: selectedRating }
          : p,
      );

      onSave?.(selectedRating, applyToJuz);
      await updatePages(updatedPages, changedPageNumbers);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (err: any) {
      logger.error('[WeaknessModal] Save error:', err);
      Alert.alert('Error', 'Failed to save rating. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <PressableScale
        onPress={onClose}
        haptic="none"
        scale={1}
        style={styles.overlay}
      >
        <PressableScale haptic="none" scale={1} style={styles.sheet}>
          <View style={styles.dragHandle} />

          <View style={styles.content}>
            <Text style={styles.headline}>Rate this page</Text>
            <Text style={styles.subtext}>
              Page {pageNumber} · {surahName}
            </Text>

            <View style={styles.ratingsContainer}>
              {RATINGS.map((rating) => {
                const isSelected = selectedRating === rating.value;
                const tone = ratingTone(rating.value, theme);
                return (
                  <PressableScale
                    key={rating.value}
                    onPress={() => setSelectedRating(rating.value)}
                    haptic="selection"
                    style={[
                      styles.ratingButton,
                      isSelected && {
                        backgroundColor: theme.accentSoft,
                        borderColor: tone,
                      },
                    ]}
                  >
                    <View style={[styles.ratingDot, { backgroundColor: tone }]} />
                    <Text
                      style={[
                        styles.ratingText,
                        isSelected && { color: theme.textPrimary, fontWeight: '600' },
                      ]}
                    >
                      {rating.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={tone} />
                    )}
                  </PressableScale>
                );
              })}
            </View>

            <PressableScale
              onPress={() => setApplyToJuz(!applyToJuz)}
              haptic="selection"
              style={styles.checkboxRow}
            >
              <View style={[styles.checkbox, applyToJuz && styles.checkboxChecked]}>
                {applyToJuz && (
                  <Ionicons name="checkmark" size={14} color={theme.textInverse} />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Apply to entire juz</Text>
            </PressableScale>

            <Button
              title="Save"
              onPress={handleSave}
              variant="primary"
              loading={saving}
              style={styles.saveButton}
              disabled={!selectedRating}
            />
          </View>
        </PressableScale>
      </PressableScale>
    </Modal>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      maxHeight: '85%',
      ...shadows.lg,
    },
    dragHandle: {
      width: 40,
      height: 4,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginBottom: spacing.md,
      borderRadius: radius.full,
    },
    content: {
      paddingHorizontal: spacing.lg,
    },
    headline: {
      ...typography.titleLarge,
      color: theme.textPrimary,
      marginBottom: spacing.xxs,
    },
    subtext: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      marginBottom: spacing.lg,
    },
    ratingsContainer: {
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    ratingButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: theme.bgAlt,
      borderWidth: 1.5,
      borderColor: 'transparent',
      borderRadius: radius.sm,
    },
    ratingDot: {
      width: 8,
      height: 8,
      borderRadius: radius.full,
    },
    ratingText: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      flex: 1,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.lg,
      paddingVertical: spacing.xs,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderWidth: 1.5,
      borderColor: theme.border,
      borderRadius: radius.xs,
      marginRight: spacing.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkboxChecked: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    checkboxLabel: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
    },
    saveButton: {
      width: '100%',
    },
  });
