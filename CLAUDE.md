# CLAUDE.md

Guidance for Claude Code in **Revisely**. `README.md` covers setup, tests and the branch table; this
file is the release mechanics and the traps behind them.

## Branches and releases

- Work on `develop` (or a branch off it). CI (`.github/workflows/ci.yml`) runs on every push and PR.
- **A push to `main` is a release.** Merge `develop` into `main` through a PR, only once CI is green.
  `EAS Update` (`.github/workflows/update.yml`) then publishes the JS to the `production` channel, and
  starts a TestFlight build first if native code changed.
- Never run `eas update` or `eas build` from a laptop to ship. Everything on a phone should trace to a
  commit on `main`.
- Pushes that touch only docs, tests, `functions/`, Firestore rules or `.md` files do not release
  (`paths-ignore` in `update.yml`). Firebase rules and functions still deploy by hand
  (`firebase deploy`, see README).

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
- There is no Maestro job. The flows run locally (`npm run test:e2e:ios`) against a dev client.

## TestFlight

- App Store Connect app id `6767990248`, team `CH8N5V9MA6`, bundle id `com.revisionbuddy.app`, Expo
  project `achilles1802/revision-buddy`.
- **TestFlight builds expire 90 days after upload.** If native code has not changed in a while, run
  `EAS Build` from the Actions tab before the installed build expires. The new build has the same
  fingerprint, so current updates reach it.
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
- The App Store binary listens to the same `production` channel as TestFlight, so **a merge to `main`
  reaches App Store users too**. Test on the simulator before merging.

`scripts/asc.js` drives App Store Connect (listing, screenshots, build, release type, submission).
Listing text is `store/listing.json`; screenshots are `store/screenshots/` (6.9" iPhone,
1320×2868, uploaded in file order). It needs a team API key with App Manager access:

```bash
export ASC_KEY_ID=Y9QXNBSWCN ASC_ISSUER_ID=98e03813-82b9-4a37-8c3b-962d9af24baa \
  ASC_KEY_PATH=~/secrets/AuthKey_Y9QXNBSWCN.p8
```

Key `AQ87A9LM2W` is the one EAS Submit created and holds; its .p8 cannot be downloaded again. Do not
revoke it, or CI submissions stop.

**JS-only change:** merge to `main` as usual. No review, no new App Store version; users get it on
their next launches. To undo, revert and merge, or republish the previous update from the EAS
dashboard. Apple permits this as long as the app does not change what it fundamentally is.

**Native change** (a library with native code, plugins, permissions, icon, splash, Expo SDK):
1. In the same PR, raise `version` in `app.config.js` (e.g. `1.0.0` -> `1.0.1`). Every App Store
   version needs a higher version string, and the build must carry it. Raise it only with native
   changes: the version is part of the fingerprint, so a bump alone starts a build.
2. Merge. CI builds and submits the next build to TestFlight. Add it to the Team (Expo) group by hand,
   test it.
3. `node scripts/asc.js version 1.0.1`, `whats-new "..."`, `build <n>`, re-seed the reviewer (below),
   `submit`.
4. Ship it promptly: once the native change is on `main`, every later update targets the new
   fingerprint, and App Store users on the old binary get nothing until they install the new version.
   A fix for the old binary has to be published by hand from the last commit before the native change.

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

**Third-party content:** Qur'an page images are renderings of the Madani Mushaf made with the King
Fahd Complex fonts (open-source quran.com-images). They are served from the Storage bucket at
`mushaf/001.png` ... `mushaf/604.png` (public, immutable; `src/lib/quranImages.ts`). If App Review
asks about rights to them, that is the answer; the Qur'an text itself is public domain.

## Known-good reference

Tag `testflight-10-ota-sep30` is the code that ran on TestFlight build 10 with the Sep 30 updates,
the last release made from a laptop. Build 11 (fingerprint `c5e09f6…`) is the first built by CI.
