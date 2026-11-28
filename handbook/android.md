# Android (Google Play)

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## Android (Google Play)

The store app's package is its own: `src/lib/storeIds.json` (`playPackage`), the one value `app.config.js`, the
app's Play links, Sentry's Android release names and `scripts/play.js` read. Until the new Play app in Revisely LLC's
organization account it was `com.revisionbuddy.app`, the iOS bundle id, in Majd's personal account: Play keeps an app
in the account it was made in, and an app made in a personal account keeps the 12-tester, 14-day closed test even
after a transfer (Google Play support, Nov 26 2026). Changing the package moves both store fingerprints, iOS too.
Revisely Dev keeps `com.revisionbuddy.app.dev`, and E2E builds keep the iOS id (one Maestro `appId` for both
platforms). The day-one steps and the listing pack: `~/Documents/revisely-android/new-play-app.md`. `versionCode` comes from
EAS (`appVersionSource: remote`, `autoIncrement`), counted apart from iOS build numbers; the version
string is the same `version` in app.config.js. Target SDK 36, min 24; every native library is 16 KB
aligned (checked on an API 37 16 KB-page emulator). `store/android/` holds the listing, Data safety
and content rating answers and the click-by-click setup. On Play since Nov 1 2026: internal testing,
and Closed testing (track `alpha`) approved; a personal account needs 12 testers opted in for 14 days
before production can be applied for.

**Android moves with iOS.** Same branches, same version, same flow:

