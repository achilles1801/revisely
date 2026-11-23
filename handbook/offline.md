# Offline: the account copy, the outbox, the offline mushaf, translations

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## Offline (src/lib/offline)

Firestore's JavaScript SDK keeps nothing on disk in React Native (its persistence needs IndexedDB), so
the app keeps its own copy and its own queue. Before Nov 2026 a cold start offline sat on the spinner
for good: it waited for the server to answer for the user document.
- **The copy** (`accountCache`): the user document, the 604 pages and the 100 latest sessions, as the
  server last sent them, per account in AsyncStorage (`@revisely_account:v1:<uid>:…`). `AppProvider`
  opens from it at once and replaces it with each server snapshot. Snapshots marked `fromCache` (the
  SDK's memory: empty on a cold start) are never applied or saved: an empty one once wrote blank
  pages over real progress (REACT-NATIVE-6), and missing data is still created only when the server
  confirms it (`lib/userDoc`). Signing out deletes the copy.
- **The outbox** (`outbox`, `ops`, `sync`, `apply`): every change (user fields, pages, sessions, the
  timer's reading sessions, the daily log, usage seconds) is saved on the phone first and sent in
  order, one at a time. The app shows the copy with pending changes laid over it (`overlayAccount`),
  so nothing waits for the server.
  - **Only what changed:** a save sends just the fields that differ from what the app shows
    (`changedOnly`, `pageChange`). The copy can be older than the server (another phone); sending
    every field would put its old values back.
  - **Safe to send twice:** values are absolute, page lists merge as sets, and `createdAt`s are fixed.
    A session is merged with the server's inside a transaction, since another phone may have added
    to the day. Its minutes add `durationAdd`, unless the server already has `durationAtLeast`.
    When the other phone added at least as many minutes, this phone's minutes don't count; the
    server keeps no record of which changes it has.
  - **Crossing off:** a change leaves the outbox only after it has been folded into what's shown
    and into the copy (`onApplied` is awaited).
  - **Offline or a timeout:** it is tried again (2 s … 1 min), and at once when NetInfo says the
    connection is back or the app comes to the front. `connectivity` also restarts Firestore's
    connection, which otherwise waits out its own backoff.
  - **"Permission denied":** this is how the rules refuse, but also how App Check or a stale
    sign-in fail. A change is dropped (reported, kind only) only after a server read works
    (`probe`), on the third refusal. Other refusals are dropped at once. An error that isn't
    Firestore's (a bug) is dropped after 5 tries, so it can't hold up the rest.
  - **Accounts:** nothing is sent for an account that isn't the one signed in. Signing out keeps
    its outbox for its next sign-in here; deleting the account clears it.
  - **Reset by an admin** (`lib/offline/reset`): `functions/scripts/reset-account.js` sets
    `dataResetAt` on the user document. A run sends nothing until it has compared that with the
    mark of the copy (the user document's listener does it, or `beforeSend` reads the server once).
    Reset since: every waiting change built on the copy is dropped (with no copy, the ones made
    before the reset), and the copy's pages and sessions go, on screen and on the phone. Local
    recordings stay (only the user deletes those); the script tombstones their records, so they
    stay local-only.
  - **Storage:** a stored queue that can't be read is never written over, and a damaged one is
    kept aside (`@revisely_outbox_damaged:…`).
  - **Usage seconds** aren't idempotent: a crash between the server's answer and crossing them off
    counts them twice.
- **Listeners:** one that ends in an error (e.g. refused before App Check had its token) is
  subscribed again after a backoff; "Try again" does it at once. Pull to refresh doesn't read the
  server: the listeners already do, and an older read could roll a newer snapshot back.
- **First launch offline** (no copy): `connectionNeeded` → `ConnectToSetUp` ("Connect to the internet
  to set up", Try again, Sign out) when NetInfo or Firestore says offline, or after `SERVER_WAIT_MS`
  (6 s). It carries on by itself when the server answers. Onboarding never starts without the server.
- **A slow network at launch:** Firebase Auth checks its saved sign-in with the server first (up to
  30 s). After `AUTH_GRACE_MS` (1.5 s) the app opens with the account Auth saved
  (`provisionalUid`, read from Auth's own AsyncStorage entry) and its copy; nothing is sent until Auth
  confirms it. Offline, Auth keeps an expired sign-in (it can't check it) and refreshes it once online.
- **Offline note:** Home's `OfflineNote` ("Offline", "Offline · changes saved on this phone").
- A day's notes can't be read offline unless Firestore already holds that day: the Day screen then says it couldn't
  load. Adding, editing or deleting a note is that note's own write (`applyJournalNote`), so nothing else is overwritten.
- The start-up self-heal (`syncPagesFromLogs`) runs only on the server's pages and sessions, never on
  the copy, and compares last-revised dates by day (comparing a day with a timestamp rewrote every
  revised page, unchanged, on every launch).
- **Testing offline:** the Android emulator has airplane mode (`adb shell cmd connectivity
  airplane-mode enable`; Metro still works through `adb reverse`). The iOS Simulator has none:
  `src/dev/offlineSwitch.ts` (development builds only; absent from release bundles) sends every
  JavaScript request except to Metro to a closed port. Turn it on in the app with
  `xcrun simctl openurl <udid> "revisely://devoffline?on=1"` (`exp+revision-buddy://devoffline?on=1`
  on dev clients without the revisely scheme; `on=0` turns it off); it is kept for the next launch.
  `defaults write` from `simctl spawn` doesn't reach the app once it has saved its own value.
  Native requests don't pass through it, except those whose URL goes through `lib/devNetwork`
  (`nativeRequestUrl`: the mushaf's page downloads and page images).

### Offline mushaf (`lib/pageCache`, `lib/mushafOffline`)

Every page is downloaded to the phone, so the reader and revision sessions work offline (Nov 2026).
- **Where:** `Documents/mushaf/<set>/001.png …` (`Paths.document`; Android's files directory), which
  the system never empties. Before, pages were cached as read in the caches directory, which iOS and
  Android may clear; `migrateLegacyPages` moves those over once (2 s after launch) and they are read
  from there until then. The reader saves the pages it opens to the same folder.
- **Backups:** on iOS the folder (and `Documents/quran-text`, `Documents/translations`) is kept out of iCloud backups with
  `RecitationAudio.excludeFromBackup`, which every binary on runtime 2df7a2f0 has (builds 31/32);
  `xattr -l` shows `com_apple_backup_excludeItem` on it. Android can't do that from JavaScript, so
  from 1.0.4 the build carries backup rules (`plugins/withAndroidBackupRules.js`):
  `files/mushaf`, `files/quran-text` and `files/translations` are left out of cloud backups
  (`android:fullBackupContent` for Android 6–11, `android:dataExtractionRules` for 12+; a
  device-to-device transfer still takes them). Before, they pushed the app past Android's 25 MB
  quota, and an app over it isn't backed up at all. Recordings stay in (they can't be downloaded
  again unless backed up), though they alone pass the quota for many users. Add a folder there when
  the app downloads something new into `Paths.document`.
- **Sizes** (`src/data/mushafSizes.json`, from `node scripts/mushaf-sizes.js`; run it again if the
  images in Storage change): iOS (the originals) 247 MB, Android w1080 135 MB, w1440 191 MB; the
  Arabic text (1.8 MB) and Saheeh International (1.1 MB) come on top, so Settings says 250, 138 and
  194 MB (`ARABIC_TEXT_BYTES`, `SAHEEH_BYTES`, measured Nov 2 2026).
- **The download** (`mushafOffline`, started by `MushafOfflineController` 20 s after launch with
  someone signed in): Wi-Fi only (metered Wi-Fi, a hotspot on Android, counts as mobile data),
  unless "Download over mobile data" is on or "Download now" was confirmed over it once; only in the
  foreground; only while there is room for the next page plus 100 MB. Three pages at a time; it
  stops between pages when any of that changes and carries on from there. A page is downloaded to
  `.part` and moved in, so a page there is whole. Failures are tried again on the connection coming
  back, the app coming to the front, or after 1, 5, 15 minutes; a run stops after 6 failures in a
  row. Progress reaches Settings at most every 400 ms.
- **Android downloads** go through `expo-file-system/legacy`'s `downloadAsync` (one shared OkHttp
  client), checked for the status, the `Content-Length` and a 2-minute timeout (it can hang when the
  connection drops mid-file). `File.downloadFileAsync` makes a new client per file: re-downloading
  300 pages on the emulator reached 1,092 open files, 325 sockets and 653 threads (older Android
  allows 1,024 files); with the shared client, 195, 26 and 75. iOS keeps `File.downloadFileAsync`
  (`URLSession.shared`).
- **Sets:** another set already downloaded is kept (a foldable's two screens pick different sets;
  deleting one would re-download 135–191 MB on every switch). Old cache folders of other sets go.
- **A page that fails to show** (`evictCachedPage`) is deleted only if its size isn't the table's
  (a decoding failure from memory can hit a whole file: "Couldn't load page N", Try again); the
  download hears it (`onPageRemoved`) and fetches it again.
- **Settings → Downloads and storage:** "Offline mushaf" (status and %, a menu with Download now and Remove from
  this phone) and "Download over mobile data". "Downloaded" means every page, the Arabic and every
  sura of Saheeh International; the text downloads first. Remove deletes all three and turns the
  download off (kept on this phone, `@revisely_mushaf_offline:v1`) until Download now; pages and
  suras the reader opens are still kept.
- **A page not on the phone:** online, it downloads (or loads from Storage, as before); offline
  (`networkState`, fed from NetInfo), the reader shows "Page N isn't downloaded yet" with Try again,
  and loads it by itself when the connection is back.
- **Text offline:** the whole Arabic (Tanzil's Uthmani via alquran.cloud) is downloaded with the
  pages (`downloadArabicText`, one request), so Copy and Share and the verse sheet's Arabic work
  offline; the file keeps Tanzil's notice (`TANZIL_NOTICE`, word for word from
  tanzil.net/docs/text_license), as its terms ask of every copy (a file from before Nov 3 2026 holds
  the pages alone; it is written again with the notice the first time it loads). Saheeh International, now QuranEnc's
  licensed copy (#80, below), is downloaded whole too. The Clear Quran stays as the owner decided on
  Oct 27 2026 (cached as read, 30 + 30 days, never the whole of it): its terms (attribution, no
  changes, a revocable licence, rate limits; public page theclearquran.org/organizations/api) don't
  allow more. Offline, a verse of it not read before shows "The Clear Quran® needs the internet",
  "Saheeh International is available offline." and a Show Saheeh International button (which sets
  the account's translation) when that sura is on the phone. Surah and juz data and the verse boxes
  are bundled. Recitation streams from everyayah.com and needs a connection.

### Saheeh International (QuranEnc.com, licensed; `lib/saheeh`)

From Nov 2026 (#80) Saheeh International comes from QuranEnc.com's API
(`https://quranenc.com/api/v1/translation/sura/english_saheeh/<n>`), not alquran.cloud, which has no
licence for individual translations. QuranEnc lists it as `english_saheeh`, "English Translation -
Noor International Center" (Noor International issues Saheeh International), v1.1.2 (last update
June 2025).
- **Terms** ("Terms and Policies" on every translation's page, quranenc.com/en/browse/english_saheeh;
  read Nov 2 2026): translations can be downloaded and re-published if (1) nothing is modified, added
  or deleted; (2) the publisher and the source (QuranEnc.com) are clearly named; (3) the version is
  mentioned; (4) the transcript information stays inside the document; (5) notes on the translation
  go to QuranEnc (`POST /api/v1/translations/note`, if the app ever takes notes); (6) it is updated to
  the latest version; (7) no inappropriate advertisements are shown with it.
- **What the app does for them:** each verse's translation and footnotes are kept exactly as given.
  The verse sheet shows `[n]` markers that have a footnote as raised numbers (`saheehSegments`;
  bracketed words like "[All] praise" stay) and the footnotes under the verse (`saheehFootnotes`).
  The pinned credit is `creditLine`: "Saheeh International, issued by Noor International Center ·
  v1.1.2" and the link QuranEnc.com (its page). `info.json` keeps QuranEnc's title, description,
  version and last update with the files.
- **Storage:** `Documents/translations/english_saheeh/NNN-<version>.json`, one file per sura (written
  to `.part` and moved in), as soon as a sura is read, and all 114 with the offline mushaf. Out of
  iCloud backups on iOS. The old alquran.cloud cache (`Caches/translation/en.sahih`) is deleted.
- **Versions:** QuranEnc's list (`/api/v1/translations/list/en`) is read at most once a day (after a
  failure, not again for 10 minutes; a clock set back doesn't stop it). A sura of an older version is
  shown with its own version and fetched again as soon as it is read, on any connection
  (`refreshIfOutdated`), whether or not the offline download runs; the download (every run of
  `mushafOffline`, even when everything is here) replaces the rest. The sura endpoint has no version:
  a sura read before the list is labelled with the last version known (`SAHEEH_KNOWN` on a fresh
  install) and fetched again if the list says otherwise.
- **Failures:** the download carries on past a failed sura and stops after 3 in a row; a sura that
  can't be stored (a full phone) is a failure there (the reader still shows it). The text downloads
  before the free-space check for pages, so it comes even when the pages don't fit. The verse sheet
  offers Saheeh International offline only when that sura and that page's Arabic are both on the
  phone (`hasArabicForPage`), and reloads by itself when the connection comes back.
- **Requests:** the API sits behind Cloudflare and answers 403 to Python's urllib (its user agent);
  the phones' (CFNetwork, okhttp) and curl get 200. 114 requests, about 1 MB gzipped, ~6 s.
- The Arabic's source is credited in the verse sheet too: "Arabic text: Tanzil Project · tanzil.net"
  (`ARABIC_CREDIT`, at the end of the verse), as Tanzil's terms ask.

### QuranEnc's other translations (`lib/quranenc`, Nov 2026)

Every translation in QuranEnc's list (76 in 56 languages, Nov 8 2026), on Saheeh's terms (all 163
translation pages on QuranEnc carry the same seven). The licensing inventory, with Quran.com's 126
translations matched to a source, is `~/Documents/revisely-translations/inventory.md`.
- **The store:** `createQuranEncStore(key)` is Saheeh's code made general: suras kept as read in
  `Documents/translations/<key>/NNN-<version>.json` with `info.json`, the version check, the download.
  `lib/saheeh` is that store for `english_saheeh`. QuranEnc's list is read once a day and one request
  answers for every translation (TRANS-4).
- **The catalogue:** `src/data/quranencCatalogue.json`, from `node scripts/quranenc-catalogue.js`:
  QuranEnc's list as shipped (key, language, direction, version, title, description, size). Ids in the
  app are `qe.<key>`; Saheeh International keeps `en.sahih`. The rules allow any `translationId` of up
  to 40 characters, so new ones need no rules change.
- **Credits:** QuranEnc's own description of each (who translated and issued it), the version of the
  sura shown and QuranEnc.com (TRANS-2). Right-to-left languages read right to left (TRANS-3).
- **Who:** every account gets the picker of every translation (`everyTranslationOffered`, TRANS-5), since
  the November 2026 release; testers only before.
- **The picker** (Majd's design, Nov 8 2026): Translations and Edit, a search over every group, then
  Selected, Favorites (starred, in that order; `lib/translationFavorites`, on the phone per account,
  TRANS-8), Downloaded, and every language. Edit moves or unstars favorites and deletes downloads.
- **Downloads** (`lib/translationDownloads`, TRANS-6): a picker row shows its size, downloads the whole
  translation on any connection (one tap, a few MB; stoppable, carries on), and the bin removes it.
  Saheeh International stays with the offline mushaf. Offline, a translation not on the phone offers
  one that is: the same language, then Saheeh, then any (`fallbackTranslation`, TRANS-7).
- **E2E:** builds fetch nothing, so `src/lib/e2e/demoTranslations.ts` writes Al-Ikhlas in 24
  recorded translations (one per script) and page 604's Arabic, and `revisely://e2e/verse?ref=112:2&t=…`
  opens the real verse sheet. Flow `15-translations` captures each script on both platforms.
- **Not yet:** 87 entries on QuranEnc's website aren't in its list (41 are tafsirs). The 25 that
  Quran.com also has, Russian, Bengali, Malay and Korean among them, publish no version, which the
  terms require: they wait for QuranEnc's answer. Tanzil's translations are non-commercial only. The
  Quran Foundation API (Diyanet, Kuliev, Abdel Haleem…) needs a registered app, a 7-day sync for
  offline copies and a privacy-policy rewrite.
