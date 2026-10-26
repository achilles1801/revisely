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
- Pushes that touch only docs, tests, `functions/`, `scripts/`, workflows, Firestore rules or `.md`
  files publish nothing (`paths-ignore` in both workflows). Firebase rules and functions still deploy by hand
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
  - redacts emails, `users/<id>`, uid-like ids and IP addresses;
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
    commits locally.
  - `pr` refuses patches that touch `.github/` or hold anything that looks like a credential. It
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
    can't be capped or scoped.
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
- The repository is **public**. Check a diff for keys before pushing.

## CI

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
- A failed submission does not need a rebuild:
  `eas submit -p ios --id <build id>`. `eas submit:list --platform ios --json` shows the error.
- Apple refuses uploads while an agreement is unaccepted ("A required agreement is missing or has
  expired"); retries can then fail with no message at all. Check App Store Connect > Business: the
  Free Apps Agreement must be Active. The Paid Apps Agreement does not block a free app.
- Auto-submit cannot add builds to the `Team (Expo)` TestFlight group (Apple 403); add a new build to
  the group by hand in App Store Connect.

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
2. Merge to `develop`. CI builds and submits the next build to TestFlight. Add it to the Team (Expo)
   group by hand, test it.
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

**Screenshots** come from the `screenshots@revisely.app` account (password in
`~/secrets/revisely-screenshots.txt`), seeded with `functions/scripts/seed-screenshots.js`, on an
iPhone 17 Pro Max simulator: the dev client, with Metro started with `--no-dev --minify` (no debug
overlays; use another port if 8081 is taken) and `xcrun simctl status_bar booted override --time
9:41 ...`. Reopen the app from the home screen to clear the back-link in the status bar.

**Public pages** (`docs/`, served at revisely.app by Cloudflare on push to `main`): the privacy
policy and terms give email (`privacy@revisely.app`) as the only contact. Do not add a postal
address. `docs/privacy/index.html` and `docs/terms/index.html` are edited by hand alongside the `.md`
files; change both. When the app gains or loses something that collects data, update the policy and
the App Privacy answers in App Store Connect (no API; done by hand) together.

**Verse positions and translations:** press-and-hold on a verse uses `src/data/ayahBounds.json`, built
by `scripts/build-ayah-bounds.py` from Quran Android's `ayahinfo_1024.db`, the glyph bounds that
quran.com-images records while drawing the same page images (coordinates are 1024-wide; the images are
2600×4206, so one scale factor maps them). Translations are Saheeh International from api.alquran.cloud,
disclosed in the privacy policy.

**Firestore rules before features:** the user document has a field allowlist. A release that writes a
new user field needs `firebase deploy --only firestore:rules` first, or those writes are refused.

**Third-party content:** Qur'an page images are renderings of the Madani Mushaf made with the King
Fahd Complex fonts (open-source quran.com-images). They are served from the Storage bucket at
`mushaf/001.png` ... `mushaf/604.png` (public, immutable; `src/lib/quranImages.ts`). If App Review
asks about rights to them, that is the answer; the Qur'an text itself is public domain.

## The redesign (new design, preview)

The plan is the doc "Revisely: Threads-style UI Migration" (Claude Docs). It replaced an earlier
direction (paper/ink palette, Newsreader, glass on chrome), which was removed in PR #33. It ships
screen by screen behind Settings → Preview → **New design (preview)**: testers only
(`lib/testerTools`: dev builds, `previewTester` accounts on TestFlight; never the App Store or App
Review), kept per device, switching the whole app live.
- It is not a fork: `useDesign().isNew` (`src/design/DesignContext.tsx`) picks variants inside the
  same screens and components. Tokens are `src/theme/v2.ts`; `ThemeContext` maps them onto the
  classic token names (so unmoved screens take the new colours at once) and exposes `palette` for
  moved ones. When a screen is moved, give it an `isNew` branch (or variant components) and leave the
  classic path working until the switch is removed.
- The look: white / black grounds, flat. Content is a feed of rows on 0.5pt separators with a
  16pt gutter; each row has an avatar-size mark (40 top-level, 36 reply, 28 nested; `v2/Mark`),
  a name (15/600), metadata (13) and a ⋯ menu, and rows of one thread are joined by a 2pt line
  (`v2/ThreadRow`, ported from the Layl app's ThreadCard). No cards, no glass, no gradient, no
  accent tint: the primary button is a solid black pill (white in dark, `v2/PillButton`); jade
  only means "done". Every menu is `v2/ActionSheet` (ThreadMenu style: handle, 18/600 title, icon
  rows, red destructive rows, a Cancel bar); its action runs after the sheet has gone. The tab bar
  is flat and icon-only. No Threads/Meta names, logos or icons, no likes or reposts.
- Shared pieces live in `src/components/v2/`; Home's feed in `src/components/home/feed/`.
- Taps don't buzz in the new design (`PressableScale`, `v2/Tap` dims instead); outcomes use
  `design/haptics` (`useHaptics()`), which Settings → Haptics turns off.
- Fonts: SF Pro for Latin, Amiri for all Arabic. Text colours are checked at ≥ 4.5:1 in
  `src/design/__tests__`.
- `theme.onAccent` is the text colour on an accent fill (white in classic; the ground in the new
  design, where the accent is the ink). Use it instead of `'#fff'` on `theme.accent`.
- Following the system appearance needs `userInterfaceStyle: "automatic"` in app.config (now "light"):
  a native change for a versioned release. Until then "System" isn't offered and falls back to the
  classic Light/Dark choice (`systemAppearanceAvailable()`); the new design offers Light and Dark.

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

## Known-good reference

Tag `testflight-10-ota-sep30` is the code that ran on TestFlight build 10 with the Sep 30 updates,
the last release made from a laptop. Build 11 (fingerprint `c5e09f6…`) is the first built by CI.
