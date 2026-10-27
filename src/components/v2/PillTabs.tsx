import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '../../design/haptics';
import { PillButton } from './PillButton';

/**
 * The new design's segmented control: a row of pills, the chosen one solid.
 * Takes the place of the classic segmented controls in the new design.
 */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}) {
  const haptics = useHaptics();
  return (
    <View style={styles.row} accessibilityRole="tablist" testID={testID}>
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
            onPress={() => {
              if (selected) return;
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
  pill: { flex: 1 },
});
