import React from 'react';
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { SPEEDS, speedLabel } from '../../lib/playbackPlan';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { Backdrop } from '../Backdrop';
import { Tap } from '../v2/Tap';

export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const WIDTH = 132;
const ROW = 40;

/**
 * The speed chip's menu: a compact list just above the chip, fastest first,
 * the current speed checked. A tap anywhere else closes it.
 */
export function SpeedMenu({
  anchor,
  value,
  onChange,
  onClose,
}: {
  /** The chip's frame on screen; null hides the menu. */
  anchor: Anchor | null;
  value: number;
  onChange: (speed: number) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const { width, height } = useWindowDimensions();
  if (!anchor) return null;
  const left = Math.max(layoutV2.gutter, Math.min(width - WIDTH - layoutV2.gutter, anchor.x + anchor.width / 2 - WIDTH / 2));
  // Above the chip; if there isn't room (very large text), from the top.
  const listHeight = ROW * SPEEDS.length + 8;
  const bottom = height - anchor.y + 8;
  const fits = anchor.y - 8 - listHeight > 40;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Backdrop onPress={onClose} label="Close speed menu" />
      <View
        style={[
          styles.menu,
          fits ? { bottom } : { top: 48 },
          { left, backgroundColor: palette.sheet, borderColor: palette.outline },
        ]}
        accessibilityViewIsModal
        testID="speed-menu"
      >
        {SPEEDS.map((s) => {
          const chosen = s === value;
          return (
            <Tap
              key={s}
              onPress={() => {
                onChange(s);
                onClose();
              }}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`${speedLabel(s)} speed`}
              accessibilityState={{ selected: chosen }}
              testID={`speed-${s}`}
            >
              <Text style={[typeV2.body, styles.label, { color: palette.text, fontWeight: chosen ? '600' : '400' }]} maxFontSizeMultiplier={1.3}>
                {speedLabel(s)}
              </Text>
              {chosen ? <Ionicons name="checkmark" size={18} color={palette.accentText} /> : null}
            </Tap>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: WIDTH,
    paddingVertical: 4,
    borderRadius: radiusV2.cancel,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  label: { flex: 1 },
});
