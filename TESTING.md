# Testing Revisely

The goal: the tests catch what a real user would hit, and the pipeline never hides a problem. This
file says what each layer proves, what in it is real and what is a stand-in, how to add a test, what
to do about a flaky one, and how the checks against production work.

The one rule behind all of it: **everything of ours runs for real** (the app's code, our Cloud
Functions, the security rules, the worker). **Only outside services may be stood in for, and only at
their outermost edge**, ideally with a response recorded from the real service. On Nov 7 2026 Majd's
first real Revo question crashed the app while every check was green: E2E answered Revo from an
in-memory stand-in, so no test had ever sent the app's real request to `revoAsk`. That is the kind
of gap this file exists to prevent.

## The layers

| Layer | Where | What it proves | When it runs |
| --- | --- | --- | --- |
| Unit and component tests | `src/**/__tests__`, `scripts/**/__tests__`, `worker/__tests__` (Jest, ~2,300) | A function or a component does what it says, fast | Every push and PR (`Unit + component tests`) |
| Cloud Functions tests | `functions/src/__tests__` | The functions' own logic (GitHub OIDC callers, the reset's rules, the emulator stand-ins being off in production, the recorded replies matching today's requests) | Every push and PR |
| Firestore rules tests | `tests/firestore-rules` | `firestore.rules` allows and refuses exactly what it should, in the real emulator | Every push and PR |
| **Scenario tests** | `tests/scenarios/scenarios` (`BEHAVIOUR.md`'s rules) | The app's real providers, screens and offline copy, against the Auth, Firestore, Storage and **Functions** emulators with the real rules, at a time and zone the test sets. A user's day, two phones, offline, resets, every callable the app uses | Every push and PR, four shards (`Scenarios`); `preview.yml` publishes nothing unless they pass |
| Property tests | `tests/scenarios/properties` | The schedule, day and limit rules over thousands of generated cases | With the scenarios |
| **E2E** | `.maestro/flows` (`.maestro/README.md`) | The release build on the iOS Simulator and the Android emulator: native modules, navigation, gestures, the keyboard, cold starts, airplane mode, against the same emulators and our functions | A PR into develop (single or a stack's top): the Android smoke set; after each merge to develop, a PR into main (its gate) and nightly: every flow, both platforms (`.maestro/README.md`) |
| **Live smoke check** | `scripts/smoke/live.js`, `live-smoke.yml` | Production works today: sign-in, App Check, Revo answering for real, the worker serving The Clear Quran | Daily, once its account exists (below) |
| Real devices | `testlab.yml` (once set up) | The app on real Android phones: crashes and ANRs a simulator doesn't show | Nightly, once set up (below) |

`Required` (CI's last job) is the one check a PR into develop needs: every job above that the change
needs passed.

## What is real, and what is a stand-in

Verdicts: **real** (runs as in production), **edge** (an outside service or the phone's hardware,
stood in for at its outermost edge: allowed), **retired** (a stand-in for our own code, removed),
**to do** (should be real; who owns it).

### Scenario tests (`tests/scenarios/harness`)

| What | Stands in for | Verdict |
| --- | --- | --- |
| The app's providers, screens, offline copy, outbox | — | **real** |
| Firebase JS SDK, Auth/Firestore/Storage emulators, `firestore.rules` | Google's servers (the emulators are Google's own, our rules run in them) | **real** |
| Our Cloud Functions (functions emulator) | — | **real** since Nov 7 2026: the app's `callFunction` reaches them with sign-in and App Check |
| `harness/testerReset.js` (ran the reset handlers in a Node process, a memory bucket) | `resetMyData`, `loadTestScenario` | **retired**: the real functions answer |
| `askCoach.scenario` (mocked `lib/coach/api`) | the Ask coach's client and server | **retired**: `callables.scenario` runs both for real. It found the coach's envelope bug |
| `lib/revo/memoryBackend` and `harness/revoServer.js` in `revo.scenario` | Revo's server | **retired**: the real `revo*` functions answer; a test can set the model's exact text (a cut-off reply) inside the recorded reply. `memoryBackend` stays for Revo's component unit tests only |
| Anthropic, inside the functions (`functions/src/emulator.ts`) | the Messages API | **edge**: a reply in Anthropic's shape from `functions/test-recordings/anthropic`. *Hand-written until recorded* (below). Per account it can fail as Anthropic does (401, 529, no connection) |
| App Check's attestation (`harness/appCheck.ts`) | App Attest / Play Integrity on the phone | **edge**: a token the emulator accepts, or none |
| The route to the functions (`harness/functions.ts`) | the internet between phone and Google | **edge**: refused while the phone is offline; carries the test clock |
| The clock and time zone (`harness/clock.ts`) | the phone's clock | **edge** (the server's clock follows it in the emulator only) |
| NetInfo, AppState, the disk, Modal | the phone | **edge** |
| The Qur'an pager (`harness/pager.tsx`) | page images in a native pager | **edge** (E2E runs the real pager) |
| Google Sign-In, Sentry, notifications | native SDKs | **edge** |
| `dayBlocks*`, `addRevised`, `addNote`, `contextMenu` scenarios mock `firestoreService` and `AppContext` | our own data layer | **to do**: move them onto the phone harness (real providers, emulators). The Activity sessions own these screens |
| `revo.property`, `coach.property` (in-memory stores, a fake model) | the functions' stores | kept as property tests of the handlers' rules; the real stores and wiring are covered by `callables.scenario` |

### E2E (`.maestro`, `src/lib/e2e`, the `EXPO_PUBLIC_E2E` switches)

| What | Stands in for | Verdict |
| --- | --- | --- |
| The app, a release build | — | **real** (`EXPO_PUBLIC_E2E=1` adds only what is listed here) |
| Auth and Firestore emulators, demo project | Google's servers | **real** (our rules run in them) |
| Our Cloud Functions and Storage (functions emulator) | — | **real** since Nov 7 2026 (`src/lib/e2e/functions.ts` gives the URL). Flow `10-delete-account` runs `deleteUserAccount` from the build |
| App Check | App Attest / Play Integrity | **edge**: an unsigned token only the emulator accepts (was: none at all) |
| Anthropic, inside the functions | the Messages API | **edge**, as above |
| `src/lib/e2e/revoFake.ts` (Revo in memory) and `revoAvailable` showing Revo to every E2E account | Revo's server and the tester rule | **retired**: `09-revo` runs the real functions; its account is made a tester through the emulator and the model's text set there (`.maestro/scripts/server-revo.js`) |
| The test clock (`src/lib/e2e/clock.ts`) | the phone's clock | **edge** |
| The hermetic network (`src/lib/e2e/network.ts`) | every host but the emulators | **edge** for outside services (translations, push). Our page images (Storage) and the worker are also blocked: **to do** below |
| The iOS offline switch | airplane mode (the Simulator has none) | **edge** (Android uses real airplane mode) |
| expo-updates off, demo Firebase config files | the update server, real config | **edge** |

### Elsewhere

| What | Verdict |
| --- | --- |
| Unit tests mock the Firebase SDK (`jest.setup.ts`) | kept: unit tests are about one module; the scenario layer runs the real SDK |
| `worker/__tests__` stub The Clear Quran's API and Cloudflare's cache | **edge** for the API. Running the worker under `wrangler dev` in E2E isn't practical yet: no flow reaches the translation sheet (E2E builds draw no page images), the worker verifies Google-signed ID tokens (the Auth emulator's are unsigned, so it would need an emulator mode in production code), and recording The Clear Quran needs the live key, which lives only in Cloudflare. The live smoke check runs the real worker daily instead |
| `playBuildAvailable`, `coachDigestDays` (called by GitHub, not the app) | unit-tested with GitHub's tokens made in the test; not in the emulator |

