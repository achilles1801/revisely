// Gaps' parts that both its layouts use (ACT-28's section in the store app, ACT-42's own page in Revisely Dev): the Days
// switch and its stored choice, the full revision against the plan, and "When did I last revise…?".

import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { forwardIcon } from '../../i18n/direction';
import { ChromeText } from './ChromeText';
import { Tap } from '../v2/Tap';

/** The Days switch, kept on the phone: '1' shows every length in exact days. */
export const GAPS_IN_DAYS_KEY = 'insights.gapsInDays';

/** Every length in exact days (Majd, Nov 16 2026: "'days' specifically should always be an option"), kept on the phone. */
export function useGapsInDays(): [boolean, (next: boolean) => void] {
  const [inDays, setInDaysState] = useState(false);
  // A tap before the stored choice is read wins over it.
  const touched = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(GAPS_IN_DAYS_KEY)
      .then((v) => {
        if (!touched.current) setInDaysState(v === '1');
      })
      .catch(() => undefined);
  }, []);
  const setInDays = (next: boolean) => {
    touched.current = true;
    setInDaysState(next);
    AsyncStorage.setItem(GAPS_IN_DAYS_KEY, next ? '1' : '0').catch(() => undefined);
  };
  return [inDays, setInDays];
}


/** The Days switch at the section's top right (shown only when some length reads differently in days). */
export function GapsDaysSwitch({ inDays, onChange }: { inDays: boolean; onChange: (next: boolean) => void }) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={() => onChange(!inDays)}
      accessibilityRole="switch"
      accessibilityState={{ checked: inDays }}
      accessibilityLabel={inDays ? t('insights.gaps.inDaysOn') : t('insights.gaps.inDaysOff')}
      hitSlop={8}
      style={[styles.daysSwitch, inDays ? { backgroundColor: palette.text, borderColor: palette.text } : { borderColor: palette.outline }]}
      testID="insights-gaps-in-days"
    >
      <ChromeText style={[typeV2.meta, styles.daysText, { color: inDays ? palette.bg : palette.text }]}>{t('insights.gaps.inDays')}</ChromeText>
    </Tap>
  );
}

/** The full revision against the plan (lib/gapsCycle), opening Last revised longest waiting first. */
export function GapsRevision({ revision, onOpenLastRevised }: { revision: { title: string; detail: string; late: boolean }; onOpenLastRevised?: (sort?: 'waiting') => void }) {
  const { palette } = useTheme();
  return (
        <Tap
        onPress={onOpenLastRevised ? () => onOpenLastRevised('waiting') : undefined}
        disabled={!onOpenLastRevised}
        style={[styles.revision, { borderTopColor: palette.separator }]}
        accessibilityRole={onOpenLastRevised ? 'button' : 'text'}
        accessibilityLabel={`${revision.title}. ${revision.detail}`}
        accessibilityHint={onOpenLastRevised ? t('insights.lastRevised.linkHint') : undefined}
        testID="insights-gaps-revision"
      >
        <View style={[styles.mark, { backgroundColor: palette.bubble }]}>
          <Ionicons name={revision.late ? 'refresh' : 'checkmark'} size={18} color={palette.text} />
        </View>
        <View style={styles.flex}>
          <ChromeText style={[typeV2.name, { color: palette.text }]}>{revision.title}</ChromeText>
          <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{revision.detail}</ChromeText>
        </View>
        {onOpenLastRevised ? <Ionicons name={forwardIcon()} size={16} color={palette.secondary} style={styles.revisionChevron} /> : null}
      </Tap>
  );
}

/** "When did I last revise…?" (ACT-30). */
export function GapsLastRevisedLink({ onOpen }: { onOpen: (sort?: 'waiting') => void }) {
  const { palette } = useTheme();
  return (
        <Tap
        onPress={() => onOpen()}
        accessibilityRole="button"
        accessibilityHint={t('insights.lastRevised.linkHint')}
        hitSlop={8}
        style={styles.link}
        testID="insights-gaps-last-revised"
      >
        <ChromeText style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={1.4}>
          {t('insights.lastRevised.link')}
        </ChromeText>
        <Ionicons name={forwardIcon()} size={16} color={palette.link} />
      </Tap>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  daysSwitch: { minHeight: 28, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, justifyContent: 'center' },
  daysText: { fontWeight: '600' },
  revision: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  mark: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  revisionChevron: { alignSelf: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginTop: 14 },
  linkText: { flexShrink: 1 },
});
