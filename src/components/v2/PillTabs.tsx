import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '../../design/haptics';
import { PillButton } from './PillButton';
import { Tap } from './Tap';
import { typeV2 } from '../../theme/v2';
import { useTheme } from '../../context/ThemeContext';
import { Text } from 'react-native';

/**
 * The segmented control: a row of pills, the chosen one solid.
 *
 * `tone="ink"` (Activity's tabs): the chosen pill is the text colour with a background label, and the
 * others are outlined. `hug`: each pill is as wide as its label, left-aligned (no flex). `compact`: 28
 * tall (a section's own control, e.g. Insights' 7 days | 30 days).
 */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  testID,
  tone = 'primary',
  hug = false,
  compact = false,
}: {
  options: { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  /** Locks the choice (the value still shows); no press changes it. */
  disabled?: boolean;
  testID?: string;
  tone?: 'primary' | 'ink';
  hug?: boolean;
  compact?: boolean;
}) {
  const haptics = useHaptics();
  const { palette } = useTheme();
  if (tone === 'ink') {
    return (
      <View style={[styles.row, hug && styles.hug]} accessibilityRole="tablist" testID={testID}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Tap
              key={o.value}
              onPress={() => {
                if (selected || disabled) return;
                haptics.selection();
                onChange(o.value);
              }}
              disabled={disabled}
              accessibilityRole="tab"
              accessibilityLabel={`${o.label}${selected ? ', selected' : ''}`}
              accessibilityState={{ selected }}
              style={[
                styles.ink,
                compact && styles.compact,
                selected ? { backgroundColor: palette.text } : { borderWidth: 1, borderColor: palette.outline },
              ]}
              testID={`pill-${o.value}`}
            >
              {/* Chrome: stops growing at 1.4×, as PillButton's label does (the default tone). */}
              <Text style={[typeV2.name, { color: selected ? palette.bg : palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {o.label}
              </Text>
            </Tap>
          );
        })}
      </View>
    );
  }
  return (
    <View style={[styles.row, hug && styles.hug]} accessibilityRole="tablist" testID={testID}>
      {options.map((o) => {
        const selected = o.value === value;
        const title = o.count != null ? `${o.label} ${o.count}` : o.label;
        return (
          <PillButton
            key={o.value}
            title={title}
            icon={o.icon}
            size="sm"
            variant={selected ? 'solid' : 'outline'}
            disabled={disabled}
            onPress={() => {
              if (selected || disabled) return;
              haptics.selection();
              onChange(o.value);
            }}
            accessibilityLabel={`${title}${selected ? ', selected' : ''}`}
            style={styles.pill}
            testID={`pill-${o.value}`}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  hug: { alignItems: 'flex-start' },
  pill: { flex: 1 },
  ink: { minHeight: 32, borderRadius: 16, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  compact: { minHeight: 28, borderRadius: 14, paddingHorizontal: 11 },
});
