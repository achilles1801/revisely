import React from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReadPalette } from '../../theme/readPalette';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from '../v2/Tap';

export const ROUND_BUTTON_SIZE = 36;

interface RoundButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  palette: ReadPalette;
  /** Filled (e.g. the current page marked revised). */
  active?: boolean;
}

/**
 * A round button in the reader's header (back, help, mark, menu): a bare
 * icon; `active` (the page marked revised) is the one coloured thing on
 * screen, a jade "done" circle.
 */
export function RoundButton({ icon, label, onPress, palette, active }: RoundButtonProps) {
  const { palette: v2 } = useTheme();
  return (
    <Tap
      onPress={onPress}
      hitSlop={8}
      style={[styles.bare, active && { backgroundColor: v2.done }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active != null ? { selected: active } : undefined}
      testID={active ? 'round-button-active' : undefined}
    >
      <Ionicons
        name={active ? 'checkmark' : icon}
        size={active ? 20 : 24}
        color={active ? v2.onDone : palette.textPrimary}
      />
    </Tap>
  );
}

const styles = StyleSheet.create({
  bare: {
    width: ROUND_BUTTON_SIZE,
    height: ROUND_BUTTON_SIZE,
    borderRadius: ROUND_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
