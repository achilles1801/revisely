import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SettingIcon } from './settings/SettingIcon';
import { SettingSwitch } from './settings/SettingSwitch';
import { typeV2 } from '../theme/v2';
import { useTheme } from '../context/ThemeContext';
import { radius } from '../theme/radius';
import { CarryOverMode, DEFAULT_CARRY_OVER_MODE } from '../lib/carryOver';

/**
 * Settings row: how "Add to today" (yesterday's leftovers) makes room. The
 * subtitle explains the choice.
 */
export function CarryOverSetting({
  mode,
  onChange,
}: {
  mode: CarryOverMode | undefined;
  onChange: (mode: CarryOverMode) => void;
}) {
  const { palette } = useTheme();
  const keepAmount = (mode ?? DEFAULT_CARRY_OVER_MODE) === 'shift';

  // No info buttons: the line under the label says what the switch does as it
  // is now set.
  return (
    <View style={styles.rowV2}>
      <SettingIcon name="arrow-redo-outline" tileStyle={styles.rowIcon} />
      <View style={styles.textV2}>
        <Text style={[typeV2.body, { color: palette.text }]}>Keep daily amount</Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} testID="carry-over-explainer">
          {keepAmount
            ? 'When you add pages you missed yesterday, today stays its usual size and the rest of your plan moves back.'
            : 'When you add pages you missed yesterday, they go on top of today. Your plan stays as it is.'}
        </Text>
      </View>
      <SettingSwitch
        value={keepAmount}
        onValueChange={(v) => onChange(v ? 'shift' : 'add')}
        accessibilityLabel="Keep daily amount"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // SettingIcon brings 8pt after the glyph; 8 more makes the rows' 16.
  rowV2: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, gap: 8 },
  textV2: { flex: 1, marginRight: 8 },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
