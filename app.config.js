import 'dotenv/config';

export default {
  expo: {
    name: "Revisely",
    slug: "revision-buddy",
    owner: "achilles1801",
    version: "1.0.0",
    runtimeVersion: { policy: "appVersion" },
    updates: {
      url: "https://u.expo.dev/32c71b6d-0a13-454c-916d-11d27f168fa8"
    },
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#03372A"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.revisionbuddy.app",
      googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST ?? "./GoogleService-Info.plist",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: [
              process.env.GOOGLE_REVERSED_CLIENT_ID
            ]
          }
        ]
      }
    },
    android: {
      package: "com.revisionbuddy.app",
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#03372A"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      // expo-build-properties MUST be first — it sets static linking that the
      // RNFirebase plugins (below) require to compile against React-Core.
      [
        "expo-build-properties",
        {
          ios: {
            useFrameworks: "static",
            // BOTH RNFB pods need force-static. This is the exact config that
            // worked in the previously successful preview build. The earlier
            // theory of "RNFBAppCheck must be modular because Swift bridging
            // header imports it" turned out to be wrong in our setup —
            // dropping it broke things.
            forceStaticLinking: ["RNFBApp", "RNFBAppCheck"]
          }
        }
      ],
      // NOTE: Removed `./plugins/with-modular-headers`. Expo's autolinking
      // already excludes RNFBApp/RNFBAppCheck from frameworks via the
      // `[Expo] Disabling USE_FRAMEWORKS for modules ...` step in the build,
      // which is what the previously-successful build relied on. Adding our
      // own `post_install` block conflicted with Expo's (CocoaPods only
      // allows one), causing "Specifying multiple post_install hooks is
      // unsupported" failures.
      "@react-native-firebase/app",
      "@react-native-firebase/app-check",
      // Native Google Sign-In SDK (replaces expo-auth-session/providers/google,
      // which is broken on Android since Google deprecated custom URI schemes
      // for new Android OAuth clients in late 2023). The plugin reads the
      // REVERSED_CLIENT_ID from GoogleService-Info.plist for iOS URL scheme
      // setup, and the Android client info from google-services.json — no
      // plugin options needed.
      "@react-native-google-signin/google-signin",
      // Sentry: keep the bare plugin form — the configured @sentry/react-native/expo
      // plugin (added by the wizard with org/project) does extra Podfile work
      // that interacts badly with RNFirebase + static frameworks. The bare
      // plugin still wires the SDK in. Source maps stay off via
      // SENTRY_DISABLE_AUTO_UPLOAD=true on EAS env.
      "@sentry/react-native",
      "expo-font",
      "expo-web-browser",
      [
        "expo-speech-recognition",
        {
          microphonePermission: "Allow Revisely to use the microphone so you can describe what you've memorized.",
          speechRecognitionPermission: "Allow Revisely to convert your speech to text so it can record what you've memorized.",
          androidSpeechServicePackages: ["com.google.android.googlequicksearchbox"]
        }
      ]
    ],
    extra: {
      firebase: {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID,
      },
      googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
      googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
      googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
      // Sentry crash reporting. Empty DSN → Sentry stays off (fine for dev).
      // Set SENTRY_DSN in EAS env vars + .env when you're ready to capture errors.
      sentryDsn: process.env.SENTRY_DSN,
      eas: {
        projectId: "32c71b6d-0a13-454c-916d-11d27f168fa8"
      }
    }
  }
};
