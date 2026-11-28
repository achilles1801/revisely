import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { ChoiceList, ChoiceRow } from '../../components/onboarding/ChoiceRow';
import { BEGINNER_QUESTIONS, QuestionScreen } from '../../components/onboarding/QuestionScreen';
import { useHaptics } from '../../design/haptics';
import { t } from '../../i18n';
import { type Coords, useOnboardingAccess } from './onboardingAccess';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'DayStart'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'DayStart'>;

/**
 * When the day starts: one tap answers it. Fajr asks for the location here, beside the words that say why. Refused or
 * unavailable, the day starts at midnight and Settings can change it later.
 */
export default function DayStartScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const haptics = useHaptics();
  const { locate } = useOnboardingAccess();
  const [locating, setLocating] = useState(false);
  // Which tap is current: Midnight while the location is on its way replaces Fajr's answer.
  const attempt = useRef(0);
  useEffect(
    () => () => {
      attempt.current += 1;
    },
    [],
  );

  const goOn = (fajrBoundaryEnabled: boolean, locationCoords: Coords | null) =>
    navigation.navigate('Reminder', { ...route.params, fajrBoundaryEnabled, locationCoords });

  const chooseFajr = async () => {
    if (locating) return;
    haptics.selection();
    const mine = ++attempt.current;
    setLocating(true);
    const coords = await locate();
    if (mine !== attempt.current) return;
    setLocating(false);
    if (!coords) {
      Alert.alert(t('onboarding.dayStart.noLocationTitle'), t('onboarding.dayStart.noLocationBody'));
      goOn(false, null);
      return;
    }
    goOn(true, coords);
  };

  const chooseMidnight = () => {
    attempt.current += 1;
    setLocating(false);
    haptics.selection();
    goOn(false, null);
  };

  return (
    // The beginner path asks four questions, this the third (BEGIN-1); today's path, five.
    <QuestionScreen
      {...(route.params.path === 'beginner' ? { step: 3, total: BEGINNER_QUESTIONS } : { step: 4 })}
      title={t('onboarding.dayStart.title')}
      onBack={() => navigation.goBack()}
      testID="day-start"
    >
      <ChoiceList>
        <ChoiceRow
          icon="moon-outline"
          title={t('onboarding.dayStart.fajr')}
          detail={t('onboarding.dayStart.fajrDetail')}
          busy={locating}
          onPress={chooseFajr}
          testID="day-fajr"
        />
        <ChoiceRow
          icon="time-outline"
          title={t('onboarding.dayStart.midnight')}
          detail={t('onboarding.dayStart.midnightDetail')}
          onPress={chooseMidnight}
          testID="day-midnight"
        />
      </ChoiceList>
    </QuestionScreen>
  );
}
