import React from 'react';
import { StyleSheet, Text } from 'react-native';
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
  /** A word beside the icon, which makes the button a pill ("Revised" on the review's check, SESS-4). */
  text?: string;
}

/**
 * A round button in the reader's header (back, help, mark, menu): a bare
 * icon; `active` (the page marked revised) is the one coloured thing on
 * screen, a jade "done" circle.
 */
export function RoundButton({ icon, label, onPress, palette, active, text, testID }: RoundButtonProps & { testID?: string }) {
  const { palette: v2 } = useTheme();
  const ink = active ? v2.onDone : palette.textPrimary;
  return (
    <Tap
      onPress={onPress}
      hitSlop={8}
      style={[styles.bare, text != null && styles.pill, text != null && !active && { borderColor: palette.divider }, active && { backgroundColor: v2.done }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active != null ? { selected: active } : undefined}
      testID={testID ?? (active ? 'round-button-active' : undefined)}
    >
      <Ionicons name={active ? 'checkmark' : icon} size={active || text != null ? 20 : 24} color={ink} />
      {text != null ? (
        <Text style={[styles.text, { color: ink }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {text}
        </Text>
      ) : null}
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
  pill: {
    width: undefined,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  text: { fontSize: 15, fontWeight: '600' },
});
