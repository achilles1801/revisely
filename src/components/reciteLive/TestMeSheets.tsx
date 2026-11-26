import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import type { TestLength } from '../../lib/reciteLive/testLength';
import { testLengthLabel } from '../../lib/reciteLive/testMe';
import { t } from '../../i18n';

/** Chrome text stops growing here (CLAUDE.md, UI traps). */
const CHROME_MAX = 1.4;

/**
 * Test me's one step (RECITE-8): what the test will be, Start, and a quiet way to its choices. They live in Settings →
 * Mushaf and Recite → Spot tests (Majd, Nov 25 2026: "test choices should be in settings but there should be a way to
 * reach that settings page from the test me sheet but subtle and swiping back takes u back to that page u were just
 * on"): the link opens that page over the reader, and Back brings the sheet back.
 */
export function TestMeScopeSheet({
  visible,
  pages,
  juz,
  onStart,
  onSettings,
  onClose,
}: {
  visible: boolean;
  /** How far the test goes. */
  pages: TestLength;
  /** The juz it comes from, or everything memorized (null). */
  juz: number | null;
  onStart: () => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const where = juz == null ? t('reciteLive.test.everything') : t('common.juzN', { n: juz });
  return (
    <Sheet visible={visible} onClose={onClose} title={t('reciteLive.test.title')} testID="test-me-sheet">
      <View style={styles.body}>
        <Text style={[typeV2.body, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX} testID="test-me-summary">
          {t('reciteLive.test.summary', { length: testLengthLabel(pages), where })}
        </Text>
        <PillButton title={t('reciteLive.test.start')} onPress={onStart} size="lg" testID="test-me-start" />
        <Tap onPress={onSettings} hitSlop={8} accessibilityRole="link" style={styles.link} testID="test-me-settings">
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
            {t('reciteLive.test.settings')}
          </Text>
        </Tap>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layoutV2.gutter, paddingTop: 4, paddingBottom: 12, gap: 14 },
  center: { textAlign: 'center' },
  link: { alignSelf: 'center', paddingVertical: 4 },
});
