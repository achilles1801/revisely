import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SettingIcon } from './settings/SettingIcon';
import { SettingSwitch } from './settings/SettingSwitch';
import { typeV2 } from '../theme/v2';
import { useTheme } from '../context/ThemeContext';
import { CarryOverMode, DEFAULT_CARRY_OVER_MODE } from '../lib/carryOver';
import { t } from '../i18n';

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
      <SettingIcon name="arrow-redo-outline" />
      <View style={styles.textV2}>
        <Text style={[typeV2.body, { color: palette.text }]}>{t('plan.carryOver.label')}</Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} testID="carry-over-explainer">
          {keepAmount
            ? t('plan.carryOver.keep')
            : t('plan.carryOver.add')}
        </Text>
      </View>
      <SettingSwitch
        value={keepAmount}
        onValueChange={(v) => onChange(v ? 'shift' : 'add')}
        accessibilityLabel={t('plan.carryOver.label')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // SettingIcon brings 8pt after the glyph; 8 more makes the rows' 16.
  rowV2: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, gap: 8 },
  textV2: { flex: 1, marginRight: 8 },
});
