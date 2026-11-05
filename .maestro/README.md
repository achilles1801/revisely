# E2E flows

The real app on the iOS Simulator and the Android emulator, driven by Maestro, against the Firebase
emulators, at a time and in a time zone each flow sets. CI runs them (`.github/workflows/e2e.yml`):

| When | Flows | Jobs |
| --- | --- | --- |
| A PR into `develop` | the smoke set: 02, 04, 05, 06 | one iOS, one Android |
| A PR into `main`, every night (testing develop), by hand | all eight | two iOS, two Android |
| A push to `develop` | none: the native builds are kept for PRs | one each |

**The smoke set:**
- **02 (today's session):** the revision session, the core of the app. Like every flow it starts
  with sign-up and onboarding (`subflows/new-account.yaml`), checking what onboarding saved on Home,
  so 01 adds only its own details.
- **04 (Fajr boundary):** the day and time logic, where the bug that started this suite was
  (revise ahead before Fajr).
- **05 (daily log):** adding, editing and deleting notes. It found two app bugs on Nov 4.
- **06 (offline):** the phone's copy, the outbox and syncing back, where a bug would lose data.

03, 07 and 08 run before a release (the PR into `main`) and every night.

**Why not every flow on every PR:** a macOS runner is the scarce part, five at a time on this plan,
and each iOS job takes 21–39 minutes of flows.
- Nov 4–5: eight macOS jobs were wanted at once, and some waited 36 minutes for a runner.
- The smoke set is one iOS job instead of two, and about half the flows.

**`E2E` is a required check for merges into `develop`.** It is the workflow's last job:
- **Skipped flows:** its `changes` job reads the PR's files. When nothing in them goes into the app
  or the flows, the iOS and Android jobs are skipped and `E2E` passes. "Goes into" means anything
  outside `.github/scripts/app-hash.sh`'s ignore list, plus `.maestro/`, `e2e.yml`,
  `firestore.rules` and `firebase.json`.
- **Never missing:** it runs after a failure or a cancellation too, so a PR never waits for a check
  that won't come.
- **Partial runs:** a run by hand on one platform, or with `flows` (a glob such as `06-*`), reports
  as `E2E (partial run)` and can't stand in for the check. `debug` there adds Firestore's own log to
  the app's log.
- **Claude's PRs:** `claude-fix` starts it on its branch, with CI, since a PR opened by the workflow
  token starts no workflow.

A flaky flow is fixed, not skipped. Each failed flow is run once more (`E2E_RETRIES`). A pass on that
retry is a warning on the run, and the job keeps its results as for a failure.
- **Time limits:** `run.sh` stops a flow's attempt after 15 minutes and the warm-up after 6
  (`E2E_FLOW_LIMIT`, `E2E_WARMUP_LIMIT`). Maestro can hang for good: once its iOS driver answered
  500, its JVM never exited, and a job waited 55 minutes for it.
- **Caches:** this workflow holds no release secrets, so it keeps `node_modules`, Maestro and the
  Firestore emulator's jar, as it keeps the native builds.

They sit on top of the scenario tests (`tests/scenarios`, `BEHAVIOUR.md`): those run the app's
providers and screens in Jest; these run the built app, with its native modules, its navigation,
gestures, permissions, the keyboard, cold starts and the network. Each flow names the `BEHAVIOUR.md`
rules it covers in its first lines; recordings have no rule there yet.

| Flow | What a user does | Rules |
| --- | --- | --- |
| `01-onboarding` | Sign up, onboarding, Home's first day; a cold start; past midnight | SCHED-1, SYNC-4, DAY-1 |
| `02-revision-session` | Leave with nothing marked; swipe; Back; the check; the end card | SESS-1, SESS-2, SESS-3 |
| `03-revise-ahead` | Keep going; "Tomorrow starts at"; a day partly done ahead | AHEAD-1, -2, -3, -5, DAY-3, SESS-4 |
| `04-fajr-boundary` | Settings → Start day at fajr; Home at 03:00 and 08:00; revise ahead and a note before Fajr | DAY-1, -2, -3, -5, AHEAD-1, LOG-3 |
| `05-daily-log` | Two notes; one edited, the other deleted; each kept across a cold start | LOG-1, LOG-2 |
| `06-offline` | A session offline; a cold start offline; back online, the server has it | SYNC-1, SYNC-2, SESS-3 |
| `07-recordings` | Record in a session, find it in Activity, play, delete | none yet |
| `08-time-zone` | Kathmandu (UTC+5:45): the day turns at its midnight | DAY-1, DAY-6 |

Every account is new: signed up in the flow (`subflows/signup.yaml`) with Al-Fatihah and Juz 30
memorized (24 pages) and 10 pages a day, so the days are 1, 582–590 | 591–600 | 601–604, 1, 582–586.
The test clock starts on Tuesday, 3 November 2026.

## The E2E build

`EXPO_PUBLIC_E2E=1` at bundle time makes an E2E build (`src/lib/e2e/`):
- **Firebase** is a demo project, `demo-revisely`, on the Auth and Firestore emulators at
  `EXPO_PUBLIC_E2E_HOST` (default `localhost` on iOS, `10.0.2.2` on the Android emulator, which is
  how it sees this computer). App Check is skipped.
- **The network is hermetic.** JavaScript reaches only the emulators; everything else (the page
  images in the real Storage bucket, translations, the worker, push tokens) goes to a closed local
  port and fails at once. So the session shows "Couldn't load page" where the mushaf would be; the
  pages still swipe and count. NetInfo checks reachability against the Auth emulator.
- **A status line** at the foot of every screen (`e2e-status`): the app's time, the phone's zone,
  "offline" when the E2E network switch is off, and "net down" while NetInfo sees no connection.
  Flows read it; failure screenshots show it.
- Every other build drops all of it. Each use is behind `process.env.EXPO_PUBLIC_E2E === '1'`, which
  the bundler inlines (as `undefined` when unset), so the test and the `require` behind it fold away
  in release bundles. Check: `npx expo export --platform ios --clear` without the variable, then
  `grep -a -c revisely-e2e-build` on the `.hbc` finds nothing (it is 1 in an E2E bundle).

The native side of the build changes only in the generated `ios/` and `android/`: no updates
(`EXUpdatesEnabled` / `expo.modules.updates.ENABLED` false, so it can never fetch published
JavaScript), plain HTTP to the emulators on Android, and demo Firebase config files
(`scripts/firebase-demo-config.sh`). Nothing in `app.config.js` or `package.json` changes, so the
fingerprint doesn't either.

## Running them on your computer

You need Java 21 and the Firebase CLI (as for the rules tests), Maestro (`~/.maestro/bin/maestro`,
2.11), Xcode for iOS, and the Android SDK with an emulator for Android.

1. **The emulators**, in a terminal of their own:

   ```bash
   bash .maestro/scripts/emulators.sh
   ```

   The scenario tests use the same ports. To run both at once, move these:
   `E2E_AUTH_PORT=19099 E2E_FIRESTORE_PORT=18080 bash .maestro/scripts/emulators.sh`, and build with
   `EXPO_PUBLIC_E2E_AUTH_PORT=19099 EXPO_PUBLIC_E2E_FIRESTORE_PORT=18080`.

2. **The app.** A local build for testing, never a release (unsigned on iOS, the debug key on
   Android, never uploaded):

   ```bash
   bash .maestro/scripts/build-ios.sh        # → .maestro/build/Revisely.app (a few minutes)
   bash .maestro/scripts/build-android.sh    # → .maestro/build/revisely-e2e.apk
   ```

   It writes a demo `GoogleService-Info.plist` at the repository root, and stops rather than
   overwrite a real one: move yours aside first. After a JavaScript change, put the new bundle into
   the built app instead of building again (about a minute):

   ```bash
   bash .maestro/scripts/embed-js.sh ios .maestro/build/Revisely.app
   bash .maestro/scripts/embed-js.sh android .maestro/build/revisely-e2e.apk
   ```

3. **A device** of its own, so other simulators keep their state:

   ```bash
   xcrun simctl create "Revisely E2E" "iPhone 17 Pro"     # prints its UDID
   xcrun simctl boot <udid> && xcrun simctl install <udid> .maestro/build/Revisely.app
   ```

   Android: an AVD (any `google_apis` image), then `adb install -r .maestro/build/revisely-e2e.apk`.

4. **The flows:**

   ```bash
   E2E_DEVICE=<udid> bash .maestro/run.sh ios                                   # all of them
   E2E_DEVICE=<udid> bash .maestro/run.sh ios .maestro/flows/03-revise-ahead.yaml
   E2E_DEVICE=emulator-5554 bash .maestro/run.sh android
   ```

   `run.sh` first launches the app once (its first launch on a new device is slow, and iOS asks
   once per simulator before opening a `revisely://` link), then runs one flow at a time in its
   own zone and prints a table. Results, Maestro's logs and
   screenshots go to `.maestro/build/results/<platform>/<flow>/`. With other emulator ports, add
   `E2E_AUTH_URL=http://127.0.0.1:19099 E2E_FIRESTORE_URL=http://127.0.0.1:18080`.

## The clock

The app's `Date` runs at an offset from the device's own clock (`src/lib/e2e/clock.ts`), set by a link:

| Link | |
| --- | --- |
| `revisely://e2e/clock?at=2026-11-04T03:00` | that wall time in the phone's zone |
| `revisely://e2e/clock?at=2026-11-04T09:00Z` | that instant |
| `revisely://e2e/clock?at=now` | the real clock again |
| `revisely://e2e/network?offline=1` (`0`) | the E2E network off: the emulators unreachable (iOS) |

- Time runs on from there, as on a phone; timers and animations use real time.
- The offset is kept in a file in the app's Documents: a relaunch keeps the flow's time, and
  `clearState` (a fresh install) clears it. A launch that starts from the link waits for it before
  the first screen.
- A screen already open keeps its day until the app does what it does on a phone: a timer, coming
  back to the front, or a relaunch. Flows move the clock and relaunch
  (`subflows/set-clock-and-relaunch.yaml`), then check the status line.
- iOS asks "Open in Revisely?" the first time a simulator opens one of these links, sometimes a
  moment later; `subflows/open-link-prompt.yaml` waits for it and confirms.

## Time zones

A flow names its zone in a header line, `# e2e-zone: Asia/Kathmandu`; the rest run in
`America/Chicago`. `run.sh` sets it before the flow.
- **iOS:** the app is launched with `TZ` in its environment. Maestro launches apps with
  `xcrun simctl launch`, which passes on `SIMCTL_CHILD_*` variables from its own environment, so
  `run.sh` runs Maestro with `SIMCTL_CHILD_TZ`. Hermes' `Date` and `Intl` both follow it (checked:
  the status line shows the zone, and a time in Kathmandu turns the day at its midnight). The
  Simulator's own clock and status bar stay in the computer's zone.
