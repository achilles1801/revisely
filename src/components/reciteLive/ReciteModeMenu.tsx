import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { CheckMark, ReciteMicMode } from './ReciteMic';

export const MODE_MENU_WIDTH = 276;

interface Row {
  mode: ReciteMicMode;
  label: string;
  subtitle: string;
}

const ROWS: Row[] = [
  { mode: 'record', label: 'Record', subtitle: 'Just record your recitation' },
  { mode: 'recite', label: 'Recite', subtitle: 'The page follows you' },
  { mode: 'check', label: 'Check', subtitle: 'Follows you and marks your mistakes' },
];

/**
 * Holding the mic: Record, Recite or Check, above the bar at the right (like the held verse's menu: a card in the
 * screen, nothing dimmed, any touch outside closes it). Check is drawn special (its own gradient), with a lock while
 * it isn't the account's; picking it then opens its page instead.
 */
export function ReciteModeMenu({
  visible,
  mode,
  checkOwned,
  bottom,
  right,
  onPick,
  onClose,
}: {
  visible: boolean;
  mode: ReciteMicMode;
  checkOwned: boolean;
  /** Its bottom edge, from the screen's bottom (above the bar). */
  bottom: number;
  right: number;
  onPick: (mode: ReciteMicMode) => void;
  onClose: () => void;
}) {
  const { palette, isDark } = useTheme();
  const first = useRef<View>(null);
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      if (first.current) AccessibilityInfo.sendAccessibilityEvent(first.current, 'focus');
    }, 50);
    return () => clearTimeout(t);
  }, [visible]);
  if (!visible) return null;
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
      testID="recite-mode-menu"
    >
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onClose}
        accessible={false}
        testID="recite-mode-menu-backdrop"
      />
      <View
        style={[
          styles.card,
          {
            bottom,
            right,
            backgroundColor: palette.sheet,
            borderColor: palette.outline,
            shadowColor: palette.shadow,
            shadowOpacity: isDark ? 0 : 0.14,
          },
        ]}
      >
        <View style={styles.clip}>
          {ROWS.map((r, i) => {
            const chosen = r.mode === mode;
            const check = r.mode === 'check';
            return (
              <View key={r.mode}>
                {i > 0 ? <View style={[styles.separator, { backgroundColor: palette.separator }]} /> : null}
                <Pressable
                  ref={i === 0 ? first : undefined}
                  onPress={() => onPick(r.mode)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.label}, ${r.subtitle}${check && !checkOwned ? ', part of Premium, locked' : ''}`}
                  accessibilityState={{ selected: chosen }}
                  style={({ pressed }) => [
                    styles.row,
                    chosen && { backgroundColor: palette.accentSubtle },
                    pressed && { backgroundColor: palette.fill },
                  ]}
                  testID={`recite-mode-${r.mode}`}
                >
                  <View style={styles.icon}>
                    {check ? (
                      <CheckMark size={24} locked={!checkOwned} />
                    ) : (
                      <Ionicons
                        name={r.mode === 'record' ? 'radio-button-on' : 'reader-outline'}
                        size={21}
                        color={chosen ? palette.accentText : palette.text}
                      />
                    )}
                  </View>
                  <View style={styles.label}>
                    <Text
                      style={[typeV2.menu, { color: check ? palette.premium[0] : palette.text }, check && styles.checkLabel]}
                      maxFontSizeMultiplier={1.4}
                    >
                      {r.label}
                    </Text>
                    <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                      {r.subtitle}
                    </Text>
                  </View>
                  {chosen ? <Ionicons name="checkmark" size={18} color={palette.accentText} /> : <View style={styles.tick} />}
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const RADIUS = radiusV2.cancel;

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: MODE_MENU_WIDTH,
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 8,
  },
  clip: { borderRadius: RADIUS, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 10, paddingHorizontal: 14, gap: 12 },
  icon: { width: 24, alignItems: 'center' },
  label: { flex: 1 },
  checkLabel: { fontWeight: '600' },
  tick: { width: 18 },
  separator: { height: layoutV2.hairline, marginLeft: 50 },
});
