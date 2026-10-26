import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';

/**
 * A section's header in the new design: sentence case, a real headline (no
 * uppercase eyebrow), with an optional action on the right.
 */
export function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[typeV2.headline, { color: palette.ink }]} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: layoutV2.headerGap,
  },
});
