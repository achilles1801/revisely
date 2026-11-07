# E2E flows

The real app on the iOS Simulator and the Android emulator, driven by Maestro, against the Firebase
emulators, at a time and in a time zone each flow sets. CI (`ci.yml`) runs them through
`.github/workflows/e2e.yml`, with the sets its `plan` job picks:

| When | Flows | Jobs |
| --- | --- | --- |
| A single PR into `develop` (and claude-fix's runs) | the smoke set: 02, 04, 05, 06 | two Android (02 05, 04 06) |
| A PR into `develop` that changes code flows share (subflows, scripts, `run.sh`, `e2e.yml`, `ci.yml`) | the flows that use it with the smoke set, or all, each run twice with no reruns | both platforms (TESTING.md, "Changing the tests themselves") |
| A lower layer of a GitHub stack | none (the top layer tests the stack) | none |
| The top of a stack into `develop`, a PR into `main`, a merge group | every flow | two iOS, two Android |
| A push to `develop` (what just landed) | every flow on Android; iOS: the native build alone, kept for PRs | two Android, one iOS |
| Every night (testing develop), by hand | every flow | two iOS, two Android |

Every run that ran flows keeps their screenshots of key screens (`subflows/shot.yaml`;
`<flow>/run/takeScreenshot/<name>.png` under the results) as the artifact
`e2e-<platform>-screens-<job>-<run>`, and compares them with the approved baselines: a screen
that changed without its baseline being approved fails E2E (see "Screenshots" below).

**The smoke set:**
- **02 (today's session):** the revision session, the core of the app. Like every flow it starts
  with sign-up and onboarding (`subflows/new-account.yaml`), checking what onboarding saved on Home,
  so 01 adds only its own details.
- **04 (Fajr boundary):** the day and time logic, where the bug that started this suite was
  (revise ahead before Fajr).
- **05 (daily log):** adding, editing and deleting notes. It found two app bugs on Nov 4.
- **06 (offline):** the phone's copy, the outbox and syncing back, where a bug would lose data.

01, 03, 07, 08, 09 and 10 run before a release (the PR into `main`) and every night.

**Why not every flow on every PR:** a macOS runner is the scarce part, five at a time on this plan,
and each iOS job takes 21–39 minutes of flows.
- Nov 4–5: eight macOS jobs were wanted at once, and some waited 36 minutes for a runner.
- So iOS runs only where a whole change is tested (the top of a stack, a release, nightly), and a
  single PR gets the smoke set on Android, which runs on Linux.

**`E2E` is the workflow's last job; CI's required check, `Required`, waits for it:**
- **Skipped flows:** its `changes` job reads the change's files (a stack's top: the whole stack's;
  a push: what it added). When nothing in them goes into the app
  or the flows, the iOS and Android jobs are skipped and `E2E` passes. "Goes into" means anything
  outside `.github/scripts/app-hash.sh`'s ignore list, plus `.maestro/`, `e2e.yml`,
  `firestore.rules`, `storage.rules`, `firebase.json`, `functions/` and `scripts/emulators.sh`.
- **Never missing:** it runs after a failure or a cancellation too, so a PR never waits for a check
  that won't come.
- **Partial runs:** a run by hand on one platform, or with `flows` (a glob such as `06-*`), reports
  as `E2E (partial run)` and can't stand in for the check. `debug` there adds Firestore's own log to
  the app's log.
- **Claude's PRs:** `claude-fix` starts CI on its branch (which runs it), since a PR opened by the
  workflow token starts no workflow.

A flaky flow is fixed, not skipped. Each failed flow is run once more (`E2E_RETRIES`). A pass on that
retry is a warning on the run, and the job keeps its results as for a failure.
- **Flakes are counted.** A retry hides a flake (flow 02 needed its retry 13 times in 3 days before
  PR #286 fixed it), so every job keeps each flow's attempts:
  - `run.sh` writes a line per attempt to `attempts.tsv`, and at the end
    `scripts/attempts.js` turns them, with Maestro's own report of each attempt (`report.xml`: why it
    failed), into `results/<platform>/attempts.json`.
  - The job keeps it as the artifact `e2e-<platform>-attempts-<job>-<run>-<attempt>` (14 days),
    from every run, passing or not.
  - **The weekly report** (`.github/workflows/e2e-flakes.yml`, `scripts/e2e/flakes.js`), Mondays
    14:00 UTC and by hand: the last 7 days of those, as a comment on the issue
    **"E2E flakes (weekly report)"** (label `e2e-flakes`). Per flow and platform: runs, passed first
    time, passed on retry, failed both, and the first-attempt pass rate, worst first, with the
    reasons of the first attempts that needed a retry.
  - The rate is passed first time ÷ runs that passed: a run where both attempts failed is counted
    apart, since most are a branch's own bug. The owner is mentioned (GitHub emails it) only when a
    flow with at least 5 passing runs is under 95%.
  - Runs of a fork's pull request are left out. A PR that changes the report prints it in its job
    summary instead of commenting; so does a run by hand with `dry_run`. Like every scheduled
    workflow it runs from `main`.
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
| `10-delete-account` | Settings → Delete account, confirmed twice: the account and its data leave the server, back at sign-in | ACCOUNT-1 |

Every account is new: signed up in the flow (`subflows/signup.yaml`) with Al-Fatihah and Juz 30
memorized (24 pages) and 10 pages a day, so the days are 1, 582–590 | 591–600 | 601–604, 1, 582–586.
The test clock starts on Tuesday, 3 November 2026.

## Screenshots

After the flows, each job compares their screenshots with the approved ones (step "Compare the
screenshots", `.maestro/visual/`), so a screen that changes without anyone approving it fails E2E.
Before Nov 7 2026 nothing did: Activity screens that didn't match the approved mocks shipped.

- **Baselines:** `.maestro/baselines/<platform>/<name>.png`, one per screen and platform. From
  CI's devices only: iOS an iPhone 17 Pro Simulator (1206×2622), Android the pixel_6 emulator
  (1080×2400). Every flow captures Indigo in light today. A capture in another accent or theme is
  its own screen, named with suffixes: `-crimson` or `-jade`, then `-dark` (`r4-sheet-jade-dark`;
  `VARIANTS` in `screens.mjs`).
- **Normalised** before comparing or approving (`lib.mjs`): the status bar cropped, what still
  varies between runs masked (pink), and halved (each pixel the mean of 2×2), which keeps a
  baseline at 40–160 KB. The masks (`screens.mjs`, in the raw capture's pixels):
  - the E2E status line's clock (every screen);
  - a session's minutes in Home's "Recent sessions" (real time spent);
  - the next prayer's countdown ("in 2h 15m");
  - the daily log's note times;
  - Revo's button on Home (Revo is being rebuilt; unmask it when Revo's baselines are approved).
- **Compared** with pixelmatch (colour distance 0.1, anti-aliasing left out). More than 12 changed
  pixels of the halved image is a change: a changed digit of the 9 pt status line is about 15, and
  two runs of the same code differ by 0.
- **A changed screen fails the job.** The job summary has a table of every screen; the artifact
  `e2e-<platform>-visual-<job>-<run>` has a board of each one that differs (baseline | this run |
  differences in red, the changed area boxed) and the normalised captures.
- **No baseline yet:** reported, not failed. A capture of another size (a new simulator on the
  runner image) is reported as not compared, with a warning: approve again from a run on it.

**Approving an intended change**, in the same PR as the change:

```bash
npm ci --prefix .maestro/visual
node .maestro/visual/approve.mjs <run id>
```

- It downloads the run's `e2e-*-screens-*` artifacts with `gh` and normalises them as the check
  does. It writes the baselines that changed and keeps any a capture still matches (no churn).
- Screens being redesigned (below) are skipped unless named. Name screens to approve only those
  (`approve.mjs <run id> 02-home-done`); `--platform ios` for one platform.
- Look at the new PNGs, commit `.maestro/baselines/`, push; the PR's next run compares against them.
- **Which run:** a single PR into develop runs only Android's smoke flows (02 04 05 06). For a
  change that shows on iOS or in the other flows, run E2E by hand on the branch (Actions → E2E →
  Run workflow, both platforms) and approve from that run. Otherwise iOS fails later: at the top
  of a stack, the PR into `main` or the nightly run.
- `--from .maestro/build/results` approves a local run's captures: for trying the tool only, since
  the baselines must come from CI's devices.

**No baselines on purpose** (`PENDING` in `screens.mjs`), being rebuilt by other sessions. Approve
each once its boards match the approved mocks, then take it out of `PENDING`:
- Activity (Overview, Day, Insights: `07-activity-recording`);
- Insights' Smart Tracking intro (`02-smart-preview`);
- Revo (`09-revo`'s `r1`…`r10`), **in all six variants**: Indigo, Crimson and Jade, each in light
  and dark (`r4-sheet`, `r4-sheet-dark`, `r4-sheet-crimson`, … `r4-sheet-jade-dark`), each
  against its own mock. Then unmask Revo's button on Home (`revoButton`).

**A new screen:** a `shot.yaml` step in a flow; its first run reports "no baseline yet"; approve
it. If something on it changes from run to run (a time, a duration, a countdown), mask it in
`screens.mjs` rather than raising the tolerance. Masks are fixed rectangles: when a screen's layout
moves, check its masks still cover what varies (the boards show them in pink).

`npm test --prefix .maestro/visual` tests the tool (each job runs it first). The comparison takes
about a second a job.

## The E2E build

`EXPO_PUBLIC_E2E=1` at bundle time makes an E2E build (`src/lib/e2e/`):
- **Firebase** is a demo project, `demo-revisely`, on the Auth and Firestore emulators at
  `EXPO_PUBLIC_E2E_HOST` (default `localhost` on iOS, `10.0.2.2` on the Android emulator, which is
  how it sees this computer).
- **Our Cloud Functions** run for real in the functions emulator beside them (with Storage), built
  from `functions/`: the app calls them as in production (`callFunction`, `src/lib/e2e/functions.ts`
  gives the URL), with the account's sign-in and an App Check token only the emulator accepts (a
  simulator can't attest the app), and the E2E clock in `X-Revisely-Test-Now`, which the functions
  follow there. Inside them only Anthropic answers from a recording (`functions/src/emulator.ts`,
  TESTING.md).
- **The network is hermetic.** JavaScript reaches only the emulators (Auth, Firestore, Functions);
  everything else (the page images in the real Storage bucket, translations, the worker, push
  tokens) goes to a closed local port and fails at once. So the session shows "Couldn't load page" where the mushaf would be; the
  pages still swipe and count. NetInfo checks reachability against the Auth emulator.
- **A fresh install is light** (`pinFreshTheme` in `src/lib/e2e/theme.ts`), the theme the
  screenshots are approved in. The app chooses once, at the first launch, and a key written
  earlier in that same launch (the store check's app config, 3 s in) made a slow Simulator's
  fresh install start dark (run 42336185779); the E2E build makes the choice before the app
  starts.
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

1. **The emulators** (Auth, Firestore, Storage and our functions; the functions need their packages
   once: `cd functions && npm ci`), in a terminal of their own:

   ```bash
   bash .maestro/scripts/emulators.sh
   ```

   The scenario tests use the same ports. To run both at once, move these:
   `E2E_AUTH_PORT=19099 E2E_FIRESTORE_PORT=18080 E2E_FUNCTIONS_PORT=15001 E2E_STORAGE_PORT=19199 bash .maestro/scripts/emulators.sh`,
   and build with `EXPO_PUBLIC_E2E_AUTH_PORT=19099 EXPO_PUBLIC_E2E_FIRESTORE_PORT=18080 EXPO_PUBLIC_E2E_FUNCTIONS_PORT=15001`.

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
- On iOS a fresh install takes its clock at launch instead: `subflows/launch.yaml` passes
  `arguments: {e2eClock: …}`, which reach the app as `-e2eClock …` in its defaults, and
  `subflows/clock.yaml` sends no link once the status line shows the time. On a busy CI Simulator
  `simctl openurl` can give up after 10 s (SpringBoard was slow to open the app), and Maestro ends
  the flow on that error even with `optional: true`. Links later in a flow still go through it.

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
  end card (`subflows/swipe-pages.yaml`), one page at a time: each swipe waits until the app has
  counted it (`subflows/swipe-page.yaml`). E2E builds draw no page images, so the screen stands
  still before the app has caught up, and a count read straight after a swipe can be the one from
  before it; swiping again on that went past the count to the end card. A swipe can also be lost
  (the Android emulator, offline): a count still unchanged after 10 s means the page didn't turn,
  and it is swiped once more.
- Airplane mode belongs to the emulator: `run.sh` turns it off before every Android attempt, so a
  flow that failed offline doesn't leave the next one without a network.
- Wait for a button to be enabled before tapping it when the app may still be loading (Continue in
  onboarding waits for the new account's pages): a tap on a disabled button does nothing.
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
