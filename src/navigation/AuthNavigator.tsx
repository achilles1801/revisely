// Signed out, with sign-in B on (lib/release/signInB, Revisely Dev): the welcome, then the email page (AUTH-3, AUTH-4).
// The store app shows screens/auth/AuthScreen instead.

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SignInWelcomeScreen from '../screens/auth/b/SignInWelcomeScreen';
import SignInEmailScreen, { type EmailMode } from '../screens/auth/b/SignInEmailScreen';

export type AuthStackParamList = {
  SignInWelcome: undefined;
  SignInEmail: { mode: EmailMode };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="SignInWelcome" component={SignInWelcomeScreen} />
      <Stack.Screen name="SignInEmail" component={SignInEmailScreen} />
    </Stack.Navigator>
  );
}
