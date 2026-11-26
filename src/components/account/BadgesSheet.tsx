// Every badge for pages revised (ACCOUNT-5), from a tap on the Account page's bar: two a row, a tier a row, each with the
// day it was won, or in grey with how many pages are left (the next one in the accent).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { formatDay, formatNumber, t } from '../../i18n';
import { badgeName, MILESTONES, nextMilestone, type Milestone } from '../../lib/badges';
import { typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { BadgeMark } from './BadgeMark';

const CHROME_MAX = 1.4;

export function BadgesSheet({
  visible,
  onClose,
  pagesRevised,
  reachedOn,
}: {
  visible: boolean;
  onClose: () => void;
  pagesRevised: number;
  reachedOn: ReadonlyMap<Milestone, string>;
}) {
  const { palette } = useTheme();
  const next = nextMilestone(pagesRevised);
  return (
    <Sheet visible={visible} onClose={onClose} title={t('account.badges.title')} right={{ label: t('common.done'), onPress: onClose }} testID="badges-sheet">
      <View style={styles.grid}>
        {MILESTONES.map((m) => {
          const won = pagesRevised >= m;
          const day = reachedOn.get(m);
          const sub = won
            ? day
              ? formatDay(day, { day: 'numeric', month: 'short', year: 'numeric' })
              : ' '
            : t('account.badges.toGo', { count: m - pagesRevised, n: formatNumber(m - pagesRevised) });
          return (
            <View key={m} style={styles.cell} testID={`badge-${m}`} accessible accessibilityLabel={`${badgeName(m)}, ${t('account.badges.pages', { count: m, n: formatNumber(m) })}, ${sub}`}>
              <BadgeMark milestone={m} size={44} locked={!won} />
              <View style={styles.text}>
                <Text style={[typeV2.name, { color: won ? palette.text : palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX} numberOfLines={1}>
                  {badgeName(m)}
                </Text>
                <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX} numberOfLines={1}>
                  {t('account.badges.pages', { count: m, n: formatNumber(m) })}
                </Text>
                <Text
                  style={[typeV2.meta, { color: !won && m === next ? palette.accentText : palette.secondary }]}
                  maxFontSizeMultiplier={CHROME_MAX}
                  numberOfLines={1}
                  testID={`badge-${m}-status`}
                >
                  {sub}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, paddingVertical: 8 },
  cell: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingEnd: 8 },
  text: { flex: 1, minWidth: 0 },
});
