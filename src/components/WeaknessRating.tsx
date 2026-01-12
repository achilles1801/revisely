import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { Button } from './Button';
import { useApp } from '../context/AppContext';
import { getQuranData } from '../lib/quranData';

interface WeaknessModalProps {
  pageNumber: number;
  surahName: string;
  currentRating?: number;
  onSave?: (rating: number, applyToJuz: boolean) => void | Promise<void>;
  onClose: () => void;
}

const RATINGS = [
  { value: 1, label: 'Cannot recall', color: '#ef4444' },
  { value: 2, label: 'Major difficulty', color: '#f59e0b' },
  { value: 3, label: 'Some hesitation', color: '#eab308' },
  { value: 4, label: 'Mostly smooth', color: '#84cc16' },
  { value: 5, label: 'Completely solid', color: '#22c55e' },
];

export function WeaknessModal({ pageNumber, surahName, currentRating, onSave, onClose }: WeaknessModalProps) {
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

      // Determine which pages to update
      if (applyToJuz && pageJuz) {
        const juzPages = quranData
          .filter(q => q.juzNumber === pageJuz)
          .map(q => q.pageNumber);
        changedPageNumbers.push(...juzPages);
      } else {
        changedPageNumbers.push(pageNumber);
      }

      // Update pages in context
      const updatedPages = pages.map(p => {
        if (changedPageNumbers.includes(p.pageNumber)) {
          return { ...p, weaknessRating: selectedRating };
        }
        return p;
      });

      // Call onSave FIRST to update local UI state in parent
      if (onSave) {
        onSave(selectedRating, applyToJuz);
      }

      // Then save to Firestore
      await updatePages(updatedPages, changedPageNumbers);

      // Close modal
      onClose();
    } catch (err: any) {
      console.error('[WeaknessModal] Save error:', err);
      Alert.alert('Error', 'Failed to save rating. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={true}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modal}>
              <View style={styles.dragHandle} />
              
              <View style={styles.content}>
                <Text style={styles.headline}>Rate this page</Text>
                <Text style={styles.subtext}>
                  Page {pageNumber} · {surahName}
                </Text>

                <View style={styles.ratingsContainer}>
                  {RATINGS.map((rating) => (
                    <TouchableOpacity
                      key={rating.value}
                      style={[
                        styles.ratingButton,
                        selectedRating === rating.value && {
                          backgroundColor: rating.color + '20',
                          borderColor: rating.color,
                          borderWidth: 2,
                        },
                      ]}
                      onPress={() => setSelectedRating(rating.value)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.ratingText,
                          selectedRating === rating.value && {
                            color: rating.color,
                            fontWeight: '600',
                          },
                        ]}
                      >
                        {rating.value}. {rating.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setApplyToJuz(!applyToJuz)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, applyToJuz && styles.checkboxChecked]}>
                    {applyToJuz && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Apply to entire juz</Text>
                </TouchableOpacity>

                <Button
                  title={saving ? "Saving..." : "Save"}
                  onPress={handleSave}
                  variant="primary"
                  style={styles.saveButton}
                  disabled={!selectedRating || saving}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
    borderRadius: 0,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  headline: {
    ...typography.displaySmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtext: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  ratingsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  ratingButton: {
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    alignItems: 'center',
  },
  ratingText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 0,
    marginRight: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  saveButton: {
    width: '100%',
  },
});

