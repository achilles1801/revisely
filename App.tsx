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
import { currentRelease, releaseTags } from './src/lib/releaseInfo';

// Every launch is one Sentry session, labelled with the exact JavaScript it ran
// (src/lib/releaseInfo.ts): release com.revisionbuddy.app@1.0.2+19.u<update>,
// environment = the update channel. Crash-free rates per update come from these
// sessions: promotion to production checks the candidate's preview sessions
// (.github/workflows/promote.yml). Promotion republishes the update under a new
// group, so production sessions carry that group's name.
const release = currentRelease();

Sentry.init({
  // Only installed builds report (releaseInfo sentryReports): not development,
  // simulators or dev clients. Without a DSN the native crash reporter doesn't
  // start either; `enabled: false` alone would still start it, and native
  // crashes never pass through beforeSend.
  dsn: release.sentryEnabled
    ? 'https://4b773a246bc154edecad8310adec9d6e@o4511369474015232.ingest.us.sentry.io/4511369481945088'
    : undefined,
  enabled: release.sentryEnabled,
  release: release.sentryRelease,
  dist: release.sentryDist,
  environment: release.sentryEnvironment,

  // No IP addresses or other personal data; events carry only the account's
  // pseudonymous id (src/lib/sentry.ts identifyUser).
  sendDefaultPii: false,
  enableAutoSessionTracking: true,

  // Enable Logs
  enableLogs: true,

  // Session Replay disabled: it recorded screen interactions but was not
  // declared in the App Store privacy label. Kept off until it's declared.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  integrations: [
    // Settings → Report a problem (src/lib/sentry.ts reportProblem). A report
    // carries the release and tags below, the recent breadcrumbs, and a
    // screenshot if the user takes one; the native SDK keeps it until it can
    // be sent when offline.
    Sentry.feedbackIntegration({
      formTitle: 'Report a problem',
      messageLabel: 'What happened?',
      messagePlaceholder: 'What were you doing, and what went wrong?',
      submitButtonLabel: 'Send report',
      showName: false,
      showEmail: false,
      isNameRequired: false,
      isEmailRequired: false,
      enableScreenshot: false,
      enableTakeScreenshot: true,
      successMessageText: 'Thank you. Your report was sent.',
    }),
  ],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});
Sentry.setTags(releaseTags(release));

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
        <ThemeProvider>
          <AuthProvider>
            <AppProvider>
              {/* Sheets render into this provider's host, so it must sit
                  inside the context providers — otherwise any sheet content
                  calling useTheme()/useApp() throws when it opens. */}
              <BottomSheetModalProvider>
                <RootNavigator />
              </BottomSheetModalProvider>
            </AppProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap installs an error boundary so React render errors get captured.
export default Sentry.wrap(App);
