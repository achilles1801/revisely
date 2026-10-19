import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

/**
 * "Name  السلام عليكم" on Home. A short name sits on one line with the salam;
 * a long one wraps onto its own line (up to two, shrinking a little before it
 * is cut), and the salam moves to the next line instead of squeezing the name
 * down to a letter or two.
 */
export function Greeting({ name }: { name: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      {name ? (
        <Text
          style={[styles.name, { color: theme.textPrimary }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          ellipsizeMode="tail"
          testID="greeting-name"
        >
          {name}
        </Text>
      ) : null}
      <Text style={[styles.salam, { color: theme.textPrimary }]}>السلام عليكم</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: spacing.sm,
  },
  name: {
    ...typography.displaySmall,
    textAlign: 'left',
    flexShrink: 1,
  },
  salam: {
    ...typography.displaySmall,
    textAlign: 'left',
    writingDirection: 'ltr',
    flexShrink: 0,
  },
});
