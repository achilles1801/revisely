import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';

export const MODE_MENU_WIDTH = 276;

/** What the menu picks; marking mistakes is Recite's switch. */
export type ReciteMenuMode = 'record' | 'recite';

const SWITCH_W = 40;
const SWITCH_H = 24;
const KNOB = 20;

/**
 * A small switch at the menu's scale (the native one is a settings row's size). Locked: off, with a lock in its knob.
 */
function MiniSwitch({ on, locked }: { on: boolean; locked: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      style={[styles.track, { backgroundColor: on ? palette.primary : palette.switchOff }]}
      testID={locked ? 'recite-mistakes-locked' : on ? 'recite-mistakes-on' : 'recite-mistakes-off'}
    >
      <View
        style={[
          styles.knob,
          { left: on ? SWITCH_W - KNOB - 2 : 2, backgroundColor: on ? palette.onPrimary : palette.switchThumb, shadowColor: palette.shadow },
        ]}
      >
        {locked ? <Ionicons name="lock-closed" size={10} color={palette.premium[0]} /> : null}
      </View>
    </View>
  );
}

/**
 * Holding the mic: Record or Recite, above the bar at the right (like the held verse's menu: a card in the screen,
 * nothing dimmed, any touch outside closes it). Under Recite, one row: Mark mistakes, a switch (Premium; Majd, Nov 14
 * 2026). Without Premium it is off with a lock, and a tap opens the Premium page. Its level is in Settings.
 */
export function ReciteModeMenu({
  visible,
  mode,
  markMistakes,
  owned,
  bottom,
  right,
  onPick,
  onMarkMistakes,
  onLocked,
  onClose,
}: {
  visible: boolean;
  mode: ReciteMenuMode;
  /** Mark mistakes is on (and the account has it). */
  markMistakes: boolean;
  /** The account has Premium's marking. */
  owned: boolean;
  /** Its bottom edge, from the screen's bottom (above the bar). */
  bottom: number;
  right: number;
  onPick: (mode: ReciteMenuMode) => void;
  onMarkMistakes: (on: boolean) => void;
  /** The locked switch was tapped. */
  onLocked: () => void;
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
  const recite = mode === 'recite';
  const on = owned && markMistakes;
  const row = (m: ReciteMenuMode, label: string, subtitle: string, icon: keyof typeof Ionicons.glyphMap, ref?: React.Ref<View>) => {
    const chosen = mode === m;
    return (
      <Pressable
        ref={ref}
        onPress={() => onPick(m)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${subtitle}`}
        accessibilityState={{ selected: chosen }}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.fill }]}
        testID={`recite-mode-${m}`}
      >
        <View style={styles.icon}>
          <Ionicons name={icon} size={21} color={chosen ? palette.accentText : palette.text} />
        </View>
        <View style={styles.label}>
          <Text style={[typeV2.menu, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
            {label}
          </Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {subtitle}
          </Text>
        </View>
        {chosen ? <Ionicons name="checkmark" size={18} color={palette.accentText} /> : <View style={styles.tick} />}
      </Pressable>
    );
  };
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
          <View style={mode === 'record' ? { backgroundColor: palette.accentSubtle } : undefined}>
            {row('record', 'Record', 'Just record your recitation', 'radio-button-on', first)}
          </View>
          <View style={[styles.separator, { backgroundColor: palette.separator }]} />
          <View style={recite ? { backgroundColor: palette.accentSubtle } : undefined}>
            {row('recite', 'Recite', 'The page follows you', 'reader-outline')}
            <Pressable
              onPress={() => (owned ? onMarkMistakes(!on) : onLocked())}
              accessibilityRole="switch"
              accessibilityLabel={owned ? 'Mark mistakes' : 'Mark mistakes, part of Premium, locked'}
              accessibilityState={{ checked: on }}
              hitSlop={{ top: 4, bottom: 4 }}
              style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.6 }]}
              testID="recite-mistakes"
            >
              <Text style={[styles.toggleLabel, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                Mark mistakes
              </Text>
              <MiniSwitch on={on} locked={!owned} />
            </Pressable>
          </View>
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
  tick: { width: 18 },
  separator: { height: layoutV2.hairline, marginLeft: 50 },
  // Under Recite's subtitle, lined up with its label; no taller than it needs.
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, marginTop: -4, paddingLeft: 50, paddingRight: 18, paddingBottom: 8 },
  toggleLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  track: { width: SWITCH_W, height: SWITCH_H, borderRadius: SWITCH_H / 2 },
  knob: {
    position: 'absolute',
    top: 2,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 2,
  },
});
