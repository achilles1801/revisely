# Revisely

A Quran revision tracker that schedules daily review by pages, juz, or a custom plan, with optional Smart Tracking insights that surface weak pages.

Built with Expo SDK 54, React Native, and Firebase. Quran.com sign-in syncs streak and activity from Quran Foundation.

## Stack

- **App**: Expo (new architecture), React Native 0.81, React 19, TypeScript
- **Backend**: Firebase Auth, Firestore, App Check
- **Functions**: Cloud Functions v2 (account deletion; legacy memorization parser is deployed but no longer wired to the client)
- **Tests**: Jest + RNTL, `@firebase/rules-unit-testing`, `firebase-functions-test`, Maestro

## Setup

```bash
npm install --legacy-peer-deps
npm --prefix functions install
npm --prefix tests/firestore-rules install
cp .env.example .env   # then fill in Firebase + Google client IDs
```

Place `GoogleService-Info.plist` at the project root for iOS builds.

> Expo Go is not supported. The app uses native Firebase modules and the new architecture, so you need a dev client.

## Run

```bash
npx expo start                  # JS server (use with a dev client build)
npx expo run:ios                # build + install dev client (iOS)
npx expo run:android            # build + install dev client (Android)
```

## Verify a change

```bash
npx tsc --noEmit                # type check
npm test                        # unit + component tests
npx expo export --platform ios  # bundle check
```

## Tests

| Layer | Command | Notes |
|---|---|---|
| Unit + component | `npm test` | — |
| Cloud Functions | `npm run test:functions` | — |
| Firestore rules | `npm run test:rules` | needs Java for the emulator |
| Everything above | `npm run test:all` | — |
| E2E (Maestro) | `npm run test:e2e:ios` | needs Maestro + simulator + dev client |

CI runs all of the above except Maestro on every PR and on every push to `develop` and `main`, via [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Branches and releases

| Branch | What happens on push |
|---|---|
| `develop` | CI only. Day-to-day work lands here. |
| `main` | CI, then a release: [EAS Update](.github/workflows/update.yml) publishes the JS to the `production` channel, and starts a TestFlight build first if native code changed. |

To release, open a PR from `develop` to `main` and merge it once CI is green.

The runtime version is a fingerprint of the native side, so an update only ever reaches a binary
built from the same native code. A new library with native code, a plugin, a permission or the icon
changes the fingerprint; the next push to `main` then builds and submits a new binary, and the update
reaches phones once that build is installed from TestFlight. What the fingerprint counts is in
[fingerprint.config.js](fingerprint.config.js).

To build by hand, run [EAS Build](.github/workflows/build.yml) from the Actions tab. Both workflows
need an `EXPO_TOKEN` repository secret, and read config from the `production` environment on EAS.

Local development:

```bash
npx expo run:ios                # simulator with hot reload
```

## Deploy backend (Firebase)

```bash
firebase deploy --only firestore:rules
firebase deploy --only functions
firebase deploy --only firestore:rules,functions   # both at once
```

## Layout

```
src/
  components/   context/   hooks/   lib/
  navigation/   screens/   theme/   types/
functions/                # Cloud Functions (Anthropic-powered parser)
tests/firestore-rules/    # security-rules tests
.maestro/                 # E2E flows
```
