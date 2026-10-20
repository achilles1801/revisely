import React from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import type { ReadPalette } from '../../theme/readPalette';

interface ReciteButtonProps {
  onPress: () => void;
  busy: boolean;
  palette: ReadPalette;
}

/** Start checking recitation: the screen's main action while reading. */
export function ReciteButton({ onPress, busy }: ReciteButtonProps) {
  const { theme } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      haptic="medium"
      scale={0.96}
      style={[styles.pill, { backgroundColor: theme.accent }]}
      accessibilityRole="button"
      accessibilityLabel="Recite"
      accessibilityHint="Listens as you recite and marks missed or wrong words"
    >
      {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="mic" size={16} color="#fff" />}
      <Text style={styles.label}>Recite</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  label: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
