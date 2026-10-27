# CLAUDE.md

Guidance for Claude Code in **Revisely**. `README.md` covers setup, tests and the branch table; this
file is the release mechanics and the traps behind them.

## Branches and releases

- Work on `develop` (or a branch off it). CI (`.github/workflows/ci.yml`) runs on every push and PR.
- **Nothing reaches App Store users without passing TestFlight first.**
  1. A push to `develop` (`Preview`, `.github/workflows/preview.yml`) publishes the JS to the `preview`
     channel, and builds and submits to TestFlight first if native code changed. Each update's message
     ends with `[app <hash>]`, a hash of every file that goes into the app (`.github/scripts/app-hash.sh`;
     docs, store, scripts, functions, tests, rules and workflows don't count).
  2. A tester's TestFlight install follows `preview`. The binary's channel is `production`; once the
     account has loaded, `src/lib/updateChannel.ts` switches to `preview` with
     `Updates.setUpdateRequestHeadersOverride` only if the install is from TestFlight (sandbox receipt,
     `modules/install-source`) **and** the account has `previewTester: true`. It then fetches the
     preview update, which runs from the next cold start. App Review also installs with a sandbox
     receipt, which is why the account matters: the reviewer is not a tester and stays on
     `production`. Mark or unmark a tester with
     `cd functions && GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-preview-tester.js <email> [--off]`
     (`--list` shows them; clients can't write the field). Binaries before 1.0.2 lack the module and
     stay on `production`, in TestFlight too.
  3. Try it in TestFlight, then merge `develop` into `main` (a PR, CI green). Changes made on `main`
     directly that go into the app block promotion until they come back through `develop`.
  4. `Promote to production` (`.github/workflows/promote.yml`) finds the preview update with main's
     app hash and republishes that same update to `production`, after you approve the run in the
     `production` environment (Actions > the run > Review deployments; only `main` may deploy there).
     No matching preview update: nothing is promoted and the run fails. It never builds.
- **Nothing publishes to `production` except promote.yml.** Not a laptop, not another workflow. A fix
  goes through `develop` and TestFlight like anything else. App Store submission stays manual.
- Native builds run on a GitHub macOS runner (`ios-build.yml`: `eas build --local`, then
  `eas submit --path`), which uses no EAS build credits; the repo is public, so runner minutes are free.
  Local builds are not listed by `eas build:list`, so a submitted build pushes a tag `ios-fp/<fingerprint>`,
  and `preview.yml` treats a fingerprint with that tag (or an EAS build, i.e. build 11 and earlier) as built.
- Never run `eas update` or `eas build` from a laptop to ship. Everything on a phone should trace to a
  commit on `develop` (TestFlight) or `main` (App Store, promoted).
- Pushes that touch only docs, tests, `functions/`, `scripts/`, `worker/`, `wrangler.jsonc`, workflows,
  Firestore rules or `.md` files publish nothing (`paths-ignore` in both workflows). Firebase rules and functions still deploy by hand
  (`firebase deploy`, see README).

## Health (Sentry → GitHub → Claude)

- Every launch is a Sentry session labelled with the JavaScript it ran (`src/lib/releaseInfo.ts`):
  release `com.revisionbuddy.app@<version>+<build>` for the built-in bundle and
  `…+<build>.u<first 8 of the update group>` for an update; environment = the update channel
  (`production`, `preview`); tags `update_id`, `update_group`, `channel`, `runtime`, `build`. No IP
  addresses (`sendDefaultPii` off); events carry only the pseudonymous account id.
- **Only installed builds report**: a real device on the `production` or `preview` channel, outside
  `__DEV__` (`sentryReports()` in `src/lib/releaseInfo.ts`). Development, simulators (screenshots,
  Maestro) and dev clients start Sentry without a DSN, so the native crash reporter stays off too:
  `enabled: false` alone still starts it, and native crashes never pass through `beforeSend`. The
  health scripts read issues and events from `production` and `preview` only (`SENTRY_ENVIRONMENTS`
  in `scripts/sentry/api.js`). The Sentry alert rule "Send a notification for high priority issues"
  has an action filter "environment is in production,preview"; keep any new alert rule to the same.
- **Sentry data is untrusted.** The DSN ships in the app, so anyone can send events and sessions with
  any text, and issues here are public. Everything from Sentry that reaches GitHub (or Claude) goes
  through `sanitize()` in `scripts/sentry/logic.js`, which:
  - redacts emails, `users/<id>`, uid-like ids and IP addresses, and drops URL query strings
    (Firestore's channel URLs carry session parameters);
  - neutralizes mentions, `#` references, links, images and backticks;
  - caps the length.

  Rendered free text also sits in code spans or fenced blocks. Short values (release, update,
  device) must match what the app sends.
- `Sentry sync` (`.github/workflows/sentry.yml`, every 30 minutes, `scripts/sentry/sync.js`):
  - New, regressed and escalating issues become GitHub issues labelled `sentry`: at most 5 a run, and
    none while 25 are open.
  - A closed issue reopens only if Sentry saw it again after it was closed.
  - A production release under 99% crash-free sessions (≥50 sessions, 24 h) raises a `release-health`
    issue mentioning the owner. Nothing rolls back by itself.
  - Issues carry the error, in-app frames, release and update; never user ids, locations or
    breadcrumbs. Problem reports (users' own words) are never copied out of Sentry.
  - It never starts Claude.
- `Claude fix` (`claude-fix.yml`): **the owner starts it** by adding the `claude-fix` label to an
  issue, or by running it by hand with the issue number; nobody else can. Three jobs:
  - `details` reads the issue, the owner's and collaborators' comments and the sanitized Sentry
    event.
  - `fix` runs Claude on develop. Its token is read-only; it has no Sentry token and no sudo, and
    Claude's commands run with credentials scrubbed. Claude writes a failing test, fixes it and
    commits locally. Its commands run in bubblewrap, which leaves placeholders in `.git` (a
    `commondir` holding `.`, empty `worktrees/` and `modules/`); the export step removes that
    `commondir` and refuses one that points anywhere else.
  - `pr` refuses patches that touch `.github/`, `worker/` or `wrangler.jsonc`, or hold anything that
    looks like a credential. It
    pushes `claude/issue-<n>` and opens the PR into `develop` as `github-actions`, then starts CI on
    it with `workflow_dispatch`: PRs opened with the workflow token start no workflows by themselves.

  It cannot merge, change workflows or publish. Review the PR like any other.
- `Health report` (`health-report.yml`, daily 13:00 UTC, `scripts/sentry/report.js`): a comment on
  the pinned "App health (daily report)" issue, mentioning the owner.
- `Promote to production` refuses an update with fewer than 5 preview sessions or under 99%
  crash-free (`scripts/sentry/gate.js`). A run by hand can change the bar or skip it. A bar that isn't
  a number fails the check; it never passes it.
- Secrets:
  - `SENTRY_API_TOKEN`: a Sentry internal integration token with read access to Issue & Event,
    Project and Organization. It is separate from `SENTRY_AUTH_TOKEN`, which only uploads source maps.
  - `ANTHROPIC_API_KEY`, from a dedicated Anthropic Console workspace with a monthly spend limit, so
    a leak is bounded and revocable. `CLAUDE_CODE_OAUTH_TOKEN` (the subscription) also works, but it
    can't be capped or scoped. **The current key expires on 2027-01-01.**
  - Both are repository secrets (GitHub → Settings → Secrets and variables → Actions); neither is
    ever printed. The daily report checks the Claude key (`scripts/sentry/claude-key.js`): if Anthropic
    rejects it, it opens (or comments on) an `automation` issue mentioning the owner and the run fails;
    from 30 days before `CLAUDE_KEY_EXPIRES` (in `health-report.yml`) it opens a reminder issue. A
    `claude-fix` run checks it first too (the `key` job) and says so on the issue instead of failing
    silently. A rejected `SENTRY_API_TOKEN` fails the report and sync runs, which GitHub emails.

**Rotating the Claude key** (before it expires, or at once if it leaked or was rejected):
1. Anthropic Console → the workspace used for this repository → API keys → Create key (name it after
   the repository, set an expiry), copy it.
2. GitHub → achilles1801/revisely → Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY`
   → Update secret, paste, save.
3. Set `CLAUDE_KEY_EXPIRES` in `.github/workflows/health-report.yml` to the new expiry (a PR to
   `develop`, then `main`: the workflow runs from `main`), and close any open "Claude key" issue.
4. Check: Actions → Health report → Run workflow; the "Check the Claude key" step says `ok`.
5. Revoke the old key in the Console.
  - No Claude GitHub App is needed.

  Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" lets
  `pr` open the PR. Without it the branch is pushed and the issue gets a link to open the PR by
  hand. `main` and `develop` are protected: PRs only, CI green.
- No caches in jobs that hold release secrets (`preview.yml`, `promote.yml`, `ios-build.yml`: no
  `cache: npm`, `eas-cache: false`). The fix job runs code Claude writes on these runners, and a cache
  entry written by one run can be restored by another. Only CI, which holds no secrets, caches.
- Scheduled and issue-triggered workflows run from `main`; they start, and change, once merged there.
- `.u<group>` release names come from `src/lib/releaseInfo.ts` (PR #22); the promote gate needs them,
  so #22 lands before this automation.

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

- "Secret scan" (`scripts/check-secrets.sh`): `git grep` over tracked files for high-signal secret
  patterns (private keys, Google/Anthropic/OpenAI/GitHub/Sentry/AWS/Slack/Stripe/Expo tokens, The
  Clear Quran keys, App Check debug-token assignments), printing paths and lines, never the match.
  `--self-test` checks every pattern still catches a sample. Coverage reports aren't committed
  (`coverage/` is ignored; CI uploads them as an artifact).

- The app typecheck excludes `functions/` and `tests/firestore-rules/`. Each has its own
  dependencies and its own job.
- The rules tests need Java 21 (firebase-tools). When `firestore.rules` changes, update the tests in
  `tests/firestore-rules/` in the same change. They had drifted before.
- The release workflows use Node 22, which current eas-cli requires. CI jobs use Node 20.
- The runner build pins Xcode (`xcode-select` in `ios-build.yml`, image `macos-26`). Apple requires
  a current SDK for uploads; move the pin when the image or Apple's minimum changes.
- Secret EAS variables are unreadable on the runner: the plist comes from `GOOGLE_SERVICE_INFO_PLIST`,
  and Sentry source maps upload only if a `SENTRY_AUTH_TOKEN` repository secret exists.
- There is no Maestro job. The flows run locally (`npm run test:e2e:ios`) against a dev client.

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
1320×2868, uploaded in file order). It needs a team API key with App Manager access:

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
- The 1.0.2 set (Oct 27 2026), light, Indigo, 1320×2868 (the 6.9" set; no iPad, `supportsTablet`
  is false): Home, the reader holding Al-Hamd with Saheeh International (not The Clear Quran, whose
  licence covers the app), a revision session, the Activity month, a day with recordings, Insights.
  `store/screenshots/dark/` holds the same in dark; `asc.js screenshots` uploads only the top-level
  PNGs, so move a dark one up to use it.
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

**Verse positions and translations:** press-and-hold on a verse uses `src/data/ayahBounds.json`, built
by `scripts/build-ayah-bounds.py` from Quran Android's `ayahinfo_1024.db`, the glyph bounds that
quran.com-images records while drawing the same page images (coordinates are 1024-wide; the images are
2600×4206, so one scale factor maps them). The app's images are a mirror (GovarJabbar/Quran-PNG)
that draws the decorated opening pages higher: pages 1 and 2 are shifted up by 61 and 57 units
(`PAGE_Y_SHIFT` in the script; every other page matches). Check a page by drawing its rectangles
on the image before trusting new bounds. Translations: Saheeh International from api.alquran.cloud,
and The Clear Quran® (Dr. Mustafa Khattab) through our worker (below). Both are in the privacy policy.

**The Clear Quran® (licensed):** the publisher (Al-Furqaan Foundation, info@theclearquran.org)
requires the credit "The Clear Quran® by Dr. Mustafa Khattab" + theclearquran.org wherever it is
shown (pinned under the verse; in the picker), the text exactly as the API gives it (footnote markers
`<footnote id number>` are shown as raised numbers, nothing else is changed), and never another
translation under its name (errors show "Couldn't load translation" + retry). Plan: Basic, 10,000
requests a month, 5 a second; the docs also say 60 a minute and 1,000 an hour. The terms live in the
developer agreement signed in their portal (theclearquran.org/developers).

**Keeping its text (long-lived caches):** neither the terms nor the public docs address caching or
storing the text. On 2026-10-27 the owner decided to cache it for a long time and accepted that risk.
If Furqaan objects, dial back as below. Text is cached only as read (plus the next-block prefetch),
never the whole Qur'an in advance, and always exactly as the API gave it, credit unchanged.
- **Worker:** a block is fresh for `TCQ_EDGE_CACHE_SECONDS` (30 days), then served for
  `TCQ_EDGE_STALE_SECONDS` more (30 days) while a background request refreshes it (one per isolate,
  counted in the budgets). Cloudflare's Cache API keeps it per data centre and may evict it sooner.
- **Phone:** `src/lib/clearQuran.ts` keeps each block in `Library/Caches/tcq/` (the app's private
  cache folder: not backed up, not visible in Files, never shared; iOS may clear it). It is shown at
  once while fresh (`TCQ_DEVICE_CACHE_SECONDS`, 30 days), then still shown, even offline, while it
  is fetched again for `TCQ_DEVICE_STALE_SECONDS` more (30 days). The app asks the worker for these
  (`GET /api/tcq/policy`, public) once a launch and every 6 hours; until it has an answer it uses
  `CLEAR_QURAN_DEVICE_CACHE` (the same 30 + 30 days).
- **To dial back:** change those vars in `wrangler.jsonc` (a PR into `main`; Workers Builds deploys
  it) and they apply at once to everything already cached. 0 turns caching off, and phones delete
  their copies at their next launch. In an emergency, change the vars in the dashboard (Workers &
  Pages → revisely → Settings → Variables), then make the same change in `wrangler.jsonc`, or the
  next deploy from `main` restores the old values.
- **To delete every copy:** change `TCQ_CACHE_VERSION`. It is part of every edge cache key, and phones
  delete theirs when they see the new version. `CLEAR_QURAN_DEVICE_CACHE.version` in the app does the
  same for phones, once that update reaches them.

**Its speed:** The Clear Quran answers a request in 1.6–5.3 s (Supabase edge functions in us-east-2;
measured Oct 27 2026, ~95% of a verse's load time), so the text comes in blocks: the worker asks
for 30 verses at once (the documented maximum), aligned 1–30, 31–60, … per surah, and the app
keeps the block (in memory, and on the phone as above). A press and hold starts loading (before
Translation is tapped), and the sheet fetches the next or previous block when the verse shown is two
from its edge
(`prefetchClearQuranAround`), so ‹ › are instant and a block costs one request of the plan. A verse
already in memory is shown in the first frame (`peekVerseText`), with no spinner.

**Recitation and Audio Options** (`components/reader/PlayerCapsule`, `verse/AudioOptionsSheet`,
`reader/SpeedMenu`, `lib/recitation.ts`, `lib/playbackPlan.ts`, `lib/audioOptions.ts`):
- While a verse plays, the bar is ■, the speed chip (a menu of 2× … 0.25×), ⏪ ⏸ ⏩ and the
  options icon; idle, it is ▶ (the page), the reciter and the options icon. The verse playing is
  highlighted on the page (no verse label in the bar) and the page turns with it.
- Audio Options: reciter, speed, From and To (two wheels each; To is never before From), Play up to
  (Page, Surah, Juz', Custom: where To lands), Repeat (Loop, 1–10×) and Pause after each verse (Off,
  0.5–2× the verse's length at the current speed). There is deliberately no "Play set of verses".
  ▶ in its header plays From–To. ⏪ ⏩ stay inside the range, and the range inside the screen's pages.
- Speed, repeat, pause and Play up to are kept per account on the phone
  (`@revisely_audio_options:<uid>`), not synced: a synced field needs the user-doc allowlist and a
  rules deploy first. The reciter stays on the user doc. A Custom To lasts until the app restarts.
- The rules are pure functions in `playbackPlan.ts`, tested there and in `recitation.test.ts` with
  fake timers. A repeat replays the verse with `replace` (it may fetch it again). The pause waits
  `duration / speed × factor`; Pause during it holds the next step, and leaving the app pauses as
  before. Speed is `setPlaybackRate(speed, 'high')` with `shouldCorrectPitch`.
- **No background or lock-screen playback**: recitation pauses when the app leaves the foreground.
  Adding it needs `UIBackgroundModes: audio` and lock-screen controls, a native change for a build.
- `v2/WheelPicker`'s `contentOffset` is where it starts, set once. Changing it after mount moved
  the wheel a second row on a phone (a test covers it). Maestro can't tap a wheel's rows by id (the
  wheel is one adjustable element for VoiceOver): tap by point. Maestro takes whole-number
  percentages only; `"26.5%"` throws an exception that a grep for `FAILED` misses.

**Recording backup** (`src/lib/recordingBackup.ts`, `recordingCloud.ts`, `recordingBackupController.ts`):
recordings upload to Storage `recordings/<uid>/<id>-<n>.m4a`, with a record per recording in Firestore
`users/<uid>/recordings/<id>`. It's on unless `recordingBackup === false`, Wi-Fi only unless
`recordingBackupCellular`, and a one-time notice comes before the first upload.

These invariants must not be broken:
- **Local audio** is only ever deleted by the user deleting it on that phone.
- **Tombstones** (`{deletedAt}`) are permanent:
  - The rules refuse writing a live record over one, and refuse deleting one (only `deleteUserAccount` removes them).
  - A phone whose put meets a tombstone keeps its copy local-only (`backupDeleted`) and removes the files it uploaded.
- **Live records** can be written only while the account's backup is on (the rules read the user doc).
- **Storage objects are create-only** (`resource == null`): a name is one file, ever.
- **Copies from another phone** (`restored`) are never continued here. They are uploaded only when `adopted`: the backup lost them without a tombstone and every part is on the phone.

How it works:
- **Deleting a recording** queues it in `Documents/recordings-sync/<uid>-deletes.json` and works offline. The run then:
  1. Tombstones every queued recording, even one with no record yet.
  2. Lists the files once and deletes every file named after those recordings.

  Deletions run even with backup off, and are flushed on sign-out. "Delete all" first lists the backup (it refuses offline) so that recordings this phone hasn't seen go too.
- **"Turn off and delete backups"** needs the connection:
  1. Save "off" first.
  2. List the backup and merge it into the phone.
  3. Download everything that is only in the backup. A part that is already gone (404) is dropped; any other failure refuses.
  4. Delete exactly the files and live records that were listed. Tombstones stay.

  It refuses while an earlier wipe is pending, or if a record can't be read.
- **Uploads:**
  - The resumable protocol in 4 MB chunks on the foreground session (REST plus `createUploadTask`).
  - The session is saved in the index, so an upload carries on after the app closes.
  - The network is checked before every chunk.
  - The chunk in flight is cancelled on leaving Wi-Fi, sign-out or account deletion.
- **Listing:** the backup is listed on an account's first run, then at most every 15 minutes.
- **Account deletion:** `deleteUserAccount` deletes the Storage prefix first.
- **Known limits:**
  - NetInfo reports an iPhone hotspot as Wi-Fi.
  - File uploads aren't gated on the server. A phone that hasn't yet heard that backup is off, or that is still signed in to an account deleted elsewhere (its ID token lasts up to an hour), can leave files without a record. A Storage rule using `firestore.get` would close this. It needs the IAM role `roles/firebaserules.firestoreServiceAgent` for the Storage service agent (`firebase deploy --only storage` prompts to grant it), so it isn't in place yet.
  - Two phones restored from one iCloud backup both own its open recording. Their name clash is reported and the file skipped, never overwritten.
  - Tombstones accumulate, adding listing reads.
- **Deploy order:** `firestore.rules` and `storage.rules` must be live before this reaches `develop`, which publishes to `preview` at once (`firebase deploy --only firestore:rules,storage`). Keep the profile-image rules that were live before.
- **Release:** the client is JS-only but reaches App Store users only with 1.0.2 (develop's runtime is build 19's). The App Privacy answers (Audio Data: collected, linked, App Functionality) must be updated before 1.0.2 goes to review.
- **Emulator check of the real requests:**
  `firebase emulators:exec --only storage --project demo-revisely 'npx jest recordingCloud.emulator'`.

**Firestore rules before features:** the user document has a field allowlist. A release that writes a
new user field needs `firebase deploy --only firestore:rules` first, or those writes are refused.

**Third-party content:** Qur'an page images are renderings of the Madani Mushaf made with the King
Fahd Complex fonts (open-source quran.com-images). They are served from the Storage bucket at
`mushaf/001.png` ... `mushaf/604.png` (public, immutable; `src/lib/quranImages.ts`). If App Review
asks about rights to them, that is the answer; the Qur'an text itself is public domain.

## Worker (revisely.app/api)

`wrangler.jsonc` + `worker/`: the Cloudflare Worker that serves `docs/` at revisely.app also runs
`/api/*` (nothing else reaches the code). `GET /api/tcq/windows/<surah>:<verse>` answers the block
holding that verse (`{ surah, from, to, verses: [{ verse_key, text }] }`, up to 30 verses, aligned
1–30, 31–60, …; `windowOf()`), and `GET /api/tcq/verses/<surah>:<verse>` one verse from it (builds
from before blocks). Each:
- needs a Firebase ID token (`Authorization: Bearer`), verified in the worker against Google's keys
  (`worker/auth.ts`; project `FIREBASE_PROJECT_ID`); every malformed token is a 401.
- 30 requests a minute per user (`ratelimits`), and daily budgets for what reaches The Clear Quran
  (`worker/budget.ts`, one Durable Object): `TCQ_DAILY_LIMIT_LIVE` for everyone on the live key, App
  Store, TestFlight and dev together (300 × 30 days stays under the 10,000-a-month plan),
  `TCQ_DAILY_LIMIT_SANDBOX`, `TCQ_USER_DAILY_LIMIT` per account; spent: 429 `DAILY_LIMIT` until midnight UTC. Anyone can make an account, so these are what
  keep one user from spending the month for everyone. Raise them with the plan.
- calls The Clear Quran API (`https://api.theclearquran.org/verses?surah=&from_verse=&to_verse=&limit=`,
  one request per block; `/verses/<key>` for single verses if the range query is refused, then for
  10 minutes; `Authorization: Bearer
  <key>`) with `TCQ_API_KEY_LIVE` when the app sends `X-Revisely-Channel: production` or `preview`
  (the App Store app, TestFlight). Development builds use `TCQ_API_KEY_SANDBOX` only if
  `TCQ_API_BASE_SANDBOX` names a sandbox host; it is empty, so they use the live key too
  (`tcqEnvironment()` in `worker/tcq.ts`).
- **Sandbox keys don't work with the documented API.** The Clear Quran's docs
  (theclearquran.org/developers/docs) give one base URL, `https://api.theclearquran.org`, and it
  refuses `tcq_eng_sbx_` keys: 403 "This is a sandbox API key; it cannot be used against the
  production API" (Oct 27 2026). No sandbox host is documented or resolvable, and the API answers 401
  on every path without a key, so it can't be found by probing. If they publish one, set
  `TCQ_API_BASE_SANDBOX` to it (a PR into `main`) and dev builds move to the sandbox key.
- keeps a block in the data centre's cache: fresh for `TCQ_EDGE_CACHE_SECONDS`, then served stale
  for `TCQ_EDGE_STALE_SECONDS` while refreshed in the background (`X-Cache: HIT`, `STALE`, `MISS`).
  Keys include `TCQ_CACHE_VERSION` (see "Keeping its text" above). It answers the app with
  `Cache-Control: no-store`; logs never include a key (`redactKeys`).
- `GET /api/tcq/policy` (no sign-in) gives the app its device cache times and the cache version.
- says where the time went in `Server-Timing`: `auth`, `cache`, `budget`, `tcq-window` or
  `tcq-verse` (the request to The Clear Quran) and `tcq-server` (their own `X-Response-Time`).
  `wrangler tail` also logs each request to them with its time.
- maps their 429 to 429 (Retry-After), 404 to 404, anything else to 502; no key configured is 503;
  anything unexpected is a JSON 500 (`worker/index.ts`).
- `observability` is off: no stored request logs (they would say who read which verse). Watch live with
  `npx wrangler@4.153.0 tail revisely`.

**Deploying:** Cloudflare Workers Builds deploys `main` on every push (and runs `wrangler preview` for
other branches, which is why `wrangler.jsonc` has a `previews` block: previews get no keys and answer
503). So worker changes reach revisely.app through a PR into `main`: they are outside the app hash, so
they don't hold up promotion, and the same files come back through develop unchanged. Never deploy the
worker from a laptop except to recover. Secrets: `npx wrangler@4.153.0 login`, then `npx
wrangler@4.153.0 secret put TCQ_API_KEY_LIVE` (and `…_SANDBOX`) from the repo root; they persist across
deploys and never go in files. Workers Builds' non-production branch builds should stay off
(Workers & Pages → revisely → Settings → Build → Branch control). With them on, every push to another
branch uploads a newer version that isn't deployed, and both the dashboard's Variables and Secrets
and `wrangler secret put` act on the newest version, so they refuse ("latest version … is not
deployed"; Oct 27, while develop still lacked the worker, the dashboard said the Worker "only has
static assets"). If they refuse anyway, redeploy main (merge to it, or Retry the last main build)
and add the secret before anything else is pushed. The worker is its own TypeScript project (`npx tsc --noEmit -p worker`,
in CI) and its tests run with the app's (`worker/__tests__`). Changes to it publish no app update, and
`claude-fix` refuses patches that touch it.

### The Clear Quran API keys (secrets, and rotating them)

Two keys, issued in The Clear Quran developer portal (theclearquran.org/developers → API Keys), live
only as secrets of the Cloudflare Worker `revisely` (dashboard: Workers & Pages → revisely →
Settings → Variables and Secrets): `TCQ_API_KEY_LIVE` (prefix `tcq_eng_liv_`, used by the App Store
app, TestFlight and, for now, dev builds) and `TCQ_API_KEY_SANDBOX` (prefix `tcq_eng_sbx_`, unused
until a sandbox host exists; see above). Never in the repo, `.env`,
CI, PR text, Sentry or chat; Worker Previews get neither.

To rotate one (or after a leak: revoke the old key in the portal first):
1. In the portal, create a new key: product English, the same environment (Production or Sandbox).
2. From the repo root, after `npx wrangler@4.153.0 login` if `npx wrangler@4.153.0 whoami` says so:
   ```bash
   npx wrangler@4.153.0 secret put TCQ_API_KEY_LIVE
   ```
   (or `TCQ_API_KEY_SANDBOX`), and paste the key at the hidden prompt; typed there, it never reaches
   shell history. It takes effect at once: Wrangler deploys the current code with the new secret.
3. Check: `npx wrangler@4.153.0 secret list` lists the names (never values); run
   `npx wrangler@4.153.0 tail revisely` while opening a verse in The Clear Quran on a build of that
   channel (App Store or TestFlight for live) and look for no `answered 401/403` lines.
4. Revoke the old key in the portal.

## The design

The app has one design, Threads-style (the plan was the doc "Revisely: Threads-style UI Migration",
Claude Docs). It shipped screen by screen behind a tester switch; on 2026-10-27 the owner made it the
app, and the classic design (glass, gradients, the LiquidGlass tab bar, the Mihrab palette) and the
switch were removed. The theme is decided once per phone (`resolveThemeMode`): a Light/Dark
chosen in either design is kept, a phone that had run the app without choosing stays dark (the
classic default), and a fresh install starts in light.
- Tokens are `src/theme/v2.ts` (`paletteV2(isDark, accent)`, `typeV2`, `layoutV2`, `radiusV2`,
  `markV2`). `useTheme()` gives `palette` and, for older code, `theme`: the same colours under the
  older names (`textPrimary`, `accent`, `glass`, …; `v2ThemeColors`). The reader's page colours are
  `theme/readPalette` (`getReadPalette(isDark)`). **Colours live only in `src/theme`:** a hex,
  `rgb()`/`rgba()`/`hsl()` in a string, or an alpha glued on (`+ '22'`), anywhere else in `src/`
  fails `src/design/__tests__/noRawColours.test.ts` (Google's "G" is the one exemption, listed
  there with the reason). A colour built some other way (a template from numbers) isn't caught.
- The look: white / black grounds, flat. Content is a feed of rows on 0.5pt separators with a
  16pt gutter; each row has an avatar-size mark (40 top-level, 36 reply, 28 nested; `v2/Mark`),
  a name (15/600), metadata (13) and a ⋯ menu, and rows of one thread are joined by a 2pt line
  (`v2/ThreadRow`, ported from the Layl app's ThreadCard). No cards, no glass, no gradient but
  Home's glow and the accent's progress fill: the primary button is a solid pill
  (`v2/PillButton`). Every menu is `v2/ActionSheet` (handle, 18/600 title, icon rows, red
  destructive rows, a Cancel bar); its action runs after the sheet has gone. The tab bar
  (`navigation/TabBar`) is flat and icon-only; `ActionBar` takes its place for a screen's own
  actions. No Threads/Meta names, logos or icons, no likes or reposts.
- Shared pieces live in `src/components/v2/`; Home's feed in `src/components/home/feed/`. Every sheet
  is `v2/Sheet` (handle, centred title, optional Cancel/Save, optional foot bar; the backdrop is its
  sibling) and every menu `v2/ActionSheet`; segmented controls are `v2/PillTabs`. Sheets with their
  own frame (gorhom `PlanSheet`) take the same colours and corners.
- The owner's rules from testing (Oct 26 2026):
  - **Minimal.** Home is one Today post (pages, juz, surahs, the action, a "Memorized …" line); no
    second card restating it. Lists show the **last 3** things (`RecentSection`) with "See all"
    to `ActivityAll` (search, kind and date filters); none → one quiet line, no list, no
    "Earlier".
  - Activity is a calendar (`activity/ActivityCalendar`): **a month by default**, ‹ › to step,
    and **Week as the finest view** (seven rows, each day's facts), kept per device. Day shades
    are `lib/activityHeatmap` levels in `palette.heat` (≥ 2:1 on the ground) with
    `palette.heatInk` numbers (≥ 4.5:1); the picked day is one line under the month. Things done
    are `lib/activityItems`.
  - **No floating timer.** The timer is in the reader's and the session's controls; a running one
    shows in Home's top bar (`RunningTimerChip`).
  - **No help.** No "?" or ⓘ buttons, guide sheets or first-run guides; a label or a subtitle says
    what a control does (e.g. Keep daily amount).
- **Accents** (Settings → Appearance → Accent): **Indigo (the default)**, Crimson and Jade. The
  choice is the user doc's `accent` field (rules allow `indigo|crimson|jade`), so it follows the
  account. `DesignGate` applies it once the user loads, and Indigo applies when it's unset; the
  device keeps a copy for the first frame. Crimson and Indigo put the accent on the primary action,
  links, the active tab, "done", the calendar and a glow behind Home's top (`v2/HeroGlow`); Jade
  keeps ink buttons and grey links, with jade for "done" and a jade glow in light. An accent is a
  token set in `theme/v2` (`ACCENT_TOKENS`: `primary`, `done`/`doneText`, `accentText`, `link`,
  `accentSubtle`, `hero`, `progress`, `heat`/`heatInk`); never write an accent colour in a
  component. Status colours don't follow it: weak is `red`, strong is `good` (green); a warning
  that is advice (a long cycle) is ink, not red. Every combination is checked in
  `src/design/__tests__` (text 4.5:1, including ink and grey on `accentSubtle`; fills 3:1).
- Taps don't buzz (`PressableScale` shrinks, `v2/Tap` dims); outcomes use `design/haptics`
  (`useHaptics()`), which Settings → Haptics turns off.
- Fonts: SF Pro for Latin, Amiri for all Arabic. In a line that mixes them, put the Latin first
  and the Arabic last in a first-strong isolate (`⁨…⁩`): a line that starts with Arabic
  is laid out right to left (Insights' juz rows did).
- `theme.onAccent` is the text colour on an `accent` fill. Use it instead of `'#fff'`.
- Following the system appearance needs `userInterfaceStyle: "automatic"` in app.config (now "light"):
  a native change for a versioned release. Until then Settings offers Light and Dark only
  (`systemAppearanceAvailable()`; `resolveThemeMode` in `context/ThemeContext`).
- `expo-blur` and `expo-glass-effect` are no longer imported. Removing them from `package.json`
  changes the fingerprint, so do it with the next native change, along with the tests'
  `jest.mock('expo-glass-effect')` / `jest.mock('expo-blur')` calls.

## UI traps

- **Never wrap a scroll view in a Pressable.** On the new architecture (iOS), a ScrollView doesn't
  scroll while any view above it holds the touch, and a Pressable (or a PanResponder) takes every
  touch that starts inside it. A modal sheet's dimmed backdrop is `<Backdrop>`
  (`src/components/Backdrop.tsx`), rendered as the sheet's sibling, before it. Layout tests can't
  see this; `touchHandlingAncestor()` (`jest/scrollable.ts`) can. The long-verse fix of PR #20
  bounded the height correctly and still didn't scroll on a phone for this reason.
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
  - Only on a tab's main screen: the gesture fails at touch-down while a pushed screen shows, so the
    reader's page turns, the back swipe, swipe to delete and the calendar keep their gestures.
    Vertical scrolling wins (the pan fails after 10pt vertically).
  - The main screens scroll with Gesture Handler's `ScrollView` / `FlatList`: over React Native's
    own, the pan never started and the row under the finger got a tap.
  - The gesture is made once and reads what changes from shared values; in Jest, Reanimated's mock
    makes a new shared value every render, so `PagerTabs.test` keeps them across renders.
- **Pull to refresh over Home's glow:** iOS paints the pull area opaque, so the glow ended in a
  hard line under the header while pulling (and while a refresh hung). Home's `RefreshControl` has
  `backgroundColor: 'transparent'`; refreshes go through `hooks/usePullToRefresh`, which always ends
  the spinner (done, failed, or after 10 s).
- **Drag and swipe rows** (`components/plan/ReorderableDayList`, the schedule's days) are
  react-native-gesture-handler and Reanimated, JS only. A row lifts after 350 ms with the finger
  still; moving 10pt first cancels the lift, so scrolling and swiping still work. While a row is
  lifted, the screen's ScrollView has `scrollEnabled` off and the list scrolls it near the edges.
  Maestro has no hold-and-drag: a slow `swipe` (about 190pt over 9 s) moves little enough in the
  first 350 ms to lift the row, then drags it.

## Known-good reference

Tag `testflight-10-ota-sep30` is the code that ran on TestFlight build 10 with the Sep 30 updates,
the last release made from a laptop. Build 11 (fingerprint `c5e09f6…`) is the first built by CI.
