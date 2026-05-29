import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { AppProvider } from './src/context/AppContext';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { registerForPushNotificationsAsync } from './src/lib/notifications';
import { setupAppCheck } from './src/lib/appCheck';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://4b773a246bc154edecad8310adec9d6e@o4511369474015232.ingest.us.sentry.io/4511369481945088',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

function App() {
  // Amiri (classical Naskh) for all Arabic UI text. If loading fails we still
  // render — text falls back to the system Arabic face rather than blocking
  // the app forever.
  const [fontsLoaded, fontError] = useFonts({
    'Amiri-Regular': require('./assets/fonts/Amiri-Regular.ttf'),
  });

  useEffect(() => {
    setupAppCheck();
    registerForPushNotificationsAsync();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <ThemeProvider>
            <AuthProvider>
              <AppProvider>
                <RootNavigator />
              </AppProvider>
            </AuthProvider>
          </ThemeProvider>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap installs an error boundary so React render errors get captured.
export default Sentry.wrap(App);
