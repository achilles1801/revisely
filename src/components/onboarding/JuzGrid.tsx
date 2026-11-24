import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { JUZ_NUMBERS, JuzState } from '../../lib/onboardingChoices';
import { formatNumber, t } from '../../i18n';

const COLUMNS = 6;
/** A touch target's minimum, kept on the narrowest phone (320 wide: 44 with 4.8 between). */
const MIN_CELL = 44;
const MAX_CELL = 48;
const MIN_GAP = 4;

/** The cell's width for a screen this wide, inside the gutters. */
export function juzCellSize(screenWidth: number): number {
  const room = screenWidth - 2 * layoutV2.gutter - (COLUMNS - 1) * MIN_GAP;
  return Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(room / COLUMNS)));
}

/**
 * The thirty juz, a tap on each (ONBOARD-4). A juz held only in part (a surah chosen from the list, Al-Fatihah to begin
 * with) has the quiet accent fill and an outline, so colour isn't the only thing that says so.
 */
export function JuzGrid({
  states,
  onToggle,
  onHold,
  holdLabel,
  disabled,
}: {
  states: readonly JuzState[];
  onToggle: (juz: number) => void;
  /** A hold on a juz (Revised elsewhere: part of it, ACT-33); VoiceOver and TalkBack get it as the action `holdLabel`. */
  onHold?: (juz: number) => void;
  holdLabel?: string;
  /** The juz with nothing to choose: faded, and a tap does nothing. */
  disabled?: readonly boolean[];
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const { width } = useWindowDimensions();
  const size = juzCellSize(width);

  const rows: number[][] = [];
  for (let i = 0; i < JUZ_NUMBERS.length; i += COLUMNS) rows.push(JUZ_NUMBERS.slice(i, i + COLUMNS));

  return (
    <View style={styles.grid} testID="juz-grid">
      {rows.map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map((juz) => {
            const state = states[juz - 1] ?? 'none';
            const fill = state === 'all' ? palette.primary : state === 'part' ? palette.accentSubtle : palette.fill;
            const ink = state === 'all' ? palette.onPrimary : state === 'part' ? palette.accentText : palette.text;
            const off = disabled?.[juz - 1] ?? false;
            const hold = onHold && !off ? () => onHold(juz) : undefined;
            return (
              <Tap
                key={juz}
                onPress={() => {
                  haptics.selection();
                  onToggle(juz);
                }}
                accessibilityRole="checkbox"
                accessibilityLabel={t('common.juzN', { n: juz })}
                accessibilityState={{ checked: state === 'all' ? true : state === 'part' ? 'mixed' : false, disabled: off }}
                disabled={off}
                onLongPress={hold}
                delayLongPress={350}
                accessibilityActions={hold && holdLabel ? [{ name: 'longpress', label: holdLabel }] : undefined}
                onAccessibilityAction={hold ? (e) => e.nativeEvent.actionName === 'longpress' && hold() : undefined}
                style={[
                  styles.cell,
                  { width: size, height: size, backgroundColor: fill },
                  state === 'part' && { borderWidth: 1.5, borderColor: palette.accentText },
                  off && styles.off,
                ]}
                testID={`juz-cell-${juz}`}
              >
                <Text
                  style={[typeV2.button, typeV2.numeral, styles.number, { color: ink }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  maxFontSizeMultiplier={1.2}
                >
                  {formatNumber(juz)}
                </Text>
              </Tap>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { borderRadius: radiusV2.full, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 16 },
  off: { opacity: 0.35 },
});
