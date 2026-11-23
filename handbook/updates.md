# How updates reach phones, What's new, the November 2026 release

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## How updates reach phones

- **OTA** (`src/lib/updates/ota.ts`, started in `App.tsx`). On its own, expo-updates downloads in
  the background and runs the update from the next cold start, which on iOS can be days away.
  - **At launch** the splash stays up while the app checks, for at most 2.5 s. An update downloaded
    by then is applied before Home shows, behind a reload screen that matches the splash (#000000
    and the icon). The splash always goes by 4 s.
  - **Back in front**, it checks again if the last check was 10 minutes ago or more.
  - **Applying later:** an update that has downloaded is applied when the user comes back after 15
    minutes or more away, unless a restart would interrupt something.
    - "Something" is `lib/updates/busy.ts`: a recording session, a recitation, a timer, or any
      screen but a tab's own (Dashboard, ReadIndex, Insights). So no session, reader, editor,
      onboarding or sign-in screen is ever restarted under the user.
  - **Update sheet:** otherwise, as soon as an update has downloaded, "A new update is ready" opens
    by itself (`components/updates/UpdateReadySheet`, mounted on Home; the tabs stay mounted, so
    it opens over Read and Insights too). **Update now** restarts into it; **Later** puts it off
    until the next cold start (it still applies at launch, or on return after 15 minutes away).
    Nobody has to look for updates (owner, Nov 4 2026). It replaced the "Update ready · Restart" row.
    - It opens only on a tab's main screen with nothing going on (every `busy.ts` reason, the
      screen too), so never during a session, recording, recitation or timer: it waits for them to
      end, then opens 1.2 s later.
    - "Downloaded" includes expo-updates' own background download at launch: `ota.ts` follows the
      native state (`addUpdatesStateChangeListener`, `latestContext.isUpdatePending`), not only its
      own checks.
    - The store's "New version available" waits while it is offered: one sheet at a time.
  - **App info in Settings → About is for testers only** (`lib/updates/testerTools`: a `previewTester` account, a
    TestFlight install, a development build). Testers get App info (build, channel, update, Share,
    test crashes on preview) with **Check for updates** (or a long press on the row;
    `checkForUpdateNow`), which downloads what it finds and always ends in "Update ready ·
    Restart to update". While an update waits, the details show "Restart to update" in its place.
    Everyone else sees only "Version 1.0.3 (5)".
- **Store versions** (`lib/updates/storeUpdates.ts`, rules in `versions.ts`).
  - **iOS:** once a day, Apple's public lookup (`itunes.apple.com/lookup?bundleId=…`, nothing about
    the user). A newer version than the binary's opens "New version available · Update"
    (`StoreUpdateSheet`) on Home: once per version, never while busy.
  - **Android:** what Play has comes from `config/app` (Play has no public lookup; Play In-App
    Updates needs a native module, planned for 1.0.4). Builds compare by version code
    (`Application.nativeBuildVersion`), so a new build of the same version is offered too, named
    "1.0.3 (6)".
    - `testing.android` `{version, code}`: Play's internal testing track. Written by itself: once
      `android-build.yml` has uploaded a build, its `available` job waits 10 minutes (internal
      testing has no review), reads the track (`scripts/play.js latest internal --json`) and posts
      it to the `playBuildAvailable` function with the job's GitHub OIDC token. The function
      (`functions/src/playAvailable.ts`) accepts only this repository's `android-build.yml` on
      develop or `release/*` (push or by hand) and only a higher version code. Nothing for
      Firestore is stored in GitHub. Callers of `android-build.yml` must grant `id-token: write`.
    - Only `previewTester` accounts compare against it (`setStoreTester`, from AppContext with the
      update channel): they are the internal testers, as on iOS. A tester who isn't on Play's
      internal testing list would be offered a build Play doesn't show them, and wouldn't get
      `preview` updates for it either. Closed-testing-only testers aren't offered testing builds:
      Play's API can't say when a closed-testing review has passed.
    - `latest.android` + `latest.androidCode`: production, for everyone. Set by hand once a release
      is out to everyone (`play.js rollout 1` prints the command): review state and staged
      rollouts aren't in Play's API either.
  - Development, TestFlight and App Review (a sandbox receipt) never see either, so a reviewer is
    never blocked. Android is never exempt (only `__DEV__`): internal and closed testers see it.
- **Forced updates:** Firestore `config/app` `minSupported.ios` / `.android`. Below the minimum the
  whole app is "Update required" (`UpdateRequired`) with no way past it.
  - It applies only once the store has a version that meets the minimum: on iOS the listing must
    show it, on Android `latest.android` must be at least it.
  - It waits for a recording or a recitation to stop.
  - Phones read `config/app` at launch and every 6 h, and keep a copy for offline use.
  - Set it with
    `cd functions && GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-app-config.js`
    (`--show`, `--latest-android V [--latest-android-code N]`, `--min-ios V`, `--min-android V`,
    `--clear-min`). It refuses a minimum the store doesn't have yet, unless `--force`.
  - After a release reaches everyone on Play's production track, set `--latest-android` and
    `--latest-android-code` to it.
  - `playBuildAvailable` deploys by hand like the other functions
    (`firebase deploy --only functions:playBuildAvailable`); it is public and checks the token
    itself. Its URL is in `android-build.yml`.
  - The rule (`match /config/app`: anyone reads, no client writes) went live on 2026-11-03.

