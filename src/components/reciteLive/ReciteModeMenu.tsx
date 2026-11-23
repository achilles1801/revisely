import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { spokenText } from '../../lib/passages';
import { t } from '../../i18n';

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

/** The page's remembered mistakes, offered as one take (lib/reciteLive/drill openDrill). */
export interface MenuDrill {
  /** Words still to fix on the page. */
  count: number;
  /** The stretch the take runs over, in words ("An-Naml, ayahs 23–27"). */
  place: string;
}

/** The drill row's label: "Recite your 3 mistakes here". */
export const drillLabel = (count: number) => t('reciteLive.menu.drill', { count });

/**
 * Holding the mic: Record or Recite, above the bar at the right (like the held verse's menu: a card in the screen,
 * nothing dimmed, any touch outside closes it). Under Recite, one row: Mark mistakes, a switch (Premium; Majd, Nov 14
 * 2026). Without Premium it is off with a lock, and a tap opens the Premium page. Its level is in Settings.
 *
 * With Premium, a page that still has words to fix in Recite's memory adds one more row: "Recite your N mistakes
 * here", one take over the stretch that holds them, which stops by itself at its end (the idea of Nov 15 2026). Last,
 * Test me (Premium too; Majd, Nov 15 2026): a test at random places in what's memorized. It starts a test; it isn't
 * what a tap on the mic starts.
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
  onTest,
  testReady = false,
  onClose,
  drill,
  onDrill,
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
  /** Test me was tapped (without Premium, onLocked is called instead). Absent: no Test me row. */
  onTest?: () => void;
  /** Something is memorized to test (otherwise the row says so and does nothing). */
  testReady?: boolean;
  onClose: () => void;
  /** The page's remembered mistakes to recite again, when it has any (and the account has Premium). */
  drill?: MenuDrill | null;
  onDrill?: () => void;
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
            {row('record', t('reciteLive.menu.record'), t('reciteLive.menu.recordSub'), 'radio-button-on', first)}
          </View>
          <View style={[styles.separator, { backgroundColor: palette.separator }]} />
          <View style={recite ? { backgroundColor: palette.accentSubtle } : undefined}>
            {row('recite', t('reciteLive.menu.recite'), t('reciteLive.menu.reciteSub'), 'reader-outline')}
            <Pressable
              onPress={() => (owned ? onMarkMistakes(!on) : onLocked())}
              accessibilityRole="switch"
              accessibilityLabel={owned ? t('reciteLive.menu.markMistakes') : t('reciteLive.menu.markMistakesLocked')}
              accessibilityState={{ checked: on }}
              hitSlop={{ top: 4, bottom: 4 }}
              style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.6 }]}
              testID="recite-mistakes"
            >
              <Text style={[styles.toggleLabel, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                {t('reciteLive.menu.markMistakes')}
              </Text>
              <MiniSwitch on={on} locked={!owned} />
            </Pressable>
          </View>
          {drill && onDrill ? (
            <>
              <View style={[styles.separator, { backgroundColor: palette.separator }]} />
              <Pressable
                onPress={onDrill}
                accessibilityRole="button"
                accessibilityLabel={`${drillLabel(drill.count)}, ${spokenText(drill.place)}`}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.fill }]}
                testID="recite-mode-drill"
              >
                <View style={styles.icon}>
                  <Ionicons name="refresh" size={21} color={palette.text} />
                </View>
                <View style={styles.label}>
                  <Text style={[typeV2.menu, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                    {drillLabel(drill.count)}
                  </Text>
                  <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                    {drill.place}
                  </Text>
                </View>
                <View style={styles.tick} />
              </Pressable>
            </>
          ) : null}
          {onTest ? (
            <>
              <View style={[styles.separator, { backgroundColor: palette.separator }]} />
              <Pressable
                onPress={() => (!owned ? onLocked() : testReady ? onTest() : undefined)}
                disabled={owned && !testReady}
                accessibilityRole="button"
                accessibilityLabel={
                  !owned
                    ? t('reciteLive.menu.testLocked')
                    : testReady
                      ? t('reciteLive.menu.testReadyLabel')
                      : t('reciteLive.menu.testNotReadyLabel')
                }
                accessibilityState={{ disabled: owned && !testReady }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.fill }]}
                testID="recite-mode-test"
              >
                <View style={styles.icon}>
                  <Ionicons name="shuffle" size={21} color={owned && !testReady ? palette.secondary : palette.text} />
                </View>
                <View style={styles.label}>
                  <Text style={[typeV2.menu, { color: owned && !testReady ? palette.secondary : palette.text }]} maxFontSizeMultiplier={1.4}>
                    {t('reciteLive.menu.testMe')}
                  </Text>
                  <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                    {owned && !testReady ? t('reciteLive.menu.testNotReady') : t('reciteLive.menu.testReady')}
                  </Text>
                </View>
                {owned ? <View style={styles.tick} /> : <Ionicons name="lock-closed" size={14} color={palette.premium[0]} testID="recite-test-locked" />}
              </Pressable>
            </>
          ) : null}
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
