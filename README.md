# Revisely

A Qur'an revision app for people who have memorized it. Revisely plans each day's revision by pages, juz or a
custom schedule. It tracks what was revised, keeps a streak, and shows which parts are getting weak. It's on the App
Store, and Android is in Play testing.

## What's here

| Path | What it is |
| --- | --- |
| `src/`, `App.tsx` | The app: Expo SDK 54, React Native 0.81 (new architecture), React 19, TypeScript (strict) |
| `functions/` | Cloud Functions for Firebase (Revo, account deletion, config, admin tasks): their own `package.json` |
| `worker/`, `wrangler*.jsonc` | The Cloudflare Worker that serves revisely.app (`docs/`) and its `/api` |
| `docs/` | The website, revisely.app |
| `admin/` | The Revisely Console (Firebase Hosting) |
| `firestore.rules`, `storage.rules` | Security rules, tested in `tests/firestore-rules/` |
| `tests/scenarios/` | Scenario and property tests against the Firebase emulators |
| `.maestro/` | End-to-end flows on the iOS Simulator and the Android emulator |
| `targets/widget/`, `modules/` | The iOS widgets (SwiftUI) and the app's own native modules |
| `scripts/` | Release, store, CI and maintenance scripts, and the lint tools (`scripts/lint`) |

The recitation checker and the mistake-detection lab live in a private repository.

## Setup

You need Node 20 and a development build: Expo Go can't run the app (native Firebase and the new architecture).

```bash
npm ci --legacy-peer-deps
cp .env.example .env            # then fill in the Firebase and Google values
npx expo run:ios                # builds and installs the development build
npx expo start --dev-client     # afterwards, the JavaScript server alone
```

iOS builds also need `GoogleService-Info.plist` at the repository root.

## Checks

| What | Command |
| --- | --- |
| Types (app and worker) | `npx tsc --noEmit && npx tsc --noEmit -p worker` |
| Lint | `npm ci --prefix scripts/lint && npx --prefix scripts/lint eslint -c scripts/lint/eslint.config.mjs .` |
| Format (folders done so far) | `npx --prefix scripts/lint prettier --config scripts/lint/prettier.config.mjs --check $(grep -v '^#' scripts/lint/formatted.txt)` |
| Unit and component tests | `npm test` |
| Cloud Functions | `npm run test:functions` |
| Firestore rules (Java 21) | `npm run test:rules` |
| Scenarios (Java 21) | `npm ci --prefix tests/scenarios && npm test --prefix tests/scenarios` |
| End to end | `.maestro/README.md` |

CI (`.github/workflows/ci.yml`) runs all of these on every pull request. The one check required to merge is
`Required`. `TESTING.md` explains the layers, what each proves, and how to add a test. `BEHAVIOUR.md` lists every
rule the app keeps for its users; the scenario tests check them by id.

## Branches and releases

- **`develop`** is where work lands, through pull requests. Each push publishes the JavaScript to the `preview`
  channel that testers' TestFlight and Play builds follow. It builds a new binary first when native code changed.
- **`main`** is production. A release is a pull request from `develop` into `main`. `Promote to production` then
  republishes the update testers already ran, after the owner approves the run. Nothing else publishes to
  production.
- **Updates and binaries:** an update reaches only binaries built from the same native code (the runtime version
  is a fingerprint, `fingerprint.config.js`). Store releases are made by hand.

**Revisely Dev** is a second app (`com.revisionbuddy.app.dev`, `APP_VARIANT=dev`) that installs beside the store
app. It runs on its own Firebase project (`revisely-dev`), so testing never touches production data. It gets each
develop commit on its own `dev` channel, and its site and API are at dev.revisely.app. See "Dev stack" in
`CLAUDE.md`.

## Deploying the backend

Rules and Cloud Functions deploy by hand. Without `--project`, these commands deploy **production** (the default in
`.firebaserc`):

```bash
firebase deploy --only firestore:rules
firebase deploy --only functions:<name>
```

The dev project deploys itself from develop (`.github/workflows/dev-backend.yml`). By hand, it's
`--project revisely-dev`. Rules go live before any app code that needs them.

`CLAUDE.md` is the full operations handbook: releases, the fingerprint, config and secrets, and each feature's
traps. `CONTRIBUTING.md` says how to make a change.

## Licence

Copyright © 2026 Revisely LLC. All rights reserved. See `LICENSE.md`.
