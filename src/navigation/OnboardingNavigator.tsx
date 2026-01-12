import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import JourneySelectScreen from '../screens/onboarding/JourneySelectScreen';
import JuzSelectionScreen from '../screens/onboarding/JuzSelectionScreen';
import ScheduleScreen from '../screens/onboarding/ScheduleScreen';

export type JourneyStage = 'beginning' | 'in_progress' | 'complete';

export type OnboardingStackParamList = {
  Welcome: undefined;
  JourneySelect: undefined;
  JuzSelection: { journeyStage: JourneyStage };
  Schedule: { journeyStage: JourneyStage; currentJuz?: number; currentPage?: number };
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#fafaf9' },
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="JourneySelect" component={JourneySelectScreen} />
      <Stack.Screen name="JuzSelection" component={JuzSelectionScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
    </Stack.Navigator>
  );
}
