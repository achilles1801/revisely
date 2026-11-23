import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { ChoiceList, ChoiceRow } from '../../components/onboarding/ChoiceRow';
import { QuestionScreen } from '../../components/onboarding/QuestionScreen';
import { useHaptics } from '../../design/haptics';
import { t } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'DayStart'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'DayStart'>;
type Coords = { latitude: number; longitude: number };

/** A fix that takes longer than this falls back to the phone's last known position. */
const LOCATION_WAIT_MS = 10_000;

async function locationOrNull(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LOCATION_WAIT_MS);
    });
    const fix = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), late]);
    if (timer) clearTimeout(timer);
    const pos = fix ?? (await Location.getLastKnownPositionAsync());
    return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

/**
 * When the day starts: one tap answers it. Fajr asks for the location here, beside the words that say why. Refused or
 * unavailable, the day starts at midnight and Settings can change it later.
 */
export default function DayStartScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const haptics = useHaptics();
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
    const coords = await locationOrNull();
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
    <QuestionScreen step={4} title={t('onboarding.dayStart.title')} onBack={() => navigation.goBack()} testID="day-start">
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
