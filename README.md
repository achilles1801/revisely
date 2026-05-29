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

CI runs all of the above on every PR via [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Workflow

The three commands you'll actually use day-to-day:

```bash
# 1. Local dev — runs on iOS simulator with hot reload
npx expo run:ios

# 2. Rebuild for iPhone (~15 min, EAS) — needed for any native change
#    (new npm packages with native code, app.config.js plugins/ios.*)
eas build --profile preview --platform ios

# 3. Push JS-only changes to existing iPhone build (~30 sec)
eas update --branch preview --message "what you changed"
```

Quit + reopen the app on iPhone after `eas update` to pick up the new code
(takes one launch to download, applies on the next).

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
