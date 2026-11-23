# CLAUDE.md

Guidance for Claude Code in **Revisely**. `README.md` covers setup, tests and the branch table; this
file is the release mechanics and the traps behind them.

## Handbook: reference by area

This file holds the rules every session needs. Reference for each area lives in `handbook/`, moved there word for
word on Nov 22 2026 (Majd: "Yes, split it"; it was 208 KB, read in full by every session). Working on one of these?
Read its file first:

- Any screen or UI text (Majd's design rules, accents, surah-first wording): `handbook/design.md`
- Revisely Dev, the dev backend, dev.revisely.app: `handbook/dev-stack.md`
- OTA updates, store versions, forced updates, What's new, the November 2026 release gates: `handbook/updates.md`
- Sentry, the health report, Claude fix, the Claude key: `handbook/health.md`
- The stats digest and the metrics console: `handbook/stats-metrics.md`
- Offline (the account copy, the outbox), the offline mushaf, Saheeh International, QuranEnc: `handbook/offline.md`
- TestFlight, App Store submission, the icon, screenshots, the public pages: `handbook/app-store.md`
- The reader (verse positions, Copy and Share, The Clear Quran, recitation, the athan, Qibla, mushaf editions): `handbook/reader.md`
- Recording backup: `handbook/recordings.md`
- Android and Google Play: `handbook/android.md`
- The website (account, Premium, Open Door) and the worker (revisely.app/api): `handbook/website.md`
- Revo: `handbook/revo.md`
- Widgets: `handbook/widgets.md`

New reference docs go into the matching `handbook/` file (a new file is listed here too), not into this file. A rule
every session must follow goes here. `scripts/__tests__/handbook.test.js` checks that this list and `handbook/` agree.

## How a session works

- **Do the work in your own session** (Majd, Nov 6 2026). Don't hand it to sub-agents, forks or
  new sessions: no "E2E agent", no fork per bug, no follow-up chips for work you could do yourself.
- If a narrow, mechanical task really needs a sub-agent, set its model to `opus` explicitly. Check
  its output yourself before you rely on it or report it.
- **Always be working on Revisely** (Majd, Nov 14 2026: "we should ALWAYS be working on revisely. if it's not
  given a specific task then it should be looking to improve and writing down ideas for me to approve later on. we
  need everyone to be curious and to dive deep and to not be scared to be wrong. revisely is a long term quran app
  solution for the whole world and our scope is huge so there's always work to be done").
  - When your task is done, or while you wait on CI, a review or Majd, look for what could be better, in your area
    and beyond: bugs, UX, speed, tests, accessibility, languages, growth, cost, new features.
  - Write each idea as its own file in `~/Documents/revisely-ideas/` (the template and rules are in its
    `README.md`). Give the evidence, the proposal, the effort and risk, how sure you are, and the one decision Majd
    makes. The orchestrator brings them to him in batches.
  - Investigating is free to do: read the code, measure, reproduce, run cheap local checks. Building waits for his
    yes. That means no product changes, spending, deploys, production changes or new sessions on an idea alone.
  - Be curious, dig deep, and say how sure you are. A bold idea that turns out wrong costs nothing, but a quiet
    session wastes the time.
  - Everything else here still holds: privacy, free tiers, one simulator and no heavy jobs beside it, and the
    branch rule below.
- **Build new features straight into Revisely Dev** (Majd, Nov 16 2026: "the whole point of the dev app is so that
  we can test new features super quickly ... we don't necessarily need to approve a mock before it's built into the
  dev app. Just let me know when these things are built so I can go test them out myself in the app ... unless I
  explicitly ask for a mock before building something").
  - Draw a mock board if it helps you think, and save it in the area's mocks folder (for example
    `~/Documents/revisely-recite-mocks/`), but don't wait on an approval. Build it, then tell the orchestrator what is
    in Revisely Dev and where to find it.
  - Ask for his look first only when he asks for a mock, or for anything outside Dev: production, store listings, the
    public site.
- **Yes to everything that doesn't touch production** (Majd, Nov 15 2026: "yes to everything that doesn't impact
  production rn"). Approved ideas and choices that stay on develop, Revisely Dev, the dev backend (revisely-dev), the
  dev checker and tests go ahead. Production, the stores, his accounts and billing, public posts and spending still
  wait for him.
- **PRs into develop merge themselves** (Majd, Nov 16 2026: "the only time i should have to manually merge
  something myself is if it's going to production, all pr's aimed at dev can be automerged by claude"). Turn on
  auto-merge for every PR into develop once it's ready. PRs into `main` or a `release/*` branch are his to merge.
- **Google Drive is organized by area, then by item** (Majd, Nov 16 2026). Everything goes in his Drive's
  `Revisely/` folder:
  - `Product and design/`: design docs, specs;
  - `Marketing/`: one folder per piece, for example `Halaqa kit/English (drafts)`, `Influencers`;
  - `Mistake detection/`: for example `Volunteer recordings (revisely.app-record)`;
  - `Bug reports/`: one folder per bug, `<date> · <what happens>`.

  Each new idea or feature gets its own folder under the right area; add an area only when none fits. Never leave
  files loose at the top of his Drive.
- **One GitHub API limit for every session.** All sessions share one account's 5,000 requests an hour, and they ran
  out on Nov 15. Check CI once when you need it (`gh pr checks`, or `gh run watch --interval 120`), never in a tight
  loop.
- **Keep updates short** (Majd, Nov 23 2026: "i dont like how ur responses and updates to me are so incredibly long and
  verbose" … "the short response rule should be applied to all claude sessions"). Anything Majd reads, and every report
  to the orchestrator, is a few plain lines: what changed, what's verified, and what he must do. Details go in the
  shared notes or a doc, linked, for whoever needs them.
- **Hand off before your context fills, and name sessions by topic and number** (Majd, Nov 14 2026).
  - Check your context with `mcp__ccd_session_mgmt__get_usage` (session "self") at milestones and before big
    reads. Auto-compaction starts at about 97% and keeps you going, but it loses detail.
  - At about 93–95% (Majd, Nov 16 2026: "80% is too short to swap sessions, i was thinking closer to 95%"), write a
    full hand-off doc in `~/Documents/revisely-handoffs/<topic>-<n>.md`, before auto-compaction at about 97%:
    - the goal and scope;
    - where things stand;
    - the decisions and why, with Majd's words quoted;
    - branches, PRs and deploys;
    - running jobs and watchers;
    - who is waiting on what;
    - the next steps;
    - the traps you found.
  - Then stop starting new work and tell the orchestrator, who starts your successor with the doc. With no
    orchestrator, start it yourself.
  - **Titles** (`set_session_title`, "self"): a few words for the work, then a number.
    - The first session is "<topic> · MAIN".
    - The first successor is "<topic> · WORKER", then "<topic> · WORKER 2", "<topic> · WORKER 3"…
    - A successor renames itself when it starts.

## Branches and releases

**Which branch is for what** (Majd, Nov 14 2026: "it should be well known that develop is for revisely dev only and
main is strictly for production"):
- **`develop` is pre-production**: Revisely Dev (the Dev app), the dev backend, dev.revisely.app, and the testers'
  `preview` channel (TestFlight and Play testers of the store app, as below). Dev-only work goes there and only there,
  dev-only Worker code included (behind a var that only `wrangler.dev.jsonc` sets).
- **`main` is strictly production**: revisely.app and the store app. It gets work only through develop → main
  release merges, or a fix meant for production itself. Never ask Majd to merge dev work into main.
- **Bringing production's site to dev** is a main → develop merge, which never touches production.

- Work on `develop` (or a branch off it). CI (`.github/workflows/ci.yml`) runs on every push and PR.
- **Nothing reaches App Store users without passing TestFlight first.**
  1. A push to `develop` (`Preview`, `.github/workflows/preview.yml`) publishes the JS to the `preview`
     channel, and builds and submits to TestFlight first if native code changed. Each update's message
     ends with `[app <hash>]`, a hash of every file that goes into the app (`.github/scripts/app-hash.sh`;
     docs, store, scripts, functions, tests, rules and workflows don't count).
     - A run has two halves (Nov 7 2026). The push's run tests (the scenario gate); a newer push
       cancels an older push's tests, since its tree holds the older change too.
     - Once it passes, it starts `Preview · publish <sha>` (the same workflow, `publish` = the tested
       commit), which builds and publishes. These runs go one at a time and are never cancelled,
       so updates go out in order and a native build never starts twice.
     - The publishing half checks the tree's scenario artifact and that the commit is on the branch
       itself, so a run by hand can't skip the gate.
     - `dry_run` (by hand) tries both halves without building or publishing.
     - Before, every push waited for each older push's scenario run: 19–24 minutes from a merge to
       its update in a burst of merges.
  2. A tester's TestFlight install follows `preview`. The binary's channel is `production`; once the
     account has loaded, `src/lib/updateChannel.ts` switches to `preview` with
     `Updates.setUpdateRequestHeadersOverride` only if the install is from TestFlight (sandbox receipt,
     `modules/install-source`) **and** the account has `previewTester: true`. It then fetches the
     preview update, which runs from the next cold start. App Review also installs with a sandbox
     receipt, which is why the account matters: the reviewer is not a tester and stays on
     `production`. Mark or unmark a tester with
     `cd functions && GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-preview-tester.js <email> [--off]`
     (`--list` shows them; clients can't write the field). Binaries before 1.0.2 lack the module and
     stay on `production`, in TestFlight too. To start an account again as a new user (keeping its
     sign-in and `previewTester`), `node scripts/reset-account.js <email>` from `functions/` (a dry
     run; `--yes` backs up to `~/secrets/backups/<uid>-<date>/`, checks the backup, then resets;
     `--check` says whether it still looks new). `restore-account.js <backup dir>` puts it back.
     It refuses the App Review account. Testers can also do it themselves: Settings → Testing →
     Reset my data (shown only when `previewTester` is true; type RESET) calls the callable
     `resetMyData` (`functions/src/testerReset.ts`). It works on the caller's own uid only, needs
     App Check and `previewTester` read on the server, refuses the App Review account, allows one
     reset per 10 minutes and 10 tries a day (`adminResets/<uid>`, closed to clients), and backs up
     to Storage `backups/tester-resets/<uid>/<time>/` (closed to clients) before changing anything.
     Unlike the script, it also deletes that phone's local recordings (the user asked for it on that
     phone). Deployed Nov 5 2026; deploy it again (`firebase deploy --only functions:resetMyData`)
     when `testerReset.ts` changes, and keep its `freshUser` in step with `reset-account.js`.
  3. Try it in TestFlight, then merge `develop` into `main` (a PR, CI green). Changes made on `main`
     directly that go into the app block promotion until they come back through `develop`.
  4. `Promote to production` (`.github/workflows/promote.yml`) finds the preview update with main's
     app hash and republishes that same update to `production`, after you approve the run in the
     `production` environment (Actions > the run > Review deployments; only `main` may deploy there).
     No matching preview update: nothing is promoted and the run fails. It never builds.
- **Android does all of this too, in the same runs** (Play internal testing in TestFlight's place;
  one update group per platform, promoted together). See "Android (Google Play)".
- **Nothing publishes to `production` except promote.yml.** Not a laptop, not another workflow. A fix
  goes through `develop` and TestFlight like anything else. App Store submission and Play production
  releases stay manual (`scripts/asc.js`, `scripts/play.js`), on the owner's word.
- Native builds run on a GitHub macOS runner (`ios-build.yml`: `eas build --local`, then
  `eas submit --path`), which uses no EAS build credits; the repo is public, so runner minutes are free.
  Local builds are not listed by `eas build:list`, so a submitted build pushes a tag `ios-fp/<fingerprint>`,
  and `preview.yml` treats a fingerprint with that tag (or an EAS build, i.e. build 11 and earlier) as built.
- Never run `eas update` or `eas build` from a laptop to ship. Everything on a phone should trace to a
  commit on `develop` (TestFlight) or `main` (App Store, promoted).
- Pushes that touch only docs, tests, `functions/`, `scripts/`, `worker/`, `admin/` (the staff console), `wrangler*.jsonc`,
  workflows, Firestore rules or `.md` files publish nothing (`paths-ignore` in both workflows). Firebase rules and functions still deploy by hand
  (`firebase deploy`, see README).

**Rolling back** a production update: Actions → Promote to production → Run workflow on `main` →
`group` = the previous production update group (`eas update:list --branch production`), `rollback` =
true → approve. It republishes that exact update, the same way promotion does.

## Runtime version is a fingerprint

`runtimeVersion: { policy: "fingerprint" }` in `app.config.js`: an update reaches only binaries built
from the same native code. The workflow computes the iOS fingerprint, looks for a production build
with it (`eas build:list --runtimeVersion`), builds and auto-submits if there is none, then publishes.

The hash must come out identical on a laptop, the GitHub runner and the EAS builder, or CI starts a
build on every push and its updates reach nobody. `fingerprint.config.js` holds what makes that true:

- `extra` is skipped: it is JS config carried by each update, and it varied with whether `.env` existed.
- `eas.json`, `GoogleService-Info.plist` and `google-services.json` are ignored. The Firebase files are
  gitignored, so they exist on a laptop and EAS but not on the runner.
- `ios.googleServicesFile` is a fixed path, `./GoogleService-Info.plist`. On EAS the
  `eas-build-pre-install` script in `package.json` copies the `GOOGLE_SERVICES_INFO_PLIST` file there.
  Before this it read the file variable's path, which differs per machine and changed the hash.

Compute it the way CI does, with the EAS production environment loaded:

```bash
eas env:exec production 'npx expo-updates fingerprint:generate --platform ios' | grep '^{' | jq -r .hash
```

Run this before and after any change to `app.config.js`, `fingerprint.config.js`, `package.json` or
a native dependency. If a change should not be native but the hash moved, find out why before
merging. `eas fingerprint:generate --json` prints a banner before the JSON, so it does not pipe into `jq`.

**The store app's fingerprints move only in a PR meant to move them** (Nov 23 2026: 1.0.5's on-device Recite is linked
into Revisely Dev only until the release owner's native PR). CI's Fast checks fail a PR that moves either
(`scripts/check-store-fingerprints.js` against `scripts/store-fingerprints.json`; computed with no environment, so not
the published runtime versions). A PR meant to move them runs the script with `--write` and commits the file. How to
keep native work in Revisely Dev only: `handbook/dev-stack.md`, "Native code in Revisely Dev only".

The root `.gitignore` is a fingerprint source: editing it changes the hash and starts a native build
(a `coverage/` line did, Oct 26, and the build was cancelled). Ignore new paths with a `.gitignore`
inside the directory instead, as `coverage/.gitignore` does.

## Config and secrets

- App config (Firebase web keys, Google client ids, Sentry DSN, `GOOGLE_REVERSED_CLIENT_ID`) lives in
  the `production` environment on EAS. Builds read it, and the workflow passes
  `--environment production` to `eas update`, so no `.env` is needed in CI. Add new config there
  (`eas env:create`), not only in the local `.env`.
- Variables with Secret visibility on EAS (`GOOGLE_SERVICES_INFO_PLIST`, `SENTRY_AUTH_TOKEN`, the QF
  secrets) are readable only on EAS builders, not on the GitHub runner.
- GitHub repository secrets: `EXPO_TOKEN`, and `GOOGLE_SERVICE_INFO_PLIST` (base64 of the plist).
  `eas build` resolves the native config on the runner before sending the build, which needs the
  plist at its fixed path, so the workflows write it from that secret first.
- The repository is **public**. Check a diff for keys before pushing; CI's "Secret scan" fails on
  anything that looks like one (`bash scripts/check-secrets.sh` runs it locally). A secret that was
  committed must be revoked: deleting the line leaves it in git history.

**App Check debug token** (development builds only). Simulators can't use App Attest, so `__DEV__`
builds use App Check's debug provider with a token registered in the console. It is read from
`EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN` in your local, gitignored `.env` (`src/lib/appCheck.ts`), never
from the repo. Release builds (preview, production) never carry it: the value sits inside the
`__DEV__` branch, which the release bundler removes (verified: a marker value set in the variable is
absent from `npx expo export --platform ios` and present in `--dev`), and EAS has no such variable.
To create one:
1. Firebase Console → project revision-buddy-3a398 → App Check → Apps → the iOS app
   (`com.revisionbuddy.app`) → ⋮ → **Manage debug tokens** → **Add debug token** → generate, name it
   (e.g. "Majd's simulator"), copy the value, save.
2. In `.env` at the repo root: `EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN=<the value>` (see `.env.example`).
3. Restart Metro with a clean cache (`npx expo start --dev-client --clear`): `EXPO_PUBLIC_*` values are
   inlined at bundle time.

Without one, the SDK logs a new debug token at launch (Xcode console: "App Check debug token"),
which you can register the same way. To revoke a token, delete it under Manage debug tokens. The old
hard-coded token was deleted from the console on 2026-10-27.

## CI

- **How we test: `TESTING.md`.** The layers and what each proves, what is real and what is stood in
  (only outside services, at their outermost edge: everything of ours runs for real), adding a test,
  flakes (fix the cause, never a retry or a skip), the `develop-red` issue, the daily live smoke check
  against production and real devices (Test Lab).
- **Behaviour first.** `BEHAVIOUR.md` lists every rule the app keeps for its users, each with an id.
  The scenario and property tests in `tests/scenarios/` check them (how to run and write them:
  `tests/scenarios/README.md`). Scenarios run the real providers, Home and the session screen against
  the Auth, Firestore, Storage and Functions emulators (real rules, our real functions; only Anthropic
  answers from a recording, `functions/src/emulator.ts`), with a test clock and time zone. Property tests
  (fast-check) cover the schedule and day functions. `Scenarios` in CI (`scenarios.yml`) runs both,
  and `preview.yml` builds and publishes nothing unless it passes: on that push, or on exactly its tree
  in the PR's own CI (a PR merged with nothing else landing meanwhile; `scenarios-passed-<tree>`
  artifacts, same-repository runs only), so a clean merge reaches TestFlight without a second run
  (about 5 minutes from the merge to the update; 15 when the suite runs again). Its publishing half
  checks that artifact again before it builds or publishes.
  - **Every bug fix adds a scenario** that fails without the fix and names the rule it keeps
    (`[DAY-2]` in its title). The "Behaviour spec" check (`spec.yml`) fails a fix PR (branch `fix/`,
    `hotfix/`, `claude/issue-`, or a title starting "Fix") that changes `src/` without one. Only the
    `no-scenario` label, with the reason in the PR, lets one through.
  - A rule changed on purpose changes in `BEHAVIOUR.md` first, in the same PR as its tests.
  - `KNOWN BUG` tests (`it.failing`) pin bugs that are still open; `BEHAVIOUR.md` lists them. A fix
    turns its test red, and the PR makes it an ordinary test.
  - `node tests/scenarios/check-spec.js` fails when a rule has no test, or a test names an unknown id.
  - The suite has its own `package.json` (fast-check), so it changes neither the app's dependencies
    nor the fingerprint.
- "Secret scan" (`scripts/check-secrets.sh`): `git grep` over tracked files for high-signal secret
  patterns (private keys, Google/Anthropic/OpenAI/GitHub/Sentry/AWS/Slack/Stripe/Expo tokens, The
  Clear Quran keys, App Check debug-token assignments), printing paths and lines, never the match.
  `--self-test` checks every pattern still catches a sample. Coverage reports aren't committed
  (`coverage/` is ignored; CI uploads them as an artifact).

- **Emulators: always through `scripts/emulators.sh`** (`exec <only> <project> '<command>'`, or
  `start` for local E2E). It takes a lock per set of ports (a folder in `/tmp`; it waits for the
  owner, takes over one whose owner has exited, and waits while the ports are held by something
  started by hand, naming it). Several sessions and worktrees ran `firebase emulators:*` on the same
  ports (8080, 9099, 4400) at once and broke each other's runs (Nov 5 2026). `npm test` in
  `tests/scenarios` and `tests/firestore-rules`, `scenarios.yml`, and `.maestro/scripts/emulators.sh`
  all use it. A worktree of its own: `REVISELY_EMU_PORT_BASE=auto` (ports from the worktree's path,
  the same each time) or a number (Firestore at it, Auth +1, Storage +2, hub +3, logging +4). The
  scenario harness and the rules suite read the ports from the environment the script sets.
- The app typecheck excludes `functions/` and `tests/firestore-rules/`. Each has its own
  dependencies and its own job.
- The rules tests need Java 21 (firebase-tools). When `firestore.rules` changes, update the tests in
  `tests/firestore-rules/` in the same change. They had drifted before.
- The release workflows use Node 22, which current eas-cli requires. CI jobs use Node 20.
- The runner build pins Xcode (`xcode-select` in `ios-build.yml`, image `macos-26`). Apple requires
  a current SDK for uploads; move the pin when the image or Apple's minimum changes.
- Secret EAS variables are unreadable on the runner: the plist comes from `GOOGLE_SERVICE_INFO_PLIST`,
  and Sentry source maps upload only if a `SENTRY_AUTH_TOKEN` repository secret exists.
- **E2E** (`e2e.yml`, `.maestro/README.md`): Maestro flows on the iOS Simulator and the Android
  emulator against the Firebase emulators, at a time and in a zone each flow sets (sign-up, a
  session, revise ahead, the Fajr boundary, the daily log, offline, recordings). CI calls it with
  the sets `plan` picks (see "Where the slow checks run" above): the smoke set is 02 session, 04 Fajr
  boundary, 05 daily log, 06 offline (two Android jobs side by side: 02 + 05, 04 + 06); every flow is
  two jobs a platform. The top of a stack tests the
  stack's whole change. One run per PR (a push cancels the older one); a push to develop cancels the
  run of the push before it, and never a full run started by hand. A red run on develop doesn't stop
  the preview (the scenario gate does that): fix it like any failure. iOS runners are the slow part
  (5 macOS jobs at once on this plan): don't start iOS runs you don't need.
  - **Screenshots:** the flows take one on key screens (`subflows/shot.yaml`: Home's states, a
    session page, the end card, the daily log, offline, a recording, Kathmandu). Every run that ran
    flows keeps them as the artifact `e2e-<platform>-screens-<job>-<run>` (14 days):
    `gh run download <run> -p 'e2e-*-screens-*'`. Check a visual change there, not on Majd's
    simulator.
  - **Visual regression** (Nov 7 2026; `.maestro/README.md`, "Screenshots"): after the flows, each
    job compares its screenshots with the approved baselines in `.maestro/baselines/<platform>/`
    (`.maestro/visual/`: status bar cropped, what varies between runs masked, pixelmatch). A
    screen that changed fails E2E, with a board (baseline | this run | differences) in the
    artifact `e2e-<platform>-visual-…`; a screen with no baseline is only reported. **An intended
    change is approved in the same PR:** `node .maestro/visual/approve.mjs <run id>` (after
    `npm ci --prefix .maestro/visual`), look at the PNGs, commit `.maestro/baselines/`. A single PR
    runs Android's smoke flows only: for a change iOS or other flows show, run E2E by hand on the
    branch (both platforms) and approve from that run. Activity, Insights and Revo have no
    baselines yet (being rebuilt): approve theirs once their boards match the mocks.
  - **Activity boards** (the screens against their mocks, `~/Documents/revisely-today-mocks/activity-redesign/png`):
    flows `09-activity-light` and `09-activity-dark` seed the mocks' account (`.maestro/scripts/seed-activity.js`:
    305 pages, the Fajr boundary, October as d3, Insights' figures as d4) and capture Overview, a day
    (top, end, its menu, a light day), the + menu, the Revised, Memorized and Note sheets, and Insights
    (top, Weak spots, end). The E2E build writes the mocks' recordings itself
    (`src/lib/e2e/demoRecordings.ts`, `subflows/relaunch-recordings.yaml`). Run them with
    `gh workflow run e2e.yml --ref <branch> -f platform=ios -f flows='09-activity-*'`, then
    `~/Documents/revisely-today-mocks/.venv/bin/python scripts/verify/activity-boards.py --run <id> --platform ios`
    writes one board per screen (capture left, mock right) into `activity-redesign/verify/`. A UI
    change to Activity is done when its boards match, light and dark, apart from Majd's decisions.
    A change to the seed: keep each figure the boards show (a figure that moves is a data change,
    not a design one).
  - **Cached builds:** the native build is kept per fingerprint, so a JavaScript-only change only
    re-bundles. A PR restores develop's (pushes keep it there) and the nightly run's (kept on
    `main`); a stack's upper layers see only `main`'s, so after a native change they build once,
    until the next nightly run.
  - **Hangs and system alerts:** `run.sh` stops a flow attempt after 15 minutes and the warm-up
    after 6 (a Maestro driver that answered 500 once hung a shard for 55 minutes). Flows confirm
    iOS permission alerts (the simulator's microphone grant sometimes doesn't take), and the clock
    and network links are re-sent until they take.
  - **The daily log** (05) checks again 8 s after each change is sent: a note that drops out once
    sent, or a deleted one that comes back, fails it (#220 fixed exactly that, Nov 5 2026).
  - **Its check:** the job `E2E` (CI's `Required` waits for it). Its `changes` job reads the change's files; when nothing that
    goes into the app or the flows changed (only what `.github/scripts/app-hash.sh` leaves out, other
    than `.maestro/`, `e2e.yml`, `firestore.rules` and `firebase.json`), the platform jobs are
    skipped and `E2E` passes. It also runs after a failure or a cancellation, so it is never
    missing. A run by hand on one platform or some flows reports as `E2E (partial run)`.
    `claude-fix` starts CI on its branch, which runs it.
  - A flaky flow is fixed, not skipped (Nov 4 2026). A pass on a retry is a warning, and the job
    keeps its results (screenshots, `app.log`: the E2E build's own log, `src/lib/e2e/log.ts`).
  - **Flakes are counted** (Nov 7 2026): every job keeps each flow's attempts (`attempts.json`,
    artifact `e2e-<platform>-attempts-…`), and `E2E flakes` (`e2e-flakes.yml`, Mondays 14:00 UTC
    and by hand, from `main`) comments the week's first-attempt pass rate per flow and platform,
    worst first, on the issue "E2E flakes (weekly report)" (label `e2e-flakes`). It mentions the
    owner only when a flow is under 95%. A flow there is fixed like a failing one.
  The app is an E2E build: `EXPO_PUBLIC_E2E=1` at bundle time loads `src/lib/e2e/` (the
  emulators, a hermetic network, the test clock `revisely://e2e/clock?at=…`); every other build
  drops it, since the bundler inlines the variable. Keep new E2E code behind that test, and check a
  release export has none of it. Its native build is cached per fingerprint: the workflow has no
  secrets (demo Firebase config files) and publishes nothing. Run them locally with
  `.maestro/scripts/` and `.maestro/run.sh`, never with a release build or `eas`.

- `develop` requires one check to merge: **`Required`** (ci.yml's last job, since Nov 6 2026). It
  runs after a failure too and fails unless every job the change needs passed: `Fast checks` (one
  job since Nov 7 2026, a step each: secret scan, typecheck, lint (`scripts/lint`, errors fail), unit +
  component tests, Cloud Functions tests, Firestore rules tests; every step runs even after one fails),
  Scenarios (four shards split by each file's time; `Scenarios / Scenario tests` passes only if all four
  did) and E2E when `plan` asks for it.
  A job skipped because another failed is not a pass. Two jobs may be skipped when the plan leaves them
  out:
  - E2E.
  - Scenarios, for a PR that changes nothing the suite reads (Nov 22 2026; `.github/scripts/scenarios-needed.js`).
    It's conservative: only the website, store, `.maestro/`, the console, the worker, some of `scripts/` and
    plain `.md` files (not BEHAVIOUR.md, nor docs under `src/`, `tests/` or `functions/`); any other path runs
    the suite. All of these are in Preview's `paths-ignore`, and a skipped run uploads no
    `scenarios-passed-<tree>`, so publishing still needs a run that passed. Pushes, merge groups and runs by hand
    always run it. Branches needn't be up to date with develop (`strict` off: the Preview
  workflow's scenario gate still stops a broken develop from publishing). Admins can still bypass
  (`enforce_admins` off). `main` has no branch protection. "Bug fixes add a scenario" (`spec.yml`)
  runs on every PR on its own, so a label or a title edit re-runs it alone.
- **Where the slow checks run** (`plan` in ci.yml; E2E is `e2e.yml`, called from CI):
  - a draft PR: no E2E unless it has the `e2e` label; marking it ready runs everything;
  - a lower layer of a GitHub stack: the fast checks only (the top layer tests the whole stack);
  - the top of a stack into develop, a PR into `main`, a merge group: every E2E flow, iOS and Android;
  - a single PR into develop (and claude-fix's runs): the Android E2E smoke set (Linux, KVM), no iOS;
  - what lands on develop (each push): every Android flow, and the iOS native build alone (kept
    where every PR can restore it); a newer push cancels the run of the one before, so a push's
    E2E covers everything since the last push whose CI passed (a docs-only push after a cancelled
    run still tests that run's change);
  - nightly (develop) and by hand: every flow on both, from e2e.yml itself. Runs by hand never cancel
    each other, and skip iOS jobs the same commit already has running.

  So iOS flows run only for the top of a stack, PRs into `main`, nightly and by hand.
- **Stacks** (GitHub's stacked PRs, GA Oct 6 2026; `gh extension install github/gh-stack`, which
  needs gh 2.90 or later): a large change is a stack, one layer per PR, each based on the one below.
  - **Linear history.** Rebase a branch onto develop (or onto the layer below) and force-push with
    `--force-with-lease`; never merge develop into a stack branch. GitHub requires it for stacks,
    and it ends the "merge commit cannot be cleanly created" refusals (several merge bases).
  - **Merging.** Every layer's `Required` must pass. Merging the top merges the whole stack, one
    merge commit per layer. Merge from the top, not a lower layer alone: a lower layer has passed
    only the fast checks.
  - **Retargeting.** When a lower layer lands, GitHub rebases the rest onto develop.
- **Merging into develop: auto-merge, no polling** (Nov 6 2026). A single PR: `gh pr merge <n>
  --auto --merge`, and GitHub merges it once `Required` passes. A stack: the same on its top PR, or
  `gh stack merge` (auto-merge for stacks is still rolling out). To follow a PR, run
  `gh pr checks <n> --watch --fail-fast` in the background (one command that returns when the checks
  finish or the first one fails), never a loop. A PR whose checks fail stays open: fix it and push.
  GitHub's merge queue needs an organization-owned repository (this one is a user's: the API refuses
  the rule); `ci.yml` already runs on `merge_group`, so moving the repo to an organization and adding
  the ruleset is all it would take.
- No caches in jobs that hold release secrets (`preview.yml`, `promote.yml`, `ios-build.yml`: no
  `cache: npm`, `eas-cache: false`). The fix job runs code Claude writes on these runners, and a cache
  entry written by one run can be restored by another. Only CI, which holds no secrets, caches.
- Scheduled and issue-triggered workflows run from `main`; they start, and change, once merged there.
- `.u<group>` release names come from `src/lib/releaseInfo.ts` (PR #22); the promote gate needs them,
  so #22 lands before this automation.

## Deploy order

**Firestore rules before features:** the user document has a field allowlist. A release that writes a
new user field needs `firebase deploy --only firestore:rules` first, or those writes are refused.

## Strings (src/i18n; the app in Arabic)

The app is getting Arabic (Majd approved the groundwork Nov 15 2026; study
`~/Documents/revisely-ideas/approved/2026-11-15-growth-app-in-arabic-study.md`). UI text moves out of the
code into `src/i18n/en/<folder>.ts`, folder by folder, with the English unchanged and nothing visible.
- Use `t('folder.key', { values })` from `src/i18n` (i18next, typed keys). Whole sentences with
  `{{values}}`, plurals as `_one`/`_other` keys, never `n === 1 ? …` or text glued from pieces.
- **An extracted folder must stay extracted:** `src/i18n/__tests__/noRawStrings.test.ts` (its `EXTRACTED`
  list) fails on UI text written into its files. Put new text in its `en/` file, or mark a line that isn't
  UI text `// i18n-ignore (why)`. How-to and the progress command: `src/i18n/README.md`.
- Tests, scenarios and E2E builds always run in English (`src/i18n/language.ts`).
- **Arabic (part 2, Majd, Nov 21 2026):** `src/i18n/ar/` mirrors `en/` (a missing key shows in English; six plural
  forms; `__tests__/arabic.test.ts`). Words: `src/i18n/ar-glossary.md`; take a new term from Tarteel's Arabic or
  Quran.com's `locales/ar` before asking Majd (his Nov 18 rule). Numbers come out in Arabic-Indic digits
  (`src/i18n/digits.ts`).
- **The picker is Revisely Dev only** (Settings → Appearance → Language, `src/i18n/choice.ts`). It restarts the app
  into the language and its direction. The store app offers English alone (`SHIPPED`) until Arabic ships with the
  native release that declares it; that release's changes move the fingerprints, so they wait for the release owner.
- **New layouts use start and end**, never left and right (`marginStart`, `paddingEnd`, `start: 0`). No
  `textAlign: 'left'` on text that should follow the language. Arrows and chevrons come from `chevron()` or a flipped
  icon.
- **The mushaf in RTL** (LANG-2, Nov 21 2026): the pager keeps a printed mushaf's order in both directions
  (`lib/mushafDirection`: `inverted` left to right, the list's own order right to left, never pinned `direction: 'ltr'`
  on the list, which turned the page black because React Native's list measures from the right in RTL). Each page is
  left to right inside (`pageWrap`), so boxes drawn from the image's left edge stay on their words. A box placed from
  window coordinates (a held verse's menu) uses `fromLeftEdge` (`src/i18n/direction.ts`): React Native swaps left and
  right in RTL.

## UI traps

- **Never wrap a scroll view in a Pressable.** On the new architecture (iOS), a ScrollView doesn't
  scroll while any view above it holds the touch, and a Pressable (or a PanResponder) takes every
  touch that starts inside it. A modal sheet's dimmed backdrop is `<Backdrop>`
  (`src/components/Backdrop.tsx`), rendered as the sheet's sibling, before it. Layout tests can't
  see this; `touchHandlingAncestor()` (`jest/scrollable.ts`) can. The long-verse fix of PR #20
  bounded the height correctly and still didn't scroll on a phone for this reason.
- **One modal at a time on iOS** (BEHAVIOUR.md SHEET-1, Nov 9 2026). A modal asked to present while another
  is up, or still being dismissed, is refused, and React Native then keeps the refused one's host over the
  screen, invisible, taking every touch (the swipe between tabs still works: it is native). Home froze that way
  when "A new update is ready" opened by itself over the Today menu. So `v2/Sheet` takes a turn
  (`v2/modalTurn`): it waits while another sheet holds one and holds it until iOS reports it gone, with a 1 s
  fallback that replaces a modal whose dismissal never reports. A sheet inside another modal's content is
  presented by it and goes at once (`ModalNest`). `RevoSheetFrame` and `v2/ContextMenu` take turns the same
  way. A raw `<Modal>` that coexists with sheets calls `useModalHold(visible)` (and wraps its content in
  `ModalNest` if sheets open inside it). `useModalHold` doesn't wait: a raw modal that can open as a sheet closes
  (from a sheet's button) takes a turn instead (`useModalTurn`, `visible={turn}`, released on `onDismiss` or after
  `DISMISS_FALLBACK_MS`), as `reciteLive/CheckIntroPage` does: opened from the take summary's "See your mistakes"
  while the summary was still closing, it froze the reader (Majd's Dev take, Nov 15 2026). The scenario harness's Modal refuses as iOS does, and a tap on the
  screen under it then fails (`harness/modal.tsx`); a test that reports `onDismiss` itself lets the sheet's
  closing animation end first, as iOS would.
- Check sheets and menus at the largest Dynamic Type size (`xcrun simctl ui <udid> content_size
  accessibility-extra-extra-extra-large`) and on an SE-size simulator. Chrome text (headers, menu
  rows, credits) caps growth with `maxFontSizeMultiplier`; reading text doesn't.
- **Tabs are a pager** (`navigation/PagerTabs`, a navigator on React Navigation's `TabRouter`, so
  `navigate('Read')`, tab presses, pop-to-top and scroll-to-top work as with bottom tabs). The tab
  screens sit side by side and move 1:1 with the finger on the UI thread: the incoming tab is drawn
  beside the current one, rubber band at the ends, velocity snapping (one tab per swipe), and a swipe
  or a tab press takes over an animation in flight. The tab bar's icons cross-fade with the
  position. Tabs stay mounted once shown (and the neighbours of the focused one are mounted ahead),
  so nothing reloads or blanks; the old bottom-tabs swipe blanked the mushaf after a quick
  back-and-forth. Insights is swiped to only with Smart Tracking on (`swipeableCount`).
  - Only the tabs in the pager are laid out (`pagerRoutes`; `swipeableTabCount` in
    `navigation/tabPages`): with Smart Tracking off, Read is the last page and the rubber band past it
    shows the ground. Before (Oct 27), every tab sat in the row, so Insights peeked in. Turning it on
    or off updates the pages at once; Home and Read keep their keys and never remount.
  - Only on a tab's main screen: the gesture fails at touch-down while a pushed screen shows, so the
    reader's page turns, the back swipe, swipe to delete and the calendar keep their gestures.
    Vertical scrolling wins (the pan fails after 10pt vertically).
  - The main screens scroll with Gesture Handler's `ScrollView` / `FlatList`: over React Native's
    own, the pan never started and the row under the finger got a tap.
  - The gesture is made once and reads what changes from shared values; in Jest, Reanimated's mock
    makes a new shared value every render, so `PagerTabs.test` keeps them across renders.
  - **Nothing renders in React while the pager moves** (Majd, Nov 22 2026: the swipe was laggy on
    Android, smooth on iOS). Reanimated 4 skips its own frame updates from a React commit until Android
    has mounted it (`shouldReanimatedSkipCommit`), so a render mid-swipe froze the pager. A swipe now
    changes the tab once its spring has settled (`go` in the spring's callback). A tap on the tab still
    shown during the settle turns the pager back (`settleTabPress`). The landing page comes from the
    release's own translation, since a busy Android frame hands the last moves over with the release.
    While the pager moves, each page is drawn into a hardware texture on Android
    (`renderToHardwareTextureAndroid` through animated props, `moving`). Otherwise both tabs' content is
    drawn again every frame. `PagerTabs.settle.test` pins all of it, with springs the test finishes.
    Keep screens' focus work from rendering when nothing changed (Home's history: `sameHistory`).
  - The swipe accent: a 5pt dot under the current tab's icon stretches into a short pill between
    two tabs (front end ahead, back end behind; `wormFrame`) and gathers again as the tab lands,
    1:1 with `position` on the UI thread. A swipe that lands on another tab ticks (selection
    haptic); taps don't. Reduce Motion (`design/motion`'s `useReduceMotion`; Reanimated's jest mock
    has no `useReducedMotion`) gives a dot per tab that fades instead of travelling.
- **Pull to refresh over Home's glow:** iOS paints the pull area opaque, so the glow ended in a
  hard line under the header while pulling (and while a refresh hung). Home's `RefreshControl` has
  `backgroundColor: 'transparent'`; refreshes go through `hooks/usePullToRefresh`, which always ends
  the spinner (done, failed, or after 10 s).
- **Home's glow must never end in an edge** (users saw a "box" twice). It is one full-bleed layer
  (`v2/HeroGlow`) behind the top bar and the content, from under the status bar to 340pt in light,
  fading as (1 − t)^2.8 (`lightGlow` in `theme/v2`) so it ends flat, faint enough by the first grey
  text for 4.5:1 with every accent (design.test checks the whole band). Nothing above it is opaque,
  and nothing draws a line across it: the hairline that sat under Home's header was removed (Oct 28
  2026; the glow faded just above it and the tinted header read as a box, at rest and stretching
  while pulling). After touching Home's top, screenshot it in light (at rest and mid-pull, each
  accent) and run `python3 scripts/check-home-glow.py <png…>`: it fails on a step or a line inside
  the glow.
- **Drag and swipe rows** (`components/plan/ReorderableDayList`, the schedule's days) are
  react-native-gesture-handler and Reanimated, JS only. A row lifts after 350 ms with the finger
  still; moving 10pt first cancels the lift, so scrolling and swiping still work. While a row is
  lifted, the screen's ScrollView has `scrollEnabled` off and the list scrolls it near the edges.
  Maestro has no hold-and-drag: a slow `swipe` (about 190pt over 9 s) moves little enough in the
  first 350 ms to lift the row, then drags it.

## Known-good reference

Tag `testflight-10-ota-sep30` is the code that ran on TestFlight build 10 with the Sep 30 updates,
the last release made from a laptop. Build 11 (fingerprint `c5e09f6…`) is the first built by CI.
