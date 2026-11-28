import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import JourneySelectScreen from '../screens/onboarding/JourneySelectScreen';
import JuzSelectionScreen from '../screens/onboarding/JuzSelectionScreen';
import DailyAmountScreen from '../screens/onboarding/DailyAmountScreen';
import DayStartScreen from '../screens/onboarding/DayStartScreen';
import ReminderScreen from '../screens/onboarding/ReminderScreen';
import BeginnerSurahsScreen from '../screens/onboarding/BeginnerSurahsScreen';
import type { RevisionPathField } from '../types';

export type JourneyStage = 'in_progress' | 'complete';
export type ScheduleMode = 'pages' | 'juz';

/** The daily amount, carried to the last question, which saves the plan. */
interface AmountAnswer {
  journeyStage: JourneyStage;
  scheduleMode: ScheduleMode;
  dailyCapacity: number;
  dailyJuzCount: number;
  /** The path setup's first answer chose, when it isn't today's (PATH-1): the beginner's setup sets 'beginner'. */
  path?: RevisionPathField;
}

export type OnboardingStackParamList = {
  Welcome: undefined;
  JourneySelect: undefined;
  JuzSelection: { journeyStage: JourneyStage };
  /** The beginner path's second question (BEGIN-1, Revisely Dev). */
  BeginnerSurahs: undefined;
  DailyAmount: { journeyStage: JourneyStage };
  DayStart: AmountAnswer;
  Reminder: AmountAnswer & {
    fajrBoundaryEnabled: boolean;
    locationCoords: { latitude: number; longitude: number } | null;
  };
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Transparent: each screen paints the ground.
        contentStyle: { backgroundColor: 'transparent' },
        // `slide_from_right` exposes the outgoing screen through the
        // incoming one because both are transparent, which reads as choppy
        // ghosting. A cross-dissolve sidesteps the layering entirely; the
        // progress bars already convey forward progress so we don't need a
        // directional cue.
        animation: 'fade',
        animationDuration: 220,
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="JourneySelect" component={JourneySelectScreen} />
      <Stack.Screen name="JuzSelection" component={JuzSelectionScreen} />
      <Stack.Screen name="BeginnerSurahs" component={BeginnerSurahsScreen} />
      <Stack.Screen name="DailyAmount" component={DailyAmountScreen} />
      <Stack.Screen name="DayStart" component={DayStartScreen} />
      <Stack.Screen name="Reminder" component={ReminderScreen} />
    </Stack.Navigator>
  );
}
