# Google Play: App content answers

Play Console → Policy and programs → **App content**. Data safety is in `data-safety.md`.

## Privacy policy
`https://revisely.app/privacy/`

## App access
**All or some functionality is restricted** → Add instructions:
- Name: `Demo account`
- Username: `applereview@revisely.app`. The password is the one in App Store Connect → App Review Information
  (never in this repository). Re-seed it before each review: `cd functions && GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/seed-reviewer.js`.
- Any other information:
  > Sign in with the email and password above. The account has about 166 pages memorized and a week of revision
  > sessions ending yesterday. Home → Start revision opens today's pages: swipe to the next page to mark one revised.
  > Press and hold a verse for Play, Translation, Copy and Share. Recitation keeps playing in the background, with
  > play and pause in the notification. The microphone in the reader's bar records the user reciting.

## Ads
**No, my app does not contain ads.**

## Content rating (IARC questionnaire)
- Email: `support@revisely.app`. Category: **Reference, News, or Educational**.
- Violence, blood, fear: **No**. Sexuality, nudity: **No**. Profanity, crude humour: **No**.
  Drugs, alcohol, tobacco: **No**. Gambling, simulated gambling: **No**.
- Users can interact or exchange content with each other: **No** (sharing a verse goes through Android's share sheet).
- Shares the user's physical location with other users: **No**.
- Lets users buy digital goods: **No**. Is a web browser or search engine: **No**.
- Expected result: Everyone / PEGI 3 / USK 0.

## Target audience and content
- Target age groups: **13–15, 16–17, 18 and over**. Not under 13: the privacy policy, the terms and the App Store's
  13+ rating say the app isn't directed to children (CLAUDE.md, "App Store"). Keep the four aligned.
- Could the store listing unintentionally appeal to children? **No**.

## News apps
**No.**

## Government apps
**No.**

## Financial features
**My app doesn't provide any financial features.** (Donations are on revisely.app, not in the app.)

## Health apps
**My app does not have any health features.**

## Advertising ID
**No** (the app doesn't use the advertising ID; the merged manifest has no `AD_ID` permission).

## Foreground service permissions
The manifest declares `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (expo-audio's media session).
- Type: **Media playback**.
- Describe the task: *"Recitation of the Quran plays verse by verse, page by page or through a surah or juz while
  the app is in the background or the screen is locked. A media notification shows the verse and reciter, with play,
  pause and a progress bar. The user starts it by tapping Play and can stop it at any time."*
- Impact if deferred or interrupted: *"Recitation would stop as soon as the user leaves the app or locks the screen,
  breaking listening and memorising sessions."*
- Video: an unlisted YouTube (or Google Drive) link, about 30 seconds: open a page, tap Play, press Home, show the
  notification and the lock screen with recitation going on, pause from the notification.

## Exact alarms, all files access, photo and video permissions, background location
Not used: no declaration.

## Store settings
- App category: **Education**. Tags: Education, Religion (if offered).
- Contact details: email `support@revisely.app`, website `https://revisely.app`. No phone, no postal address.
