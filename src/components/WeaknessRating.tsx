import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import { getQuranData } from '../lib/quranData';
import { logger } from '../lib/logger';
import { RATINGS } from '../lib/ratings';
import { useHaptics } from '../design/haptics';
import { Sheet } from './v2/Sheet';
import { Tap } from './v2/Tap';
import { Toggle } from './v2/TopBar';
import { layoutV2, typeV2 } from '../theme/v2';
import { strengthTone } from './insights/strength';

interface WeaknessModalProps {
  pageNumber: number;
  surahName: string;
  currentRating?: number;
  onSave?: (rating: number, applyToJuz: boolean) => void | Promise<void>;
  onClose: () => void;
}

// Each rating's dot is strengthTone: weak red, moderate grey, strong green
// whatever the accent.
export function WeaknessModal({
  pageNumber,
  surahName,
  currentRating,
  onSave,
  onClose,
}: WeaknessModalProps) {
  const { palette } = useTheme();
  const haptics = useHaptics();
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
      haptics.success();
      onClose();
    } catch (err: any) {
      logger.error('[WeaknessModal] Save error:', err);
      Alert.alert('Error', 'Failed to save rating. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Rate this page"
      message={`Page ${pageNumber} · ${surahName}`}
      left={{ label: 'Cancel', onPress: onClose }}
      right={{ label: saving ? 'Saving…' : 'Save', onPress: handleSave, strong: true, disabled: !selectedRating || saving }}
      scroll
      testID="rating-sheet"
    >
      {RATINGS.map((rating) => {
        const selected = selectedRating === rating.value;
        return (
          <Tap
            key={rating.value}
            onPress={() => {
              haptics.selection();
              setSelectedRating(rating.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={rating.label}
            style={v2.row}
            testID={`rating-${rating.value}`}
          >
            <View style={[v2.dot, { backgroundColor: strengthTone(rating.value, palette) }]} testID={`rating-dot-${rating.value}`} />
            <Text style={[typeV2.menu, v2.label, { color: palette.text }, selected && v2.selected]}>{rating.label}</Text>
            {selected ? <Ionicons name="checkmark" size={20} color={palette.text} /> : null}
          </Tap>
        );
      })}
      <View style={[v2.row, v2.juz, { borderTopColor: palette.separator }]}>
        <Text style={[typeV2.body, v2.label, { color: palette.text }]}>Apply to the whole juz</Text>
        <Toggle value={applyToJuz} onValueChange={setApplyToJuz} accessibilityLabel="Apply to the whole juz" />
      </View>
    </Sheet>
  );
}

const v2 = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { flex: 1 },
  selected: { fontWeight: '600' },
  juz: { borderTopWidth: layoutV2.hairline, marginTop: 6 },
});
