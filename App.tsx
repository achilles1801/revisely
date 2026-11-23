import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { AppProvider } from './src/context/AppContext';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { RecordingBackupController } from './src/components/RecordingBackupController';
import { MushafOfflineController } from './src/components/MushafOfflineController';
import { WidgetSync } from './src/components/WidgetSync';
import { PrayerSync } from './src/components/prayer/PrayerSync';
import { AthanOnTap } from './src/components/prayer/AthanOnTap';
import { RevisionRemindersSync } from './src/components/RevisionRemindersSync';
import { DesignProvider } from './src/design/DesignContext';
import { DesignGate } from './src/design/DesignGate';
import { AndroidSystemTheme } from './src/components/AndroidSystemTheme';
import { ensureAndroidChannels } from './src/lib/notifications';
import { setupAppCheck } from './src/lib/appCheck';
import { runTestLoopIfAsked } from './src/lib/onDevice/testLoop';
import * as Sentry from '@sentry/react-native';
import { currentRelease, releaseTags } from './src/lib/releaseInfo';
import { markUiReady, startOtaUpdates } from './src/lib/updates/ota';
import { stopTrace } from './src/lib/reciteLive/stopTrace';
import { startStoreChecks } from './src/lib/updates/storeUpdates';
import { UpdateRequiredGate } from './src/components/updates/UpdateRequired';
import { loadLanguageChoice } from './src/i18n/choice';

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
  // Settings → Report a problem is the app's own form (components/report); it sends through
  // Sentry.captureFeedback (lib/sentry sendProblemReport), which needs no integration here.

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});
Sentry.setTags(releaseTags(release));

// Updates reach people sooner: the splash waits briefly for one at launch, and
// one that has waited is applied at a safe moment (src/lib/updates/ota.ts).
// New store versions are offered, or required below the minimum (storeUpdates.ts).
startOtaUpdates();
startStoreChecks();
// Revisely Dev: a live take whose Stop never reached its summary last run (a freeze, or the app closed then) goes to
// Sentry once (src/lib/reciteLive/stopTrace.ts).
void stopTrace.reportLeftover();

/** How long the splash waits for a restart into the right direction (LANG-1) before showing the app as it is. */
const RESTART_FALLBACK_MS = 3000;

function App() {
  // Amiri (classical Naskh) for all Arabic UI text. If loading fails we still
  // render — text falls back to the system Arabic face rather than blocking
  // the app forever.
  const [fontsLoaded, fontError] = useFonts({
    'Amiri-Regular': require('./assets/fonts/Amiri-Regular.ttf'),
  });

  useEffect(() => {
    // Firebase Test Lab's game loop (Revisely Dev, Android): the on-device bench on its phones. Nothing on any other launch.
    void runTestLoopIfAsked();
    setupAppCheck();
    // Android's channels only. Notification permission is asked where it means something (REMIND-4): onboarding's
    // Start with "Daily reminders" on, or Home for an account with reminders on. Until Nov 2026 it was asked here,
    // on the first screen of a fresh install before sign-in, and a no there turned reminders off at onboarding.
    void ensureAndroidChannels();
  }, []);

  // The language (the one chosen in Settings, where there is a choice) and the layout's direction, before the first
  // screen (src/i18n/choice.ts). The layout reads the way the app's language does, not the phone's (BEHAVIOUR.md
  // LANG-1): a launch that started the other way (Android mirrors any app on a phone set to Arabic) restarts once, and
  // the splash stays up for it. If that restart never comes, the app shows after RESTART_FALLBACK_MS as it is.
  const [languageReady, setLanguageReady] = useState(false);
  useEffect(() => {
    let fallback: ReturnType<typeof setTimeout> | undefined;
    void loadLanguageChoice()
      .then(({ restarting }) => {
        if (restarting) fallback = setTimeout(() => setLanguageReady(true), RESTART_FALLBACK_MS);
        else setLanguageReady(true);
      })
      .catch(() => setLanguageReady(true));
    return () => clearTimeout(fallback);
  }, []);

  // Something to show: the splash can go once the launch check is done.
  const fontsSettled = (fontsLoaded || !!fontError) && languageReady;
  useEffect(() => {
    if (fontsSettled) markUiReady();
  }, [fontsSettled]);

  if (!fontsSettled) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DesignProvider>
          <ThemeProvider>
            <AuthProvider>
              <AppProvider>
                {/* Sheets render into this provider's host, so it must sit
                    inside the context providers — otherwise any sheet content
                    calling useTheme()/useApp() throws when it opens. */}
                <BottomSheetModalProvider>
                  <RootNavigator />
                  <DesignGate />
                  <AndroidSystemTheme />
                  <RecordingBackupController />
                  <MushafOfflineController />
                  <WidgetSync />
                  <PrayerSync />
                  <AthanOnTap />
                  <RevisionRemindersSync />
                  {/* Last: over everything when this version is no longer supported. */}
                  <UpdateRequiredGate />
                </BottomSheetModalProvider>
              </AppProvider>
            </AuthProvider>
          </ThemeProvider>
        </DesignProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap installs an error boundary so React render errors get captured.
export default Sentry.wrap(App);
