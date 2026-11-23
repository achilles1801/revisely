import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList, ScheduleMode } from '../../navigation/OnboardingNavigator';
import { AmountStepper } from '../../components/onboarding/AmountStepper';
import { QuestionScreen } from '../../components/onboarding/QuestionScreen';
import { PillButton } from '../../components/v2/PillButton';
import { PillTabs } from '../../components/v2/PillTabs';
import { useTheme } from '../../context/ThemeContext';
import { daysPerRound } from '../../lib/onboardingChoices';
import { typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { useOnboardingAccess } from './onboardingAccess';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'DailyAmount'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'DailyAmount'>;

const MAX_PAGES = 60;
const MAX_JUZ = 5;

/** How much a day: pages or juz, minus and plus around the number, and how long a full round takes. */
export default function DailyAmountScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { palette } = useTheme();
  const { pages } = useOnboardingAccess();
  const { journeyStage } = route.params;

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('pages');
  const [dailyCapacity, setDailyCapacity] = useState(journeyStage === 'complete' ? 20 : 10);
  const [dailyJuzCount, setDailyJuzCount] = useState(1);

  const memorized = useMemo(() => pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber), [pages]);
  const days = daysPerRound(memorized, scheduleMode, dailyCapacity, dailyJuzCount);

  const pagesMode = scheduleMode === 'pages';
  const amount = pagesMode ? dailyCapacity : dailyJuzCount;

  return (
    <QuestionScreen
      step={3}
      title={t('onboarding.amount.title')}
      subtitle={t('onboarding.amount.subtitle')}
      onBack={() => navigation.goBack()}
      testID="daily-amount"
      foot={
        <PillButton
          title={t('onboarding.continue')}
          size="lg"
          onPress={() => navigation.navigate('DayStart', { journeyStage, scheduleMode, dailyCapacity, dailyJuzCount })}
          testID="amount-continue"
        />
      }
    >
      <PillTabs<ScheduleMode>
        tone="ink"
        stretch
        options={[
          { value: 'pages', label: t('onboarding.amount.pages') },
          { value: 'juz', label: t('common.juz') },
        ]}
        value={scheduleMode}
        onChange={setScheduleMode}
        testID="amount-mode"
      />
      <View style={styles.amount}>
        <AmountStepper
          key={scheduleMode}
          value={amount}
          min={1}
          max={pagesMode ? MAX_PAGES : MAX_JUZ}
          onChange={pagesMode ? setDailyCapacity : setDailyJuzCount}
          unit={pagesMode ? t('onboarding.amount.pagesADay', { count: amount }) : t('onboarding.amount.juzADay', { count: amount })}
          label={pagesMode ? t('onboarding.amount.pagesLabel') : t('onboarding.amount.juzLabel')}
        />
        {days > 0 ? (
          <Text style={[typeV2.meta, styles.note, { color: palette.accentText }]} maxFontSizeMultiplier={1.6} testID="amount-round">
            {t('onboarding.amount.round', { count: days })}
          </Text>
        ) : null}
      </View>
    </QuestionScreen>
  );
}

const styles = StyleSheet.create({
  amount: { marginTop: 48 },
  note: { marginTop: 18, textAlign: 'center', fontWeight: '600' },
});
