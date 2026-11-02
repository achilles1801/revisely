# Google Play launch: what's left to do by hand

Everything in the repository is ready: the app runs on Android, CI builds it, and the listing text, graphics and form
answers are in this folder (`listing.json`, `data-safety.md`, `app-content.md`, `feature-graphic.png`, `icon-512.png`,
`screenshots/phone/`). These steps need your accounts. Do them in this order.

> **New personal Play developer accounts** (created after November 2023) must run a **closed test with at least 12
> testers, opted in for 14 days in a row**, before Production can be requested. Organisation accounts are exempt.
> Start step 5 early.

## 1. The upload key (Expo, 2 minutes, on your laptop)
From the repo root:
```bash
eas credentials --platform android
```
Choose **production** → **Keystore: Manage everything needed to build your project** → **Set up a new keystore** →
let EAS generate it. Back in the same menu, **Keystore** shows its **SHA-1** and **SHA-256** fingerprints. Copy both
for step 2. This is the *upload* key. Google keeps the *app signing* key (Play App Signing, step 5).

## 2. Firebase: register the keys (5 minutes)
Firebase Console → project **revision-buddy-3a398** → ⚙ **Project settings** → **Your apps** → the Android app
`com.revisionbuddy.app` → **Add fingerprint**, once for each:
- the upload key's SHA-1 and SHA-256 (step 1);
- the debug key used by development builds: SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`,
  SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`
  (React Native's public debug keystore: development only).

Then **download google-services.json** from the same page and replace the one at the repo root on your laptop
(gitignored). Google Sign-In on Android works only with these fingerprints registered. Without them it fails with
`DEVELOPER_ERROR`.

## 3. GitHub: turn Android on and build (10 minutes, plus about 30 for the build)
github.com/achilles1801/revisely → **Settings** → **Secrets and variables** → **Actions**:
1. **Secrets** tab → **New repository secret**: name `GOOGLE_SERVICES_JSON`, value = the output of
   `base64 -i google-services.json | pbcopy` (run in the repo root, then paste).
2. **Variables** tab → **New repository variable**: name `ANDROID_RELEASES`, value `true`.

Then **Actions** → **EAS Build** → **Run workflow**: branch `develop`, platform **android**, submit **off**. When it
finishes, open the run → **Artifacts** → download `revisely-android-<sha>` (a zip holding `revisely.aab`).

From now on every push to develop that changes native code builds Android too, and every preview update is
published for Android as well.

## 4. Play Console: create the app (30 minutes)
play.google.com/console → **Create app**:
- App name **Revisely**, default language **English (United States)**, **App**, **Free**, tick the declarations →
  **Create app**.

Dashboard → **Set up your app**: answer each task from `app-content.md` and `data-safety.md`:
App access, Ads, Content rating, Target audience, News apps, Data safety, Government apps, Financial features, Health,
Advertising ID, Privacy policy. **Foreground service permissions** asks for a short video. Record one on a phone (it's
described in `app-content.md`).

**Grow** → **Store presence** → **Main store listing**: paste from `listing.json` (title, short description, full
description) and upload `icon-512.png`, `feature-graphic.png` and the eight PNGs in `screenshots/phone/`.
**Store settings**: category Education, email `support@revisely.app`, website `https://revisely.app`.

## 5. First release: internal testing (10 minutes)
**Test and release** → **Testing** → **Internal testing** → **Create new release**:
1. Play App Signing: accept **Use Google-generated key** (the default).
2. **Upload** `revisely.aab` from step 3. Release name: leave the suggested one. Notes: "First Android build."
3. **Next** → **Save** → **Go to overview** → **Send for review** / **Start rollout to Internal testing**.

**Testers** tab → **Create email list** (e.g. "Team") → add your Google accounts → **Save** → copy the **opt-in link**
and open it on each Android phone. Revisely then installs from Play.

Then, for a new personal account, **Closed testing** → **Create track** → the same release → at least **12 testers**
for **14 days** (step box above).

## 6. Register Play's signing key (5 minutes, after the first upload)
Play Console → **Test and release** → **App integrity** → **App signing** → copy the **App signing key certificate**
SHA-1 and SHA-256.
- Firebase (as in step 2) → **Add fingerprint** for both → download google-services.json again → update the local
  file and the `GOOGLE_SERVICES_JSON` secret (step 3.1). Sign-in in installs from Play needs this key.
- **App Check**: Firebase Console → **App Check** → **Apps** → the Android app → **Play Integrity** → paste the
  SHA-256 → **Save**. Then Play Console → **App integrity** → **Play Integrity API** → **Link a Cloud project** →
  `revision-buddy-3a398`. Development builds use App Check's debug provider: under the Android app → ⋮ → **Manage
  debug tokens** → **Add debug token**, as for iOS (CLAUDE.md, "App Check debug token").

## 7. Automatic uploads (15 minutes)
1. Google Cloud Console (console.cloud.google.com), project **revision-buddy-3a398** → **APIs & Services** →
   **Library** → **Google Play Android Developer API** → **Enable**.
2. **IAM & Admin** → **Service Accounts** → **Create service account**: name `eas-play-submit`, no roles → **Done** →
   open it → **Keys** → **Add key** → **JSON** → it downloads. Keep it outside the repo (e.g. `~/secrets/`).
3. Play Console → **Users and permissions** → **Invite new users** → the service account's email
   (`eas-play-submit@revision-buddy-3a398.iam.gserviceaccount.com`) → **App permissions** → **Revisely** → tick
   **Release apps to testing tracks** (and **Release to production…** only if CI should ever do it; it doesn't today) →
   **Apply** → **Invite user**.
4. Laptop: `eas credentials --platform android` → **production** → **Google Service Account** → **Upload a Google
   Service Account Key** → the JSON from 2.
5. GitHub → **Variables** → `ANDROID_SUBMIT` = `true`.

Every Android build then uploads itself to internal testing as a draft. Once the app has been published on Play,
change `releaseStatus` to `completed` in `eas.json` (`submit.production.android`) so internal releases roll out by
themselves.

## 8. Before production
- Merge the Android native-config PR (notification icon, dialog colours, permissions) with the next iOS native release
  (it raises `version` and starts an iOS build; see its description).
- Preview testers on Android: `set-preview-tester.js <email>` as for iOS. On Android the account alone decides.
- Production: **Test and release** → **Production** → **Countries / regions** (all, as iOS) → **Create new
  release** → **Add from library** (the build tested in internal/closed testing) → **Send for review**.
- revisely.app/support says "Revisely is coming to Google Play": point it at the Play listing when it's live.
