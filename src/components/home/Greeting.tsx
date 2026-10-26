import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useDesign } from '../../design/DesignContext';
import { arabicDisplay, typeV2 } from '../../theme/v2';

/**
 * "Name  السلام عليكم" on Home. A short name sits on one line with the salam;
 * a long one wraps onto its own line (up to two, shrinking a little before it
 * is cut), and the salam moves to the next line instead of squeezing the name
 * down to a letter or two.
 */
export function Greeting({ name, date }: { name: string; /** New design: shown under the name. */ date?: string }) {
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  if (isNew) {
    // The salam in Amiri (Arabic as a first-class voice) above the name in the
    // display serif: the screen's one serif moment.
    return (
      <View testID="greeting">
        <Text style={[styles.salamV2, { color: palette.ink2 }]} accessibilityLanguage="ar">
          السلام عليكم
        </Text>
        {name ? (
          <Text
            style={[typeV2.display, { color: palette.ink }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            testID="greeting-name"
          >
            {name}
          </Text>
        ) : null}
        {date ? <Text style={[typeV2.subhead, styles.date, { color: palette.ink2 }]}>{date}</Text> : null}
      </View>
    );
  }
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
  salamV2: {
    ...arabicDisplay(20),
    textAlign: 'left',
    writingDirection: 'rtl',
    alignSelf: 'flex-start',
  },
  date: { marginTop: 2 },
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
