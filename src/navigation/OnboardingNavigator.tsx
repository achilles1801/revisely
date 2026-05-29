import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import JourneySelectScreen from '../screens/onboarding/JourneySelectScreen';
import JuzSelectionScreen from '../screens/onboarding/JuzSelectionScreen';
import ScheduleScreen from '../screens/onboarding/ScheduleScreen';

export type JourneyStage = 'in_progress' | 'complete';

export type OnboardingStackParamList = {
  Welcome: undefined;
  JourneySelect: undefined;
  JuzSelection: { journeyStage: JourneyStage };
  Schedule: { journeyStage: JourneyStage };
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Transparent so the app-wide gradient (set in RootNavigator) bleeds
        // through and glass surfaces in onboarding screens have something to
        // refract.
        contentStyle: { backgroundColor: 'transparent' },
        // `slide_from_right` exposes the outgoing screen through the
        // incoming one because both are transparent, which reads as choppy
        // ghosting. A cross-dissolve sidesteps the layering entirely; the
        // Stepper component already conveys forward progress so we don't
        // need a directional cue.
        animation: 'fade',
        animationDuration: 220,
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="JourneySelect" component={JourneySelectScreen} />
      <Stack.Screen name="JuzSelection" component={JuzSelectionScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
    </Stack.Navigator>
  );
}