**Still to do** (follow-ups, not yet done): the page images from the Storage emulator in E2E (then a
flow can check a page and the verse sheet); the Activity scenarios onto the phone harness.

## Recorded replies (Anthropic)

The functions emulator answers Anthropic calls from `functions/test-recordings/anthropic/`: one file
per kind of request our functions send (`revo-ask`, `revo-review`, `coach`), plus a 401 and a 529.
The Cloud Functions tests fail when a request our code sends no longer matches the one its recording
was made with (model, `max_tokens`, `thinking`, the system prompt): record it again.

**Not recorded yet:** the files are written by hand in the Messages API's shape (`recordedAt: null`),
because recording needs an Anthropic key. To record real ones (a few cents, from the repository
root):

```bash
cd functions && npm run build && ANTHROPIC_API_KEY=… node scripts/record-anthropic.js
```

The key is read from the environment and sent only to api.anthropic.com; response headers are not
kept. The 529 stays as Anthropic documents it (an overload can't be produced on demand).

## Adding a test

1. **A rule a user would state** ("a note written before Fajr belongs to yesterday"): add it to
   `BEHAVIOUR.md`, then a scenario in `tests/scenarios/scenarios` named with the rule's id
   (`tests/scenarios/README.md`). Work the expected result out by hand, not with the app's code.
2. **A server call the app makes** (a callable): a scenario that calls it through the app's own client
   code (`callables.scenario.tsx`): success, and every refusal and failure the app maps (not allowed,
   limits, the model failing, no App Check, offline). Set server state with `harness/serverDocs.ts`,
   make Anthropic fail with `emulator/anthropic/accounts/<uid>` `mode`.
3. **Something only the built app shows** (native modules, gestures, the keyboard, a cold start,
   permissions): a Maestro flow (`.maestro/README.md`, "Writing one").
4. **A bug fix**: a scenario that fails without the fix (`spec.yml` checks a fix PR has one), run
   once without the fix to see it fail.
5. **A new outside service**: stand it in at its outermost edge with a recorded real response, list it
   in the tables above, and add it to the live smoke check if production depends on it.

## Changing the tests themselves

A PR into develop that changes code the tests share must prove it on everything that uses it, before
it merges (`plan` in ci.yml, `.github/scripts/affected-flows.js`): #286 changed `swipe-page.yaml`,
passed 06 once in the smoke set, and broke 06 on develop for everyone.

- **A subflow or a script under `.maestro/`, or a flow:** every flow that uses it (followed through
  other subflows), together with the smoke set, on **Android, twice**, with no reruns
  (`E2E_REPEAT=2`: every run must pass). iOS runs every flow once it lands (Majd, Nov 7 2026: the
  long flows gate production, not TestFlight), and a failure there opens `develop-red`.
- **`run.sh`, `.maestro/config.yaml`, `e2e.yml` or `ci.yml`:** every flow, Android, twice.
- **The scenario harness, its Jest config or `scripts/emulators.sh`:** the scenario suite twice. The
  second run starts from empty Firestore and Auth emulators (`harness/clearEmulators.js`), as the
  first does: it had found the first run's data, and the day's Revo spend put Revo to rest halfway
  through REVO-26 (#328's run 42586241564). Within one run, files still share the emulators, so a
  test sets up every document it reads that other accounts share (the month's coach ledger: COACH-4
  and REVO-37 each take a month no other test uses and clear its ledger first).

Drafts and a stack's lower layers wait until they are ready (or the top). It is slow on purpose:
one slow PR instead of a broken develop.

## Flakes

- **Fix the cause.** A flaky test is a bug in the test or the app, found. Never add a retry, a longer
  timeout to hide it, a skip or a looser assertion.
- The one retry is E2E's (`E2E_RETRIES=1`): a pass on the retry is a warning on the run, the job keeps
  its results, and the weekly flake report (`e2e-flakes.yml`) lists every flow under 95%.
- A pass that needed one of a flow's own stand-ins (its `WARNING <what> - …` or `KNOWN BUG <id> - …`
  line: the second swipe, SYNC-1's relaunch) is a warning on the run too, is recorded in
  `attempts.json` (`standIns`) and has its own column in the flake report, so a stand-in that hides a
  flake is counted, not silent.
- An input a slow emulator loses may be made again only where the screen shows it didn't take: a tap
  in `open-session.yaml` (Home still showing), a swipe in `swipe-page.yaml` (the count unchanged after
  10 s). The swipe one is marked temporary until the cause is found (06, offline: the failed attempts'
  logcat shows a keyboard insets animation timing out in the app's window just as the swipe lands).
- **No quarantine without an issue**: a test turned off must link an open issue in a comment beside
  it, and the issue says how to turn it back on.

## When develop is red

E2E failing on a push to develop, or in the nightly run, opens (or updates) one issue labelled
**`develop-red`** (`scripts/e2e/develop-red.js`): per platform, the failing flows, the run and each
flow's first failing step, and the **suspects**: the PRs merged since that platform's last green run,
the ones that changed a file a failing flow uses in bold. The first run green on every platform that
was red closes it. Fix it like any failure; don't wait for it to pass on its own.

**Revert first** when the cause isn't quick to fix: Actions → **Revert a suspect** → Run workflow with
the PR's number (`scripts/e2e/revert-suspect.sh`). It opens a PR into develop that reverts that one
merged PR, with auto-merge, and starts its CI; it refuses anything that isn't a PR merged into
develop. The change comes back later with its fix.

## The live smoke check (production)

The only test that touches the real services (`scripts/smoke/live.js`, `.github/workflows/live-smoke.yml`,
daily at 15:00 UTC and by hand). It signs in as a dedicated smoke account, exchanges a registered App
Check debug token, turns Revo on (no model call), asks `revoAsk` one tiny question (one real Sonnet
call, about a cent, counted in Revo's monthly cap and the account's 20 a day), clears that account's
Revo history, and fetches one block of The Clear Quran through the worker. Anything but a valid answer
fails the run and opens (or comments on) a **`live-smoke`** issue mentioning the owner; a pass closes
it. It never prints a token, a key or the account's id.

One Firebase backend serves store users and testers alike, so the account is a tester used for nothing
else, and the check writes only through tester-only features (Revo) to that account's own documents;
nothing a store user could see. The one shared thing it touches is a read: verse 1:1 through the worker,
which costs one of the worker's daily requests to The Clear Quran only when the data centre's cache
misses (about once a month: the worker keeps a block 30 days).

The worker step checks the block as the verse sheet would show it: 1:1 to 1:7 in order, each with text,
no markup but The Clear Quran's footnote tags, and 1:1 in The Clear Quran's own wording (its licence
allows no other translation under its name). **A cache hit tests our worker and its sign-in check, not
The Clear Quran's API**: the run's log gives `X-Cache` (`HIT` or `STALE`: the worker's cache answered;
`MISS`: The Clear Quran did). The credit line isn't in the worker's answer: the app adds it
(`creditLine` in `src/lib/translation.ts`), and the verse sheet's tests check it is shown with every
verse of The Clear Quran.

It skips with a notice until it is set up. **Majd's steps** (production data, so only he does them):

1. Create the account: an email and password used for nothing else (not the App Review account), signed
   up in the app or in Firebase Console → Authentication → Add user.
2. Make it a tester: `cd functions && GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-preview-tester.js <email>`.
3. App Check debug token: Firebase Console → App Check → Apps → the iOS app → ⋮ → Manage debug tokens
   → Add debug token, name it "Live smoke check", copy it.
4. Repository secrets (GitHub → Settings → Secrets and variables → Actions → New repository secret):
   `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `SMOKE_FIREBASE_API_KEY` (the app's Firebase web API key: `FIREBASE_API_KEY` in the
   EAS production environment), `SMOKE_APPCHECK_APP_ID` (the iOS app's id, `1:…:ios:…`, Firebase
   Console → Project settings), `SMOKE_APPCHECK_DEBUG_TOKEN`.
5. Actions → Live smoke check → Run workflow, and check it passes. (Scheduled runs start from main.)

To stop it: disable the workflow (Actions → Live smoke check → ⋯ → Disable), or delete the debug
token in the console.

## Real devices

Simulators and emulators don't show what some phones do (keyboard layouts, a Samsung's media
notification). Today those are found by people.

**Firebase Test Lab, nightly** (`testlab.yml`, `scripts/testlab/`, waiting on setup): a
release-config build of develop (production's config; App Check's debug provider with a token
registered for it, since Play Integrity can't vouch for an app installed outside Play; no Sentry, so
its crashes never count against production's gate; no updates) crawled by Test Lab's Robo on three
physical phones (a Pixel, a Galaxy S, a Galaxy A, each at its newest Android), signed in with its own
account, five minutes a phone. One Firebase backend serves store users and testers alike, so that
account is a tester used for nothing else, and Robo never presses Sign out, Delete account, Reset my
data, Load test scenario or Revo (its button and its switch, which would call the model). A crash or an ANR on
any phone goes to the `develop-red` issue as "Real Android phones (Test Lab)"; a clean night clears
it. Test Lab's no-cost use on the Blaze plan is 30 minutes of physical devices a day ($5 a
device-hour beyond, per minute; Firebase says not every Blaze project has the same quota, so check
the project's), and three phones × five minutes stays inside it. Maestro can't drive Test Lab's
phones (Robo or instrumentation only), so the flows stay on emulators.

It skips with a notice until set up. **Majd's steps** (Google Cloud and production data):

1. Google Cloud Console → project revision-buddy-3a398 → APIs: enable **Cloud Testing API** and
   **Cloud Tool Results API**.
2. IAM → Service accounts → Create `testlab-ci`, roles **Firebase Test Lab Admin** and **Firebase
   Analytics Viewer**; Keys → Add key → JSON. Repository secret `TESTLAB_SA_KEY` = the file's text
   (then delete the file). (Workload Identity Federation instead of a key also works; the workflow's
   auth step would change.)
3. A production account for the crawl only (email and password, onboarded with a plan, not the App
   Review account), made a tester like the smoke account (`set-preview-tester.js`). Secrets
   `TESTLAB_EMAIL`, `TESTLAB_PASSWORD`.
4. Firebase Console → App Check → Apps → the **Android** app → Manage debug tokens → Add ("Test
   Lab"). Secret `TESTLAB_APPCHECK_TOKEN`.
5. Actions → Real devices (Test Lab) → Run workflow. The first run shows whether Robo signed in
   (Test Lab's results: the crawl's screenshots); scheduled runs start from main.

The build carries the debug token inside it (that is how the debug provider works). It is uploaded
only to the project's own Test Lab storage; delete the token in the console to cut it off.

Other options, none signed up for (Majd decides; prices from vendors' pages and comparisons, Nov 2026,
check before buying):

| Option | What it runs | Price |
| --- | --- | --- |
| Firebase Test Lab | Robo, instrumentation; Android physical and virtual, iOS (XCTest) | 30 physical-device min/day free on Blaze, then $5/device-hour |
| Maestro Cloud | the Maestro flows as they are, iOS and Android | about $250 per device a month (by concurrent runs), 7-day trial |
| BrowserStack App Automate | Maestro and Appium on real iOS and Android phones | from about $199 per parallel a month |
| AWS Device Farm | Appium and others on real phones (Maestro through a custom environment) | $0.17 per device-minute, or $250 per device slot a month; 1,000 minutes once free |
| A phone of our own on a self-hosted runner | the Maestro flows on a real iPhone or Android | the phone; but a self-hosted runner on a public repository runs fork PRs' code, so only for trusted triggers |

## Speed

A single PR's `Required` took 20 to 27 minutes (Nov 6 2026), almost all of it the one Android smoke
job (20.4 minutes): about 2 minutes of setup, a minute to bundle the JavaScript, 1.3 to install and
boot the emulator, then 02, 04, 05 and 06 one after another (16 minutes). Since Nov 7 (#295):

- the smoke set runs in **two Android jobs side by side** (02 + 05, 04 + 06);
- a full run is **six Android jobs** of about 14 minutes of flows each and two iOS jobs of about
  50 (balanced from run 42548149857's times; macOS runners are five at a time);
- the JavaScript is bundled **while** the emulator installs and boots;
- disk space is freed only before a native build.

Measured on #295's own run: the two smoke jobs took 11:49 and 11:54, the slowest scenario shard 8:56,
so `Required` lands about 13 minutes after a push when runners are free. Queueing for runners (all
sessions share 20 jobs, 5 of them macOS) comes on top and is often the larger part.

One more fix made the pipeline tell the truth faster: every Android attempt now starts with airplane
mode off (`run.sh`). A failed `06-offline` attempt used to leave it on, so its retry and every later
flow in the job failed at sign-up (develop, Nov 7 01:41Z: 06 and 07 together).
