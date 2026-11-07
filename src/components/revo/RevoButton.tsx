import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { revoV2 } from '../../theme/v2';
import { RevoMark } from './RevoMark';

export const REVO_BUTTON_SIZE = 56;
/** From the right edge, and above the tab bar (and the mini player). */
export const REVO_BUTTON_INSET = 16;
export const REVO_BUTTON_GAP = 14;

/**
 * Revo's button: bottom-right on the main screens, above the content and below sheets. The R
 * disc; dark adds a lavender ring and an Indigo glow, light a soft shadow. A dot when a new Day
 * in review is waiting. A press shrinks it a little, with a light haptic.
 */
export function RevoButton({ bottom, dot, onPress }: { bottom: number; dot: boolean; onPress: () => void }) {
  const { palette, isDark } = useTheme();
  const haptics = useHaptics();
  const lift = isDark
    ? { shadowColor: revoV2.glow, shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } }
    : { shadowColor: revoV2.shadow, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 10 } };
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Pressable
        onPress={() => {
          haptics.light();
          onPress();
        }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={dot ? 'Revo, a new Day in review' : 'Revo'}
        accessibilityHint="Ask about your revision"
        style={({ pressed }) => [styles.button, lift, Platform.OS === 'android' && styles.elevation, pressed && styles.pressed]}
        testID="revo-button"
      >
        <RevoMark size={REVO_BUTTON_SIZE} ring={isDark} />
        {dot ? (
          <View
            style={[styles.dot, { backgroundColor: palette.primary, borderColor: palette.bg }]}
            testID="revo-button-dot"
          />
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: REVO_BUTTON_INSET },
  button: { width: REVO_BUTTON_SIZE, height: REVO_BUTTON_SIZE, borderRadius: REVO_BUTTON_SIZE / 2 },
  elevation: { elevation: 10 },
  pressed: { transform: [{ scale: 0.94 }] },
  dot: { position: 'absolute', top: -1, right: -1, width: 12 + 5, height: 12 + 5, borderRadius: 8.5, borderWidth: 2.5 },
});
