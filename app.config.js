import 'dotenv/config';

export default {
  expo: {
    name: "Revisely",
    slug: "revision-buddy",
    owner: "achilles1802",
    scheme: "revisely",
    version: "1.0.3",
    // A hash of the native side (see fingerprint.config.js). An update reaches only
    // binaries with the same one, so JS that needs new native code never lands on a
    // build that lacks it.
    runtimeVersion: { policy: "fingerprint" },
    updates: {
      url: "https://u.expo.dev/32c71b6d-0a13-454c-916d-11d27f168fa8"
    },
    orientation: "portrait",
    // The gradient cursive R on black (Oct 27 2026; sources in assets/brand/). Opaque
    // 1024 with no alpha, as the App Store requires. The splash is the
    // expo-splash-screen plugin below.
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.revisionbuddy.app",
      // The team that signs the app and the widget extension (as in eas.json).
      appleTeamId: "CH8N5V9MA6",
      // A fixed path: EAS copies its GOOGLE_SERVICES_INFO_PLIST file here before
      // install (eas-build-pre-install), so the path, and with it the fingerprint,
      // is the same on every machine.
      googleServicesFile: "./GoogleService-Info.plist",
      // Shared with the widget extension (targets/widget): the app writes what the
      // widgets show here (src/lib/widgets).
      entitlements: {
        "com.apple.security.application-groups": ["group.com.revisionbuddy.app"],
        // Prayer notifications at a prayer's time break through Focus and the
        // notification summary (interruptionLevel in lib/prayer/sync). A capability
        // on the App ID: EAS signing needs `eas credentials:configure-build` once.
        "com.apple.developer.usernotifications.time-sensitive": true,
      },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        // Recitation goes on with the app in the background or the phone
        // locked, with Now Playing on the lock screen (lib/recitation).
        UIBackgroundModes: ["audio"],
        // Apple requires these strings whenever the binary contains photo
        // library API symbols, even if our app code never touches them.
        // Some SDKs (Sentry attachments, Google Sign-In profile picture
        // handling) link the symbols transitively.
        NSPhotoLibraryUsageDescription:
          "Allow Revisely to access your photos so you can attach screenshots when contacting support.",
        NSPhotoLibraryAddUsageDescription:
          "Allow Revisely to save images to your photo library.",
        // Setting this makes Expo ignore `scheme` above, so revisely:// is listed
        // here too: the widgets' links (src/lib/widgets/links.ts) open the app with it.
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: [
              process.env.GOOGLE_REVERSED_CLIENT_ID
            ]
          },
          {
            CFBundleURLSchemes: ["revisely"]
          }
        ]
      }
    },
    // Android's notifications (reminders, prayer times, the timer): a white R that Android
    // tints, and Indigo for the app's name in them. Without it Android drew the launcher icon
    // as a blank white shape. Read by expo-notifications' plugin (Android only).
    notification: {
      icon: "./assets/notification-icon.png",
      color: "#624BD5"
    },
    android: {
      package: "com.revisionbuddy.app",
      // Expo adds these by default. The app never draws over other apps (only the dev menu
      // did) and stores files in its own folders (no storage permission since Android 10);
      // Play lists every permission on the store page.
      blockedPermissions: [
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE"
      ],
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        monochromeImage: "./assets/adaptive-icon-monochrome.png",
        backgroundColor: "#000000"
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
      // Sentry: no organization/project here — the wizard's configured form did
      // extra Podfile work that interacts badly with RNFirebase + static
      // frameworks; org and project come from SENTRY_ORG/SENTRY_PROJECT in the
      // build (ios-build.yml). experimental_android only touches the Android
      // project: the Sentry Android Gradle Plugin uploads the R8/ProGuard
      // mapping and NDK symbols (with sources) when SENTRY_AUTH_TOKEN is set,
      // for the Android launch. iOS is configured exactly as with the bare form.
      [
        "@sentry/react-native",
        {
          experimental_android: {
            enableAndroidGradlePlugin: true,
            autoUploadProguardMapping: true,
            uploadNativeSymbols: true,
            includeNativeSources: true,
          },
        },
      ],
      "expo-font",
      // Notification sounds bundled into the app: the default athan (assets/sounds,
      // README there). Both files go to both platforms; each uses its own. The
      // Android notification icon and colour still come from `notification` above.
      [
        "expo-notifications",
        {
          sounds: ["./assets/sounds/athan_default.caf", "./assets/sounds/athan_default_android.m4a"],
        },
      ],
      // Android dialogs', cursor's and selection handles' colour (ink, not Material's teal).
      "./plugins/withAndroidTheme",
      "expo-web-browser",
      // The launch screen: the R, 200 pt wide, on black (in light and dark mode
      // alike). imageWidth needs this plugin: the top-level `splash` key shows the
      // image full screen. No `dark` variant: it would set UIUserInterfaceStyle to
      // Automatic, overriding userInterfaceStyle "light" above.
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#000000",
        },
      ],
      // Verse recitation (and, later, recording yourself reciting). The pod
      // ships recording APIs, so Apple's upload check requires a microphone
      // purpose string even before the app records.
      [
        "expo-audio",
        {
          microphonePermission:
            "Revisely uses the microphone to record your recitation, and to follow along word by word as you recite from memory. Following along happens on this iPhone; that audio isn't recorded or sent.",
          recordAudioAndroid: false,
        },
      ],
      // Adds the com.apple.developer.applesignin entitlement during prebuild.
      // REQUIRED: ios/ is gitignored, so EAS regenerates the native project from
      // this plugins list on every build. Without this entry the Sign in with
      // Apple button ships with no entitlement and fails at runtime — an
      // automatic App Review rejection (Guideline 4.8).
      "expo-apple-authentication",
      // The Home and Lock Screen widgets: links targets/widget into the generated
      // Xcode project and registers it with EAS for signing (bundle id
      // com.revisionbuddy.app.widget, same App Group).
      "@bacons/apple-targets",
      [
        "expo-location",
        {
          // Prayer times and the Qibla (worked out on the phone; docs/privacy), and Fajr
          // for the revision day (saved to the account, as that setting says).
          locationAlwaysAndWhenInUsePermission: "Revisely uses your location to work out prayer times, the Qibla direction and the Fajr time that starts your revision day. Only the Fajr setting saves it to your account; it is never shared or used for tracking.",
          locationWhenInUsePermission: "Revisely uses your location to work out prayer times, the Qibla direction and the Fajr time that starts your revision day. Only the Fajr setting saves it to your account; it is never shared or used for tracking."
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
