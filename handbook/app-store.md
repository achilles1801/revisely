# TestFlight and the App Store

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## TestFlight

- App Store Connect app id `6767990248`, team `CH8N5V9MA6`, bundle id `com.revisionbuddy.app`, Expo
  project `achilles1802/revision-buddy`.
- **TestFlight builds expire 90 days after upload.** If native code has not changed in a while, run
  `EAS Build` from the Actions tab before the installed build expires (it builds on the runner too).
  The new build has the same fingerprint, so current updates reach it.
- **A native change raises `version`** (1.0.2, 1.0.3, ...) in the same PR. On `develop` that builds a new
  binary for TestFlight; promoted updates for its fingerprint reach App Store users only once that
  version is approved.
  The exception is a version that hasn't gone to review yet: its builds share it. 1.0.2 was
  unsubmitted when the new-icon build followed build 20.
- A failed submission does not need a rebuild:
  `eas submit -p ios --id <build id>`. `eas submit:list --platform ios --json` shows the error.
- Apple refuses uploads while an agreement is unaccepted ("A required agreement is missing or has
  expired"); retries can then fail with no message at all. Check App Store Connect > Business: the
  Free Apps Agreement must be Active. The Paid Apps Agreement does not block a free app.
- The internal TestFlight group `Team (Expo)` has access to all builds, so every processed build
  reaches its testers with nothing to add (checked Oct 27 2026 with build 23). Auto-submit can't add
  builds to a group (Apple 403), which no longer matters.
- **A cancelled build can still reach TestFlight.** Cancelling `ios-build.yml` during `eas submit`
  doesn't stop an upload that has started: build 22 (fingerprint `6bd27a63`, from a duplicate run on
  Oct 27) arrived anyway. No update is ever published for such a runtime, so expire the build in App
  Store Connect (TestFlight → the build → Expire) once the right build is out.

## App Store

- **1.0 (build 11) was submitted for review on 2026-10-04**, the app's first App Store review, with
  release set to automatic on approval. Check with `node scripts/asc.js status`.
- Free, available in every territory except mainland China (an ICP filing is required there).
  Category Education. Age rating 13+ (`ageRatingOverrideV2`), matching the privacy policy and terms:
  the app is not directed to children under 13, which keeps it outside COPPA. Keep the three aligned.
- **1.0.1 (build 14) was submitted on 2026-10-21**, release automatic on approval. Build 14 predates the
  channel switch: in TestFlight it follows `production`, like the App Store. From 1.0.2, TestFlight
  follows `preview` and the App Store `production` (see Branches and releases).

`scripts/asc.js` drives App Store Connect (listing, screenshots, build, release type, submission).
Listing text is `store/listing.json`; screenshots are `store/screenshots/` (6.9" iPhone,
1320×2868, uploaded in file order).
- **Other localizations** (Majd, Nov 21 2026: en-GB, ar-SA and id, with 1.0.5) are `store/listing.<locale>.json`.
  - `listing --locale ar-SA` writes one, creating it if it's missing. `--dry` prints field by field and writes
    nothing. `--version 1.0.5` insists on that version. `--whats-new-form minor|feature` picks the file's What's New.
  - Only a locale file has `name`: en-US's name, subtitle and keywords stay as Majd set them.
  - Limits are checked before anything is written, keywords in bytes too, and text over one is refused, never cut.
    `node scripts/asc.js check` checks every file offline.
  - `listing.en-GB.json` is listing.json with British spelling only, and `scripts/__tests__/asc.test.js` fails when
    they drift.
  - The new locales use the primary language's screenshots.
  - Play's localized text goes in by hand: play.js's key has no store-listing rights. It needs a team API key with App Manager access:

```bash
export ASC_KEY_ID=Y9QXNBSWCN ASC_ISSUER_ID=98e03813-82b9-4a37-8c3b-962d9af24baa \
  ASC_KEY_PATH=~/secrets/AuthKey_Y9QXNBSWCN.p8
```

Key `AQ87A9LM2W` is the one EAS Submit created and holds; its .p8 cannot be downloaded again. Do not
revoke it, or CI submissions stop.

**JS-only change:** merge to `develop`, test in TestFlight, merge `develop` into `main` and approve the
promotion. No review, no new App Store version; users get it on their next launches. To undo, revert on
`develop`, test, merge and promote again (or promote an earlier preview group by hand: run
`Promote to production` with its group id). Apple permits this as long as the app does not change what
it fundamentally is.

**Native change** (a library with native code, plugins, permissions, icon, splash, Expo SDK):
1. In the same PR, raise `version` in `app.config.js` (e.g. `1.0.0` -> `1.0.1`). Every App Store
   version needs a higher version string, and the build must carry it. Raise it only with native
   changes: the version is part of the fingerprint, so a bump alone starts a build.
2. Merge to `develop`. CI builds and submits the next build to TestFlight, where Team (Expo) gets it
   (see TestFlight). Test it.
3. `node scripts/asc.js version 1.0.1`, `whats-new "..."`, `build <n>`, re-seed the reviewer (below),
   `submit`.
4. Ship it promptly: once the native change is on `develop`, every later update targets the new
   fingerprint, and App Store users on the old binary get nothing until they install the new version.
   A fix for the old binary: a branch from the last commit before the native change, `Preview` run on
   it by hand (workflow_dispatch), then `Promote to production` with that update's group id. TestFlight
   can't load it (the TestFlight builds are on the new runtime), so test it on the simulator.

**Before every submission**, re-seed the reviewer account so its 7-day streak ends yesterday, as the
review notes say:

```bash
cd functions && GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/seed-reviewer.js
```

The reviewer signs in as `applereview@revisely.app`; the password is stored in App Store Connect
(App Review Information), not in this repository. `scripts/asc.js listing` keeps it unless
`ASC_DEMO_PASSWORD` is set. Do not delete or change that account.

