# Google Play: Data safety answers

Play Console → Policy and programs → App content → **Data safety**. These answers follow the iOS App Privacy answers
(Name, Email, User ID, Audio, Customer Support, Diagnostics, Precise Location, Product Interaction) and the privacy policy
(revisely.app/privacy). Play counts data as **collected** when it leaves the phone, including to a service provider
working for us (Firebase, Sentry, Expo). It counts it as **shared** only when it goes to a third party for that party's
own use: nothing here is shared.

## Data collection and security

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS everywhere) |
| Which of the following methods of account creation does your app support? | **Username and password**, **OAuth** (Sign in with Google) |
| Delete account URL | `https://revisely.app/support/#delete-account` (live once the docs PR reaches `main`) |
| Do you provide a way for users to request that some or all of their data is deleted, without requiring them to delete their account? | **Yes**: recordings, sessions, daily log entries and the recording backup can each be deleted in the app |

## Data types

Every collected type: **not shared**, **not processed ephemerally**.

| Category → type | Collected | Required or optional | Purposes | What it is |
| --- | --- | --- | --- | --- |
| Location → **Approximate location** | Yes | Optional | App functionality | Only with Settings → Start day at fajr: the coordinates are saved to the account to work out fajr. The Qibla compass and prayer times use the location on the phone only. |
| Location → **Precise location** | Yes | Optional | App functionality | As above, when the user allows precise location. |
| Personal info → **Name** | Yes | Optional | App functionality, Account management | The display name (from sign-up or Google). |
| Personal info → **Email address** | Yes | Required | App functionality, Account management | The account's email. |
| Personal info → **User IDs** | Yes | Required | App functionality, Account management, Analytics | The account's internal ID (Firebase); crash reports carry it instead of a name or email. |
| Photos and videos → **Photos** | Yes | Optional | App functionality | A screenshot the user chooses to attach to Settings → Report a problem. |
| Audio → **Voice or sound recordings** | Yes | Optional | App functionality | Recitation recordings backed up to the user's account (Settings → Activity → Back up recordings turns it off). |
| App activity → **App interactions** | Yes | Required | App functionality | Revision sessions, pages revised and their ratings, reading sessions, time in the app. |
| App activity → **Other user-generated content** | Yes | Optional | App functionality | Daily log notes, Send feedback and Report a problem text. |
| App info and performance → **Crash logs** | Yes | Required | Analytics | Crash and error reports (Sentry). |
| App info and performance → **Diagnostics** | Yes | Required | Analytics | Session health per app version, device model and OS (Sentry). |
| Device or other IDs → **Device or other IDs** | Yes | Required | App functionality | The notification token registered with Expo's push service. |

Not collected: financial info, health and fitness, messages, contacts, calendar, files and docs, web browsing, app info
(installed apps), other personal info, race and ethnicity, political or religious beliefs, sexual orientation, phone
number, address, search history, purchase history, videos, music files, other audio files, other actions.

## Security practices (shown on the listing)

- Data is encrypted in transit.
- You can request that data be deleted (in the app, Settings → Delete account, or by email: see the Delete account URL).
- Independent security review: **No**.

## Keep in step

When the app gains or loses something that collects data, change this file, the Data safety form, the App Store's App
Privacy answers and the privacy policy together (CLAUDE.md, "Public pages").