| | iOS | Android |
| --- | --- | --- |
| Native change on develop | Preview builds on macOS, TestFlight; tag `ios-fp/<hash>` | Preview builds on Linux, Play internal testing (released to its testers); tag `android-fp/<hash>` |
| Release branch (release/1.0.x) | EAS Build by hand, platform `all` (the default): both from one commit | same run |
| JavaScript | Preview publishes to `preview` | the same push, its own update group (another runtime), same `[app <hash>]` |
| Testers on `preview` | TestFlight install + `previewTester` | `previewTester` alone (Play can't tell testing from production) |
| To store users | Promote: one approval republishes both platforms' groups for main's hash; both must pass the crash-free gate | same run |
| Store release | `scripts/asc.js` (version, build, submit) by hand | `scripts/play.js promote <versionCode> --to production --rollout 0.2 --yes` by hand |
| Crashes | Sentry, dSYMs uploaded by the build | Sentry, JS source maps and native symbols uploaded by the build (Gradle plugin) |
| GitHub issues from Sentry | label `ios` | label `android` |

- **CI switches.** Repository variables (Settings → Secrets and variables → Actions → Variables):
  `ANDROID_RELEASES` = `true` (on) makes Preview look up the Android fingerprint and publish updates
  for both platforms, and Promote and EAS Build include Android. `ANDROID_SUBMIT` = `true` (on) makes
  Preview build Android when its fingerprint has no tag and upload it (`eas submit`, eas.json
  `submit.production.android`: `track: internal`, `releaseStatus: completed`); the tag is pushed only
  once a build is on Play, so with uploads off every push would build again (Preview then only says
  so). Every build attaches the `.aab` to the run (7 days).
- **Moving a build on.** Uploads go to internal testing only. Closed testing and production take the
  same bundle, never a rebuild: `node scripts/play.js status`, then `promote <versionCode> --to alpha`
  (Google reviews closed-testing changes; usually hours, "typically within 7 days"), and for the store
  `promote <versionCode> --to production --rollout 0.2 --yes`, later `rollout 1 --yes` (`halt --yes`
  stops it). Production is the owner's decision, as App Store submission is: run it only when asked.
  The key needs production rights first (below).
- **Secrets.** `GOOGLE_SERVICES_JSON` (repository secret, base64 of google-services.json), written
  outside the repo and passed by path (`GOOGLE_SERVICES_JSON`, app.config.js). The upload keystore
  stays on EAS (`eas credentials --platform android`; don't script that menu: "Set up a new keystore"
  is one keypress away, and a new upload key breaks Play uploads). `PLAY_SERVICE_ACCOUNT_JSON`
  (repository secret, base64): the key of `eas-play-submit@revision-buddy-3a398.iam.gserviceaccount.com`,
  which may release to testing tracks and edit tester lists, nothing else. `android-build.yml` writes
  it to a file only for the upload step, after the build; eas.json reads the path from
  `PLAY_SERVICE_ACCOUNT_KEY_PATH`. The same key is `~/secrets/revisely-play-service-account.json` on
  the laptop for `scripts/play.js` (`PLAY_KEY_PATH`). Production needs "Release to production,
  exclude devices, and use Play App Signing" granted to it in Play Console (Users and permissions),
  which the owner decides.
- **Fingerprint.** The iOS fingerprint hashes the whole app config, the `android` section and every
  plugin's options included: any Android change in `app.config.js` (permissions, icons, plugins) is
  a native change for iOS too (raise `version`, a TestFlight build, an App Store release). Changes
  that move nothing on iOS: Android-only local modules (`modules/*` with only `android`), `eas.json`,
  and google-services.json, ignored wherever it is (`**/google-services.json`: a file outside the
  project was hashed, so the runner's and a laptop's Android hashes differed).
- **Patching an Expo module's Android code** (patch-package, `patches/`): SDK 54 links Expo modules
  as prebuilt AARs (`node_modules/<module>/local-maven-repo`), so Gradle never compiles a patched
  `android/src` and the patch silently does nothing. Name the module in `package.json`
  `expo.autolinking.android.buildFromSource` (expo-audio is there) and check the build carries the
  change (a string from it in the APK's `classes*.dex`). `patches/` counts in the fingerprint for
  every platform, so an Android-only patch moves the iOS hash too.
- **Gradle memory.** Lint (`lintVitalAnalyzeRelease`) ran out of memory with the default 2 GB; the
  workflow writes `org.gradle.jvmargs=-Xmx6g` to `~/.gradle/gradle.properties` (it wins over the
  project's, which prebuild writes). Locally: `-Dorg.gradle.jvmargs=-Xmx6g` and
  `SENTRY_DISABLE_AUTO_UPLOAD=true` on `./gradlew assembleRelease`.
- **Preview channel.** Play can't tell internal testing from production, so on Android the
  `previewTester` account alone decides (`lib/updateChannel`); Play's reviewers use the demo account.
- **Sign-in.** Google needs the app's SHA-1s (upload key, Play App Signing key, and a laptop's debug
  key for dev builds) under the Android app in Firebase Console; Apple's button doesn't show.
  App Check uses Play Integrity in release builds (link it in Firebase → App Check); dev builds use
  the debug provider, with their own debug token registered under the Android app.
- **Edge-to-edge traps** (Android 15+ enforces it; SDK 54 turns it on):
  - React Native's `SafeAreaView` pads only on iOS: use `components/SafeAreaView`.
  - The window isn't resized for the keyboard: `KeyboardAvoidingView` needs `padding` on Android too.
  - The status bar's icons and native dialogs follow the app's theme through `AndroidSystemTheme`;
    a screen with its own `<StatusBar>` (the reader) wins while mounted.
- **Other traps.**
  - Android measures voweled Amiri narrower than it draws it: a short Arabic label needs
    `numberOfLines={arabicLabelLines}` (`lib/platformUi`) or its last word disappears.
  - A runtime permission dialog is an activity: the app goes to `background` while it asks.
  - A notification's sound and importance are its channel's: schedule with a `channelId`
    (`lib/notificationChannels`: Reminders, Prayer times, Prayer times (silent); Recitation is
    expo-audio's channel, created first so it has a name). Without one it lands in "Miscellaneous".
  - Recitation's media notification has play/pause and the scrubber, and from 1.0.4 previous and
    next verse: the patched service's session offers them (expo-audio 1.1 removed them) and sends
    them to the app (`reviselyRemoteCommand`, `onTrackCommand` in `lib/mediaNotification`), which
    calls the engine's `skip`, as iOS's `modules/now-playing-commands` does. Binaries before 1.0.4
    have none.
  - expo-location sends a heading only after a ~2° turn, so a phone held still can show
    "Finding north…" until it moves.
  - Home-screen widgets are native RemoteViews (`modules/android-widgets`, from 1.0.4): see
    "Widgets", Android.
- **Not on Android yet:** voice search's speech recognition (whisper.rn's iOS path only), Recite's
  microphone stream (`modules/recitation-audio` is Apple-only until #712, for 1.0.5), Sign in with
  Apple. (Previous/next verse in the media notification and home-screen widgets came with 1.0.4.)
- **Testing on an emulator** without touching production: the Firebase emulators (Auth, Firestore,
  Storage) with a dev build pointed at them, and an account seeded there with
  `functions/scripts/seed-screenshots.js` (`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`).
  The Clear Quran needs a real ID token, so it can't be tried there. In `adb shell input text`, an
  `r` typed twice outside a text field reloads a dev build.