**App icon and splash** (2026-10-27): the gradient cursive R (Indigo #624BD5 → Lavender #9789DA) on
black. `assets/icon.png` is the opaque 1024 with no alpha. Android has an adaptive foreground and a
monochrome layer on #000000. The splash is `assets/splash-icon.png` at `imageWidth: 200` on #000000,
through the `expo-splash-screen` plugin; the top-level `splash` key would show it full screen. The splash
has no `dark` variant: prebuild would then set `UIUserInterfaceStyle` to Automatic, overriding
`userInterfaceStyle: "light"`. Sources (SVG masters, the Play 512) are in `assets/brand/`. Icon and
splash are native, so they ship in a build. App Store users see the new icon only when the version
carrying it is approved; App Store Connect takes the icon from the build, so `store/` holds none.

**Screenshots** come from the `screenshots@revisely.app` account (password in
`~/secrets/revisely-screenshots.txt`), seeded with `functions/scripts/seed-screenshots.js`, on an
iPhone 17 Pro Max simulator: the dev client, with Metro started with `--no-dev --minify` (no debug
overlays; use another port if 8081 is taken) and `xcrun simctl status_bar booted override --time
9:41 --batteryState discharging --batteryLevel 100 ...` (discharging: no charging bolt). Reopen the
app from the home screen to clear the back-link in the status bar.
- The 1.0.2 set (retaken Oct 28 2026 on develop c350b1e: Juz dots, the new glow, the Qibla icon),
  light, Indigo, 1320×2868 RGB (the 6.9" set; no iPad, `supportsTablet` is false): Home, the reader
  holding Al-Hamd with Saheeh International (not The Clear Quran, whose licence covers the app), a
  revision session, the Activity month, a day with recordings (the revision one paused at 2:01 by
  tapping its waveform 42% in), Insights.
  `store/screenshots/dark/` holds the same in dark; `asc.js screenshots` uploads only the top-level
  PNGs, so move a dark one up to use it.
- 1.0.3 (Nov 1 2026, release/1.0.3 2c28017): only Home was retaken, light and dark, for the
  "Starts at" line and the next-prayer line (location set to Chicago, the Mac's time zone). The
  seed writes sessions through yesterday in UTC, so in the evening (US time) shift them back a
  day, or Home shows today done. A worktree needs the local `.env` copied in, or the app stops
  at auth/invalid-api-key. PNGs from `simctl io` carry alpha: save them as RGB.
- 1.0.4 (Nov 13 2026, Majd approved): a headline over each screen (`scripts/store/compose.py`, the
  accents fan `fan.py`, Play's feature graphic `feature_graphic.py`). App Store: ten slides (Home,
  Revo, timer and recording, Activity, Insights, translations, memorize, accents, prayer times,
  widgets), dark for 1, 2 and 4–7. Play: eight from the Android emulator (1080×1920).
  - The seed now writes dates relative to the day it runs, in America/Chicago (`SCREENSHOT_TZ`;
    today = Juz 28, `--dry` checks). Run it on the day of the capture, and set the status bar to the
    real time so the prayer line ("Fajr in 10h 38m") agrees with the clock.
  - `store/screenshots/raw/` keeps bare captures for the website (`scripts/site-clips/stills.py`).
  - The app preview (886×1920, 30 s, 0:09.5 poster, silent) and Play's promo come from screen
    recordings through `scripts/store/video.py` (full bleed, a caption pill, the Dynamic Island
    painted out). They aren't in git (about 40 MB each) and go up by hand.
- 1.0.5 (Nov 18 2026, Majd approved): nine slides that lead with Mark mistakes, in the same order on both stores
  (mistakes, a mark's card, Revo, widgets, Home, timer and recording, Activity, Insights with Recitation, accents).
  Majd asked to keep the accents slide.
  1.0.4's sets are kept in `store/screenshots/1.0.4/` and `store/android/screenshots/1.0.4/`, which the upload
  scripts skip.
  - The takes are the E2E build's recorded take (`lib/e2e/reciteLive`, as flow 18), against the Firebase emulators:
    a new account signed up there, then `seed-screenshots.js` and `.maestro/scripts/seed-recite-takes.js` pointed at
    the emulators. No production data. The status line was hidden with a local change that was never committed.
  - Android: use the `Revisely_E2E` AVD (API 35). Maestro's driver dies on the API 37 image. The timer slide (both
    stores), the accents fan (both), Activity (App Store), and Revo and widgets (Play) are 1.0.4's; those screens
    haven't changed.
  - The app preview (28 s, poster 0:08.5) is in `~/Documents/revisely-today-mocks/store-105/final/`, not in git.
- The recordings are demo audio (a synthesized tone), placed on the simulator: two `.m4a` files and
  an `index.json` entry each (`levels` drawn to look like recitation) in the app's
  `Documents/recordings/<uid>/`, with the app closed. The seed turns the account's recording backup
  off, so they never upload. The day's daily log was typed in the app.

**Public pages** (`docs/`, served at revisely.app by Cloudflare on push to `main`): the one contact
is `support@revisely.app` (routed; it replaced `privacy@revisely.app` on 2026-10-27) in the footers,
on `/support/`, and in the privacy policy and terms. Do not add a postal address. The App Store
listing uses the same: support URL `https://revisely.app/support/` and "Contact:" in the review
notes (`store/listing.json`; App Store Connect gets them from `scripts/asc.js listing`, run with
the next submission). `docs/privacy/index.html` and `docs/terms/index.html` are edited by hand
alongside the `.md` files; change both. When the app gains or loses something that collects data, update the policy and
the App Privacy answers in App Store Connect (no API; done by hand) together.
