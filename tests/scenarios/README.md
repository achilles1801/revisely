# Scenario and property tests

The source of truth for how Revisely behaves is `BEHAVIOUR.md`; these are its tests. CI runs them on
every push and PR (`ci.yml` → `scenarios.yml`), and `preview.yml` publishes nothing unless they pass.

## Running them

You need Java 21 and the Firebase CLI, as for the rules tests.

```bash
cd tests/scenarios && npm ci
```

```bash
scripts/emulators.sh exec auth,firestore demo-revisely 'cd tests/scenarios && npx jest --config jest.config.js --maxWorkers=4 --forceExit'
```

Run it from the repository root. To run one file, add its name after `--forceExit` (for example
`ahead`). Always start the emulators through `scripts/emulators.sh`, never `firebase emulators:*`
directly: it takes the shared lock, so two sessions never run on one set of ports. To run beside
another worktree, give this one its own ports with `REVISELY_EMU_PORT_BASE=auto` (stable per
worktree path); the harness reads them from the environment the script sets. The property tests alone need no emulators:

```bash
npx jest --config tests/scenarios/jest.config.js properties
```

`PROPERTY_SCALE=10` makes every property search ten times longer. `node tests/scenarios/check-spec.js`
checks that `BEHAVIOUR.md` and the tests agree.

## What a scenario runs

A scenario runs the app, not a model of it:
- **The app:** the real `AuthProvider` and `AppProvider` (with the offline copy and the outbox), and
  Home and the session screen in a real React Navigation stack.
- **The server:** the Firebase JS SDK against the Auth and Firestore emulators, with the real
  `firestore.rules`. Project `demo-revisely` never reaches a real Firebase project.

Only a phone's edges are stand-ins, in `harness/`:

| Edge | Stand-in |
| --- | --- |
| Clock and time zone | `clock.ts`. Only `Date` is fake, and it moves only when the scenario moves it. `setZone` sets the real process's TZ (through `environment.js`, since Jest's `process.env` is a copy). |
| Network | `netinfo.ts`, and Firestore's network on or off (`Phone.goOffline`, `goOnline`). |
| Leaving and returning to the app | `appState.ts` (`app.background()`, `app.foreground()`). |
| The disk | `fileSystem.ts`: a folder per phone. |
| The pager | `pager.tsx`: the Qur'an page images. |
| Native SDKs with no JS side | `firebaseSetup.ts`: Google Sign-In, Sentry, notifications. |

- **Phones and launches:** a `Phone` is a device. `phone.open()` is a cold start: every module is
  loaded afresh, and only what the app saved on the phone (AsyncStorage, the disk) carries over.
- **Two devices:** two `Phone`s signed in to one account. One app is open at a time.
- **Accounts** (`account.ts`) are made the way the app makes them: sign-up, then the calls the
  onboarding screens make (`newAccount(phone, { memorized, user })`).
- **Screens** (`screens.tsx`):
  - `Home` reads the Today post: `title()`, `detail()`, `ahead()`, `carryOver()`.
  - `home.startSession()` and `home.openAhead()` open a `Session`.
  - A `Session` is driven as a finger drives it: `swipe()`, `swipeThrough(n)`, `check()`,
    `keepGoing()`, `back()`.

## Writing one

1. Find the rule in `BEHAVIOUR.md`. Add one if it's missing: the rule a user would state, not the
   code.
2. Write the scenario in `scenarios/`:
   - Put the rule ids in its title, e.g. `it('[DAY-2] [AHEAD-1] …')`.
   - Set a zone and a time: `setZone`, then `setNow('2026-11-03 00:30')`.
   - Make the account, then do what the user does.
3. Expect what the user would see or what is saved. Work the expected pages out by hand from the plan
   (see `dayWeeks.ts`), not with the app's scheduling code, or the test can only agree with it.
4. A bug fix: the scenario must fail without the fix. Check it does before committing the fix.

**A rule that is broken now** gets an `it.failing('KNOWN BUG: …')` test, a comment with the cause, and
a row under "Known bugs" in `BEHAVIOUR.md`. It passes while the bug stands. Once the bug is fixed it
fails, which is the cue to make it an ordinary `it`.

## Times

- Pick times that exist. `local()` throws for a time in a spring-forward gap, or in the hour that
  happens twice in autumn.
- Pick Fajr from the app's own calculation for the city (`fajrOn` in `dayWeeks.ts`), and stay a few
  minutes off it.
- A scenario's clock stands still. Firebase's own timers run on real time.
