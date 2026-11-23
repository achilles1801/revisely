import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillTabs } from '../v2/PillTabs';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { TEST_LENGTHS, type TestLength } from '../../lib/reciteLive/testLength';
import { testLengthLabel } from '../../lib/reciteLive/testMe';
import { t } from '../../i18n';

/** Chrome text stops growing here (CLAUDE.md, UI traps). */
const CHROME_MAX = 1.4;

/**
 * Test me's one step (RECITE-8): how far to carry on, then where from: everything memorized, or one juz of it (only the
 * juz with somewhere to start). A tap on where from starts the test.
 */
export function TestMeScopeSheet({
  visible,
  juz,
  pages,
  onPages,
  onStart,
  onClose,
}: {
  visible: boolean;
  /** The juz a test can be given. */
  juz: { juz: number }[];
  /** How far the test goes (the last one chosen). */
  pages: TestLength;
  onPages: (pages: TestLength) => void;
  onStart: (juz: number | null) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const row = (key: string, title: string, meta: string | null, onPress: () => void) => (
    <Tap
      key={key}
      onPress={onPress}
      style={[styles.row, { borderTopWidth: layoutV2.hairline, borderTopColor: palette.separator }]}
      accessibilityRole="button"
      accessibilityLabel={[title, meta].filter(Boolean).join(', ')}
      testID={`test-me-${key}`}
    >
      <View style={styles.rowText}>
        <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX}>
          {title}
        </Text>
        {meta ? (
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
    </Tap>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title={t('reciteLive.test.title')} scroll testID="test-me-sheet">
      <View style={styles.length}>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
          {t('reciteLive.test.howFar')}
        </Text>
        <PillTabs
          options={TEST_LENGTHS.map((n) => ({ value: String(n), label: testLengthLabel(n) }))}
          value={String(pages)}
          onChange={(v) => onPages(Number(v) as TestLength)}
          testID="test-me-length"
        />
      </View>
      {row('all', t('reciteLive.test.everything'), juz.length > 1 ? t('common.juzCount', { count: juz.length }) : null, () => onStart(null))}
      {juz.length > 1 ? juz.map((j) => row(`juz-${j.juz}`, t('common.juzN', { n: j.juz }), null, () => onStart(j.juz))) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  length: { paddingHorizontal: layoutV2.gutter, paddingTop: 4, paddingBottom: 14, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutV2.markGap,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowText: { flex: 1, minWidth: 0 },
});
