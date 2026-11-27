# Widgets

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## Widgets (Home Screen, Lock Screen)

`targets/widget/` (SwiftUI, WidgetKit), linked into the generated Xcode project on prebuild by
`@bacons/apple-targets`, pinned at 4.0.7 (5.x pulls in SDK 55's prebuild-config). Bundle id
`com.revisionbuddy.app.widget`, deployment target 16.0 (the app stays at 15.1).
- **Today** (small, medium; Lock Screen rectangular, circular, inline): today's pages, juz and
  surahs, pages left or done, the streak. Tap: `revisely://today` (the session), or `revisely://home`
  once done. **Verse of the day** (small, medium): a short verse from `verses.json`, the same for
  everyone on a date, Arabic (Amiri, bundled in the extension) and the reference only (it predates
  the licensed Saheeh International, #80, which could now be added with QuranEnc's credit and
  version: a native change; The Clear Quran® is API-only). Tap: `revisely://read?page=N`.
  `scripts/widget-verses.ts` builds the list from api.alquran.cloud, as the verse sheet shows it.
  **Qibla** (small, Lock Screen circular): a fixed dial, north up, with the Kaaba at the bearing,
  "Qibla 58° NE" and the distance to Makkah. WidgetKit can't read the compass, so it doesn't turn
  with the phone. Tap: `revisely://qibla`, which opens Home and calls `requestPrayerSheet('qibla')`
  (`src/lib/widgets/links.ts`). The screen that hosts the sheet must listen with
  `onPrayerSheetRequest(open)` (`open(tab)`); a request from a cold start waits for the listener.
  `WidgetSync` reads the phone's last known position when the app comes back, only if location is
  already allowed (it never asks), or else uses the account's Fajr location. Only the bearing,
  label and distance (`src/lib/widgets/qibla.ts`) go into the snapshot, never the position. A city
  line appears once `WidgetSync` is given the sheet's city list (`cities`). With no position the
  widget says "Open Revisely to set your location".
- **Prayer times** (`PrayerWidget.swift`, kind `ReviselyPrayer`; small, medium; Lock Screen
  rectangular, circular, inline): the next prayer (name in the accent, its time, a live countdown,
  "in 1 hr, 12 min") and the place; the medium adds the day's six times (the next in the accent,
  passed ones and sunrise quieter, as the Times tab); the circle is a ring filling from the last
  prayer to the next around its name and time; inline is "Asr 3:42 PM". Data: the snapshot's
  `prayer` (`widgetPrayer`: 7 days of the six times as epoch ms, null where a day has none, and
  the nearest city), only with prayer times on and a place. Times are absolute and drawn with
  SwiftUI's time styles, so the phone's time zone and 12/24-hour setting apply. Timeline: an entry
  now, at every time and every midnight of the days written (`.atEnd`), so it moves on with the app
  closed; past the last Isha, or with no `prayer`, "Open Revisely to see prayer times". Tap:
  `revisely://prayer`, Home and `requestPrayerSheet('times')`: the Prayer sheet on Times (Home
  listens with `onPrayerSheetRequest(tab)`; the Qibla widget asks for `'qibla'`). Without prayer
  times on the account, Home just shows.
- **Data:** the App Group `group.com.revisionbuddy.app` (both targets' entitlements).
  `src/components/WidgetSync.tsx` rebuilds the snapshot (`src/lib/widgets/snapshot.ts`) from what
  Home shows (sessions, carry-over, plan, accent, the revision day at fajr or midnight, the app coming
  back) and writes it, one JSON under `widget.snapshot`, only when it changed; then WidgetKit reloads.
  It holds 7 revision days ahead with their boundaries, so the widget rolls over with the app closed;
  after the last it asks to open Revisely. Signed out or no plan: "Open Revisely to set up your plan".
  The streak is "alive": through today, or through yesterday until today ends. Home shows a streak
  only once today has a session.
- **Location:** one purpose string for Fajr and the Qibla (expo-location plugin, `app.config.js`).
  It says Fajr saves the location to the account, as the Fajr setting does. expo-location is
  ~19.0.8, SDK 54's version; it had drifted to ^55.
- **Links:** `revisely` is listed in `ios.infoPlist.CFBundleURLTypes`. Setting that key makes Expo
  ignore `scheme`, so before Oct 28 2026 revisely:// wasn't registered at all.
- **Look:** the new design's grounds, ink and hairlines, the accent's colours from the snapshot.
  Tinted and clear Home Screens use the system's hierarchy and `widgetAccentable` (an outlined
  pill, a cut-out check): a filled accent shape would hide its own label.
- **Fingerprint:** `targets` is an `extraSources` entry in `fingerprint.config.js`, so a widget
  change is native (a new build). Prebuild writes only `widget.entitlements` into the folder, from
  `expo-target.config.js`, and it is committed exactly as written; keep `colors`/`images` out of the
  target config (they would generate files there) and edit `Assets.xcassets` by hand.
