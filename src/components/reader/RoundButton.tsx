import React from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../PressableScale';
import type { ReadPalette } from '../../theme/readPalette';
import { useDesign } from '../../design/DesignContext';
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
 * A round button in the reader's header (back, help, mark, menu). In the new
 * design it is a bare icon; `active` (the page marked revised) is the one
 * coloured thing on screen, a jade "done" circle.
 */
export function RoundButton({ icon, label, onPress, palette, active }: RoundButtonProps) {
  const { isNew } = useDesign();
  const { palette: v2 } = useTheme();
  if (isNew) {
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
  bare: {
    width: ROUND_BUTTON_SIZE,
    height: ROUND_BUTTON_SIZE,
    borderRadius: ROUND_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: ROUND_BUTTON_SIZE,
    height: ROUND_BUTTON_SIZE,
    borderRadius: ROUND_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
