import React from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../PressableScale';
import type { ReadPalette } from '../../theme/readPalette';

export const ROUND_BUTTON_SIZE = 36;

interface RoundButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  palette: ReadPalette;
  /** Filled (e.g. the current page marked revised). */
  active?: boolean;
}

/** A round button in the reader's header (back, help, mark, menu). */
export function RoundButton({ icon, label, onPress, palette, active }: RoundButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      hitSlop={8}
      style={[
        styles.button,
        { backgroundColor: active ? palette.textPrimary : palette.control, borderColor: palette.divider },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active != null ? { selected: active } : undefined}
    >
      <Ionicons name={icon} size={18} color={active ? palette.pageBg : palette.textPrimary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: ROUND_BUTTON_SIZE,
    height: ROUND_BUTTON_SIZE,
    borderRadius: ROUND_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