- **Signing:** EAS signs the extension with its own provisioning profile; the plugin lists it under
  `extra.eas.build.experimental.ios.appExtensions`. CI builds are non-interactive, so the profiles
  (and the App Group on both bundle ids) must exist first: once, from a laptop on a branch with the
  widget, `eas credentials:configure-build -p ios -e production`, signing in with the Apple account
  when asked. It builds nothing.
- **Local builds:** Xcode 27 refuses the pods' old deployment targets; a simulator build needs
  `IPHONEOS_DEPLOYMENT_TARGET=16.0` and `SENTRY_DISABLE_AUTO_UPLOAD=true` on the `xcodebuild` line.
  Prebuild over an existing `ios/` fails in the plugin (`removeFromProject`): use `--clean`.
- **Simulator:** a reinstall doesn't make WidgetKit re-read; the app's own write does. An App Group
  plist edited by hand is seen only after a simulator reboot (cfprefsd keeps a copy).

### Android (`modules/android-widgets`, 1.0.4; mocks `~/Documents/revisely-today-mocks/android-widgets/`)

The same four widgets on the home screen, as Majd approved them (Nov 8 2026): the app's own colours
(white or black ground, the account's accent; no Material You), resizable instead of Lock Screen
families. Native RemoteViews (Kotlin and XML) in a local Expo module for Android only, so iOS's
fingerprint doesn't move. No headless JavaScript: the widgets read the snapshot themselves.
- **Sizes** (a layout per size, chosen from what the launcher reports, `Render.kt`'s `shapeOf`: 4
  cells wide from 280dp, 2 tall from 140dp): Today and Prayer times 2×1, 2×2 (default), 4×1, 4×2;
  Verse of the day 2×2, 4×2; Qibla 1×1, 2×2. 4×1, 2×1 and 1×1 stand in for iOS's rectangular, inline
  and circular. The 4×1 prayer row tints the next prayer with `accentSubtle`/`subtleText`, which the
  snapshot's colours carry for it (iOS ignores them).
- **Data:** `lib/widgets/storage` hands the module the same JSON under the same key (`set`, then
  `reload`); it keeps it in SharedPreferences (`revisely.widgets`) and redraws on a background thread.
  `requireOptionalNativeModule`: binaries before 1.0.4 have none and nothing is written.
- **Time:** one alarm for the next change of a placed widget (the day's end, each of the six times
  and midnight, midnight for the verse), set again on every redraw, at boot, on a time, time-zone,
  12/24-hour or locale change, after an update, and when "Alarms & reminders" is granted.
  `SCHEDULE_EXACT_ALARM` is declared and never asked for (Majd, Nov 8 2026): with it the alarm is
  exact (Android 12–13 grant it; 14+ only if the user allows it), else within 10 minutes. Not a wake-up
  alarm. Prayer notifications become exact too where it's granted (expo-notifications uses it when
  allowed). The countdown is a `Chronometer` ticked by the launcher ("in 1:12:05"; RemoteViews can't
  say "1 hr, 12 min" without waking the app every minute).
- **Light and dark:** base colours are resources with `values-night`; the accent goes through
  `setColorInt(light, dark)` (Android 12+), so the launcher switches with the system's dark theme. On
  8–11 the current appearance is written and the next redraw follows a change.
- **Amiri and the dial** can't be RemoteViews: they're alpha masks (`Masks.kt`) tinted like any other
  image, so one bitmap serves both appearances and stays small (a widget's update is one binder call).
  `assets/widgets/` holds copies of `targets/widget/verses.json`, `Amiri-Regular.ttf` and its licence;
  `androidWidgets.test.ts` fails when they differ, or when the base colours leave `src/theme/v2.ts`.
- **Titles fit like iOS's** `minimumScaleFactor(0.8)` (`Render.fit`): `lib/passages` holds a surah and
  its ayahs together with a no-break space, and Android won't break at the dash between numbers either,
  so "Al‑Baqarah 142–252" broke inside "252" before it was made smaller.
- **Taps** open MainActivity with the iOS links (`revisely://today` …), handled by `WidgetSync`.
- **Previews:** `previewLayout` (Android 12+) is each widget's 2×2 layout with sample text; Verse and
  Qibla use small white masks in `drawable-nodpi`. Android 8–11 pickers show the app icon.
- **Tests:** the timeline rules and the snapshot parser are JVM tests
  (`cd android && ./gradlew :android-widgets:testDebugUnitTest` after `npx expo prebuild -p android`; not in
  CI); the bridge and the shared files in Jest (`widgetStorage`, `androidWidgets`).
- **On an emulator** without signing in: a debug build has `DebugSnapshotReceiver` (`src/debug`, absent from
  release builds): `adb shell am broadcast -n <the app's package>/app.revisely.widgets.DebugSnapshotReceiver
  -a app.revisely.widgets.DEBUG_SNAPSHOT -f 32 --es b64 "$(base64 < snapshot.json)"`. Widgets are added from
  the launcher's picker (`adb shell input draganddrop` from a preview to the home screen works); `adb shell
  cmd uimode night yes` switches the theme; `adb shell dumpsys alarm | grep revisely` shows the alarm.
- **Revo's guide** still says Android has no widgets (`functions/src/revo/guide.ts`): change it, deploy
  and re-record when 1.0.4 is out on Play.