## What's new (after an update)

A short walkthrough after the update (Majd, Nov 8 2026; mocks `~/Documents/revisely-today-mocks/whats-new/`).
BEHAVIOUR.md NEW-1 to NEW-4.
- **Who sees it:** an account set up before the release (no `whatsNewSeen` on its user document, or an
  earlier release's) sees it once, before Home, when the release is switched on.
  - Done writes `whatsNewSeen` = the release id. Onboarding writes it too, so new accounts never see it.
  - Required: no skip or close. It resumes on the card left, kept on the phone (`lib/whatsNew/state`).
  - Each card shows only to accounts that have its feature (`components/whatsNew/needs`: each feature's own gate).
- **The cards** live in `src/lib/help/whatsNew.ts` (`RELEASES`; the last is current) and are help text: the
  help's drift check covers them (`whatsNewReviewed.json`, `UPDATE_HELP_REVIEWED=1 npx jest src/lib/help`).
  A release with `live: true` that needs a feature still for testers fails `whatsNew.test.ts`.
- **Ships dark.** A release's entry has `live: false` until the PR that makes its features public flips it
  (one line). Production gets JavaScript only through Promote, so App Store users get the cards in the
  same update as the features. `2026-11` is live (the release PR below).

## The November 2026 release: everyone's

The release PR (Nov 2026) opened these to every account, not only `previewTester`. Each is a named gate
that returns true for any signed-in account, so it can be closed again in one line (as
`prayerTimesEnabled` was opened for 1.0.3). `src/lib/__tests__/releaseGates.test.ts` holds each open for an
account with `previewTester` unset or false, and the scenarios of these features run as such accounts.
Non-testers follow `production`, so nobody sees this on a phone before Promote; the tests are the proof.
- `activityBlocksEnabled` (`lib/activityBlocks`): Activity's blocks (ACT-2, ACT-3), Insights in Activity and
  the Home and Read tab bar (ACT-12), the day's + (ACT-5), the sittings' offers on a day (REC-3, MEM-5), the
  juz sheet (MEM-7), and pages logged by hand counted by the self-heal (ACT-16: `getManualRevisionItems`, one
  query on every self-heal, for every account now).
- `sittingsEnabled` (`lib/sitting`): the reader's sittings (REC-1, REC-2) and the schedule editor's "Not in
  your plan" (MEM-6).
- `everyTranslationOffered` (`lib/translationsOffered`): every QuranEnc translation, its downloads and
  favorites (TRANS-5 to TRANS-8); `VerseSheet`'s `everyTranslation`.
- `HELP_FOR_EVERYONE` (`lib/help/availability`): the ? buttons (HELP-1, HELP-4).
- What's new `2026-11` `live: true`; `components/whatsNew/needs` reads the gates above.
- Revo is not one of them: it follows `config/app.revo` (REVO-37).
- Still testers only: Reset my data, Load test scenario, the update tools and the `preview` channel, the old Ask
  coach.
- The old Activity (no blocks) and the Insights tab stay in the code as what the gate falls back to;
  `ActivityScreens.test` and `ActivityScreens.v2.test` pin them by mocking the gate off.
- A loaded test scenario writes `whatsNewSeen: 'all'` (`functions/src/testScenarios.ts`), so it opens on
  Home; deploy `loadTestScenario` with it.
- **Testers before a release is live:** Settings → About → What's new (a replay with ✕, nothing kept) and Settings →
  Testing → Show What's new at launch (from the next launch, as App Store users will see it; Done turns it
  off and writes nothing to the account).
- **Kill switch:** `config/app.whatsNewOff`.
  `cd functions && GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-app-config.js --whats-new off`
  (`on` to undo). Phones read it at launch and back in front after 10 minutes.
- **Never shown:** `seed-reviewer.js` and `seed-screenshots.js` write `whatsNewSeen: 'all'` (`SEEN_ALL`),
  so App Review and the screenshots skip it. A mark the app doesn't know counts as seen (a later release's).
- **Nothing opens over it:** it replaces the main screens in RootNavigator.
  - Home's update and store sheets and Revo wait for Home.
  - WidgetSync holds a widget's link until Done.
  - `lib/updates/busy` sees no main screen, so no update restarts the app under it.
- **The next release:** write it as `NEXT_RELEASE` in `src/lib/help/whatsNew.ts` (a new id, its own cards, `live:
  false`), outside `RELEASES`. So the current release stays what store users, TestFlight testers, E2E and the scenarios
  see, and what onboarding marks, while Revisely Dev's testers see the next one in Settings → About → What's new and the
  run at launch (`releaseFor`). The release PR appends it to `RELEASES` with `live: true` (and sets `NEXT_RELEASE` back
  to null), opening its features' gates in the same change. Only the current release shows or replays for everyone
  else. The mistake detection release's is `1.0.5` (Nov 16 2026).
- `whatsNewSeen` is in the user document's allowlist (`firestore.rules`, #439). The rules must be live
  before app code that writes it reaches develop: onboarding's write would be refused, and with it
  `onboardingComplete`.
