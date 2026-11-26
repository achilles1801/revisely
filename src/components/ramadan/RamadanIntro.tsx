// One card the first time the Ramadan theme shows on this phone (BEHAVIOUR.md THEME-7; Majd's pick of the v2 mocks, Nov
// 26 2026): what it is and how to turn it off. A sheet on Home, so it takes its turn with any other (SHEET-1), and it
// never shows again on this phone once closed.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useRamadanChoice } from '../../lib/ramadanTheme';
import { ramadanV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { t } from '../../i18n';
import { Crescent } from './art';
import { FIVE_LANTERNS, HangingLanterns, THREE_LANTERNS } from './HangingLanterns';
import { useRamadanDecor } from './quiet';
import { RamadanSky } from './RamadanSky';

export const RAMADAN_INTRO_KEY = '@revisely_ramadan_intro:v1';
const ART = 190;

export function RamadanIntro() {
  const { palette, isDark } = useTheme();
  const shows = useRamadanDecor();
  const choice = useRamadanChoice();
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!shows || seen != null) return;
    AsyncStorage.getItem(RAMADAN_INTRO_KEY)
      .then((v) => setSeen(v === '1'))
      .catch(() => setSeen(true));
  }, [shows, seen]);

  const close = () => {
    setSeen(true);
    AsyncStorage.setItem(RAMADAN_INTRO_KEY, '1').catch(() => undefined);
  };

  return (
    <Sheet
      visible={shows && seen === false}
      onClose={close}
      footer={{ label: t('ramadan.intro.done'), onPress: close, testID: 'ramadan-intro-done' }}
      testID="ramadan-intro"
    >
      <View style={styles.art} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <RamadanSky height={ART} testID="ramadan-intro-sky" />
        <HangingLanterns set={FIVE_LANTERNS} top={0} hideWithTimer={false} testID="ramadan-intro-lanterns" />
        <HangingLanterns set={THREE_LANTERNS} side="end" top={0} hideWithTimer={false} testID="ramadan-intro-lanterns-end" />
        <View style={styles.crescent}>
          <Crescent size={56} tokens={ramadanV2(isDark, palette.accent)} />
        </View>
      </View>
      <View style={styles.words}>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {t('ramadan.intro.kicker')}
        </Text>
        <Text style={[typeV2.title, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {t('ramadan.intro.title')}
        </Text>
        <Text style={[typeV2.body, { color: palette.secondary }]}>{choice === 'auto' ? t('ramadan.intro.bodyAuto') : t('ramadan.intro.bodyOn')}</Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  art: { height: ART, overflow: 'hidden', marginTop: 4 },
  crescent: { position: 'absolute', alignSelf: 'center', bottom: 28 },
  words: { gap: 6, paddingTop: 8, paddingBottom: 4 },
});
