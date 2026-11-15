import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { formatAccuracy, mistakesLabel } from '../../lib/reciteLive/score';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { takeWhen } from '../../lib/reciteMemory/describe';

/**
 * Over the reader while a past take shows on its page ("Show on the page", Tarteel's Load Session): whose take it is,
 * how it went, and Done. Its marks are on the page at full strength, each with its card.
 */
export function ShownTakeBar({ take, now, bottom, onDone }: { take: TakeRecord; now: number; bottom: number; onDone: () => void }) {
  const { palette, isDark } = useTheme();
  return (
    <View
      style={[styles.bar, { bottom, backgroundColor: palette.sheet, borderColor: palette.outline, shadowColor: palette.shadow, shadowOpacity: isDark ? 0 : 0.12 }]}
      accessibilityLabel={`Your take, ${takeWhen(take.createdAt, now, true)}`}
      testID="shown-take-bar"
    >
      <View style={styles.text}>
        <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
          {`Your take · ${takeWhen(take.createdAt, now, true)}`}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="shown-take-line">
          {[formatAccuracy(take.accuracy), mistakesLabel(take.mistakes), take.hidden ? 'recited with the page hidden' : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <PillButton title="Done" size="sm" variant="outline" onPress={onDone} testID="shown-take-done" />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 6,
  },
  text: { flex: 1, minWidth: 0 },
});