- **Android:** the emulator's own zone, `adb shell cmd alarm set-timezone <zone>`, before the flow
  launches the app.

## Offline

- **Android:** real airplane mode (Maestro's `setAirplaneMode`).
- **iOS:** the Simulator shares the computer's network and has no airplane mode, so the E2E build's
  switch makes the emulators unreachable from the app (`subflows/network.yaml`); NetInfo's
  reachability check fails with them, and the app sees what a phone without a connection sees.
- **Firestore's back channels go to `127.0.0.1` on iOS** (`rewrite` in `src/lib/e2e/network.ts`);
  everything else goes to `localhost`. Until Nov 4 2026, `06-offline` was skipped on iOS in CI
  because the app stayed "Offline" for minutes after coming back online. The cause was in the
  connection to the emulator:
  1. On the slow CI Simulator, iOS sent a stream's back-channel GET on the handshake's kept-alive
     connection just as the emulator closed it.
  2. CFNetwork retried the GET on a new connection.
  3. The emulator had already written the first messages into the dead connection, and it doesn't
     send them again (reproduced against a local emulator).
  4. The stream lost the user document's messages and never came online.

  This happens only over plain HTTP/1.1 to the emulator. The real Firestore is HTTP/2, where a
  retried request is safe. With different hosts the two never share a connection. Debug a stream
  with a run by hand with `debug`: the app's log then has Firestore's log and every back-channel
  chunk.
- `06-offline` checks the server itself (`scripts/server-session.js`): Maestro reads the session
  from the Firestore emulator's REST API with its admin token, "Bearer owner", which only the
  emulators accept.

## Writing one

1. Find the rules in `BEHAVIOUR.md` and name them in the flow's first lines.
2. Start from `subflows/new-account.yaml` (a fresh install, the clock, sign-up, onboarding), with
   `CLOCK` and `BOUNDARY` (`midnight` or `fajr`). Set a zone with `# e2e-zone:` if it matters.
3. Select by `id:` (a `testID`). Add a `testID` to the app where one is missing.
4. Work out what the user should see by hand from the plan, as the scenarios do, not with the app's
   code.

Things that bit:
- Text with no-break spaces or hyphens (`p. 582`, `10 pages`, `Al‑Fatihah` on Home; the narrow
  space before "PM") needs `.` in the pattern: `Starts at Al.Fatihah, p..1[^0-9]*`. Patterns match
  the whole text.
- An element made accessible as a group is read as one label: the end card is
  `", Revision complete, 10 pages revised today"`, and Home's ahead line is spoken
  ("Tomorrow starts at Al-Fajr, page 594"). Select by `id:` and match the label.
- A multiline text field's `testID` doesn't reach iOS's accessibility tree: the log's field is
  found by its label (`subflows/log-input.yaml`).
- Percentages in `point:` must be whole numbers (CLAUDE.md). Maestro has no sleep: an optional
  wait for an element that never shows (`e2e-never-shown`) stands in.
- The mushaf runs right to left: the next page comes in from the left. Swipe until a count or the
  end card (`subflows/swipe-pages.yaml`), not a fixed number of times: on a slow emulator a swipe
  can be lost.
- A tap can be lost too: on a slow iOS Simulator, Home's "Start revision" once showed pressed and
  never fired (06-offline, run 41990309194). Open today's session with `subflows/open-session.yaml`,
  which waits for the session's header and taps again while Home's button is still on screen.
- Android waits for the screen to settle after each command. A screen that never settles (a
  recording's timer) needs `waitToSettleTimeoutMs` on the tap, or each tap takes a minute.
- On Android, text typed into a field as it gains focus can be lost; `subflows/type-in-log.yaml`
  checks the field and types again. Android also writes times as "12:23 pm" and may show dialog
  buttons in capitals: match with `(?i)`.
- One-time dialogs come when the app gets there, not at a fixed step (the recording backup notice,
  `subflows/backup-notice.yaml`). Wait for them a little where they belong, and accept them.

A failed attempt keeps Maestro's log and screenshots, a screenshot of the device and the app's logs
in `.maestro/build/results/<platform>/<flow>/`:
- `app.log` (iOS): the E2E build's own log (`src/lib/e2e/log.ts`). It has every console line the
  JavaScript wrote, including the app logger's, connectivity, the outbox and the root view's layout.
  An iOS release build passes only `console.error` to the unified log.
- `device.log` (iOS): the unified log.
- `logcat.txt` (Android): logcat, which has the same lines under `ReactNativeJS`.

CI uploads the folder for a job with any failed attempt.
