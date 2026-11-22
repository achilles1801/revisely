# The reader: verse positions, Copy and Share, The Clear Quran, recitation, Qibla, mushaf editions

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

**Verse positions and translations:** press-and-hold on a verse uses `src/data/ayahBounds.json`, built
by `scripts/build-ayah-bounds.py` from Quran Android's `ayahinfo_1024.db`, the glyph bounds that
quran.com-images records while drawing the same page images (coordinates are 1024-wide; the images are
2600×4206, so one scale factor maps them). The app's images are a mirror (GovarJabbar/Quran-PNG)
that doesn't match the glyph data on three pages, so `PAGE_FIT` in the script maps those:
pages 1 and 2 (the decorated openings) are shifted up by 61 and 57 units, and page 3 (a different
rendering, 4.3 MB; its text 7% wider and 3% taller) is x 1.070x − 41, y 1.032y − 9. Without it,
every highlight on page 3 sat high, the words' lower halves below it (fixed Oct 27 2026; the
mistake-detection branch had found the same fit). All 604 pages were measured against their
images; the rest match within a few units. After regenerating, run `scripts/check-ayah-bounds.py`
on the images (its header says how to fetch them): it fails on a page whose boxes miss its ink.
`ayahBounds.test` holds measured ink for pages 3, 4, 50, 300 and 604, and `MushafPager.test` that
a box is the bounds × the page's scale, drawn in the image's own frame, at any phone size. Translations: Saheeh International from QuranEnc.com
(licensed, see Offline mushaf), and The Clear Quran® (Dr. Mustafa Khattab) through our worker (below).
Both are in the privacy policy, with alquran.cloud for the Arabic.

**Copy and Share** (the held-verse menu; `lib/verseShare.ts`): the verse's Arabic, the verse sheet's
own (`getArabicVerse`, alquran.cloud `quran-uthmani`, basmala stripped as the sheet does), then
`﴿ ٥ ﴾` (U+FD3F, Arabic-Indic digits, U+FD3E), all between U+202B and U+202C so it pastes right to
left; a blank line; "Āli-'Imrān, Ayah 5" (the app's `nameDisplay`, which writes ʿayn and hamza as
`'`). The hold has already started loading the text; never loaded and offline, it says so and copies
nothing. Copy uses React Native's own Clipboard module through `TurboModuleRegistry`
(`lib/clipboard.ts`): it is in every build, while `expo-clipboard` would be a native change. Every
page of this mushaf ends at the end of a verse, so a held verse is always whole on its page.

**The Clear Quran® (licensed):** the publisher (Al-Furqaan Foundation, info@theclearquran.org)
requires the credit "The Clear Quran® by Dr. Mustafa Khattab" + theclearquran.org wherever it is
shown (pinned under the verse; in the picker), the text exactly as the API gives it (footnote markers
`<footnote id number>` are shown as raised numbers, nothing else is changed), and never another
translation under its name (errors show "Couldn't load translation" + retry). Plan: Basic, 10,000
requests a month, 5 a second; the docs also say 60 a minute and 1,000 an hour. The terms live in the
developer agreement signed in their portal (theclearquran.org/developers).

**Keeping its text (long-lived caches):** neither the terms nor the public docs address caching or
storing the text. On 2026-10-27 the owner decided to cache it for a long time and accepted that risk.
If Furqaan objects, dial back as below. Text is cached only as read (plus the next-block prefetch),
never the whole Qur'an in advance, and always exactly as the API gave it, credit unchanged.
- **Worker:** a block is fresh for `TCQ_EDGE_CACHE_SECONDS` (30 days), then served for
  `TCQ_EDGE_STALE_SECONDS` more (30 days) while a background request refreshes it (one per isolate,
  counted in the budgets). Cloudflare's Cache API keeps it per data centre and may evict it sooner.
- **Phone:** `src/lib/clearQuran.ts` keeps each block in `Library/Caches/tcq/` (the app's private
  cache folder: not backed up, not visible in Files, never shared; iOS may clear it). It is shown at
  once while fresh (`TCQ_DEVICE_CACHE_SECONDS`, 30 days), then still shown, even offline, while it
  is fetched again for `TCQ_DEVICE_STALE_SECONDS` more (30 days). The app asks the worker for these
  (`GET /api/tcq/policy`, public) once a launch and every 6 hours; until it has an answer it uses
  `CLEAR_QURAN_DEVICE_CACHE` (the same 30 + 30 days).
- **To dial back:** change those vars in `wrangler.jsonc` (a PR into `main`; Workers Builds deploys
  it) and they apply at once to everything already cached. 0 turns caching off, and phones delete
  their copies at their next launch. In an emergency, change the vars in the dashboard (Workers &
  Pages → revisely → Settings → Variables), then make the same change in `wrangler.jsonc`, or the
  next deploy from `main` restores the old values.
- **To delete every copy:** change `TCQ_CACHE_VERSION`. It is part of every edge cache key, and phones
  delete theirs when they see the new version. `CLEAR_QURAN_DEVICE_CACHE.version` in the app does the
  same for phones, once that update reaches them.

**Its speed:** The Clear Quran answers a request in 1.6–5.3 s (Supabase edge functions in us-east-2;
measured Oct 27 2026, ~95% of a verse's load time), so the text comes in blocks: the worker asks
for 30 verses at once (the documented maximum), aligned 1–30, 31–60, … per surah, and the app
keeps the block (in memory, and on the phone as above). A press and hold starts loading (before
Translation is tapped), and the sheet fetches the next or previous block when the verse shown is two
from its edge
(`prefetchClearQuranAround`), so ‹ › are instant and a block costs one request of the plan. A verse
already in memory is shown in the first frame (`peekVerseText`), with no spinner.

**Recitation and Audio Options** (`components/reader/PlayerCapsule`, `verse/AudioOptionsSheet`,
`reader/SpeedMenu`, `lib/recitation.ts`, `lib/playbackPlan.ts`, `lib/audioOptions.ts`):
- While a verse plays, the bar is ■, the speed chip (a menu of 2× … 0.25×), ⏪ ⏸ ⏩ and the
  options icon; idle, it is ▶ (the page), the reciter and the options icon. The verse playing is
  highlighted on the page (no verse label in the bar) and the page turns with it.
- Audio Options: reciter, speed, From and To (two wheels each; To is never before From), Play up to
  (Page, Surah, Juz', Custom: where To lands), Repeat (Loop, 1–10×) and Pause after each verse (Off,
  0.5–2× the verse's length at the current speed). There is deliberately no "Play set of verses".
  ▶ in its header plays From–To. ⏪ ⏩ stay inside the range, and the range inside the screen's pages.
- Speed, repeat, pause and Play up to are kept per account on the phone
  (`@revisely_audio_options:<uid>`), not synced: a synced field needs the user-doc allowlist and a
  rules deploy first. The reciter stays on the user doc. A Custom To lasts until the app restarts.
- The rules are pure functions in `playbackPlan.ts`, tested there and in `recitation.test.ts` with
  fake timers. A repeat replays the verse with `replace` (it may fetch it again). The pause waits
  `duration / speed × factor`; Pause during it holds the next step, and leaving the app pauses as
  before. Speed is `setPlaybackRate(speed, 'high')` with `shouldCorrectPitch`.
- **App-wide and in the background** (runtime `bdc5b27…`, build 26 on, Oct 28 2026): recitation
  goes on wherever the user goes, with the app in the background and the phone locked
  (`UIBackgroundModes: audio` in app.config; `shouldPlayInBackground` in `lib/audioFocus`).
  - Leaving a screen no longer stops it. The focused screen whose pages hold the verse playing
    `adopt`s it (its player bar, highlight and page turns follow) and "presents" it
    (`lib/nowPlaying`); anywhere else the **mini player** (`components/player/MiniPlayer`) sits
    above the tab bar: ▶/❚❚, "Al-Baqarah 2:13 · reciter", ✕ to stop, › to the reader at that page
    (`navigation/openReader`). It hides with the tab bar (the reader and the session show the
    recitation in their own bar), and `useTabBarFootprint` adds its height so lists clear it.
    Signing out stops it. The range (From–To) lives in the engine (`getRange`).
  - Lock screen and Control Center: Now Playing (verse, reciter, "Revisely", the app icon via
    `lib/nowPlayingArtwork`) with play/pause and the scrubber, through expo-audio's
    `setActiveForLockScreen`. Previous and next come from a local module,
    `modules/now-playing-commands` (expo-audio 1.1 has no track commands): it enables
    `MPRemoteCommandCenter`'s previous/next track while the recitation is on the lock screen and sends
    `onRemoteCommand`; the engine's `skip` steps a verse back or on within the range (or the juz). It is
    null on binaries without it, so the JS is safe on older builds.
  - iOS pauses it for a call, Siri or unplugged headphones and resumes it after an interruption;
    the engine follows the player (`onStatus`: paused and playing from outside). The pause after a
    verse plays a looped second of silence (`assets/audio/silence.m4a`): with nothing playing, iOS
    suspends a backgrounded app and the next verse would never come.
  - A recording's playback stays in the foreground (`RecordingsList` pauses it when the app leaves);
    recording itself is unchanged.
  - The simulator's dev client predates the key, so it can't show background play: check on a
    TestFlight build.
  - **Android's notification could outlive its service** (expo-audio 1.1's
    `AudioControlsService`; a closed tester's Samsung, Nov 3 2026; reproduced on an emulator Nov 4
    and again Nov 6). Swiping the app away from recents makes Media3's `onTaskRemoved` pause the
    player and stop the service. expo-audio's paused post landed after the system had removed the
    service's notification, leaving a notification that can't be swiped away (`NO_CLEAR`), for a
    dead session: no buttons, a still progress bar, and it outlives the app. The screens then
    unmount and `MainNavigator` stops the recitation; `setActiveForLockScreen(false)` started the
    dead service again with nothing to show, and Android killed the app 30 s later
    (`ForegroundServiceDidNotStartInTimeException`).
    - **Fixed natively from 1.0.4** (`patches/expo-audio+1.1.1.patch`, its header says how): the
      service stops cleanly on `onTaskRemoved` and posts nothing once it is going, uses one
      notification id, is never started only to be cleared, and posts only when what it shows
      changes (expo-audio posted on every player event, often enough for Android to drop posts:
      "Package enqueue rate … Shedding"). It honours Media3's foreground decision: a paused
      notification leaves the foreground after `PAUSED_FOREGROUND_MS` (60 s), which ends the
      foreground service and, on Android 12 and earlier, lets it be swiped away. On 13+ it lives in
      the media control, which "Hide" puts away at any time (Android 15 marks every MediaStyle
      notification `NO_CLEAR`, so Clear all skips it; that isn't ours to change). Put away, its
      session stays, and playing again brings it back (AUDIO-3). Resuming from the media control
      with the app away restarts the foreground service (Android allows it for media session
      commands). Between verses (the
      player ended, still set to play) and while a call holds it (up to 10 minutes) it stays in the
      foreground, so the next verse can start from the background. Android's "Hide" on a media
      control (13+) sends stop, which unloaded the verse (▶ in the app then played nothing, on
      every binary before 1.0.4): the session's player takes stop as pause, and the app reloads a
      verse whose player went idle from outside anyway. The patched module says so:
      `AudioModule.reviselyMediaControls` (2: also previous and next, below) and each player's
      `reviselyIsActiveForLockScreen`.
    - **Binaries before 1.0.4** keep the JS workaround (`lib/recitation`, `lib/mediaNotification`):
      on Android it frees its player (`remove()` + `release()`) instead of
      `setActiveForLockScreen(false)`, and dismisses any media notification still on show once it
      has let go of the lock screen: right after a stop, at launch and when the app comes back
      (with the app away React Native's timers stand still on Android, so after a stop it reads
      again and again for 2 s). Coming back, it pauses a recitation whose notification has lost its
      service, so ▶ starts a new player and notification. On a patched binary
      (`mediaControlsLevel() >= 1`) the sweeps after a stop are skipped, and coming back it asks the
      player instead of guessing from what is on show (a swiped-away paused notification is not a
      lost one); the launch check stays, for leftovers from an older binary.
    - **The artwork** must be a URL: an Android release build's bundled icon is a drawable named
      `assets_icon`, and expo-audio rejected every call carrying it, so the notification kept the
      first verse's title and a recitation started after a stop had none at all (no foreground
      service either). `lib/nowPlayingArtwork` passes only a URL with a scheme (Nov 6 2026).
- `v2/WheelPicker`'s `contentOffset` is where it starts, set once. Changing it after mount moved
  the wheel a second row on a phone (a test covers it). Maestro can't tap a wheel's rows by id (the
  wheel is one adjustable element for VoiceOver): tap by point. Maestro takes whole-number
  percentages only; `"26.5%"` throws an exception that a grep for `FAILED` misses.

**The athan** (Revisely Dev, iPhone; Majd, Nov 22 2026: "genuine adthan notifications like the athan actually
playing … the most popular widely known ones"; BEHAVIOUR.md ATHAN-1 to ATHAN-3): a prayer's notification sound can be
the athan.
- **History:** built on Oct 28–29 2026 (#124, #125, #133) and removed a day later (2216ecf6, Majd: "All the athans
  suck"; its voices were chosen for clear licences). Nov 22's version is that code restored, without a bundled voice,
  for the well-known recordings. Majd accepted the licensing risk; a voice can be withdrawn from the catalogue.
- **iPhone's limit:** a notification sound is at most 30 seconds (a longer file plays the default tone). So a
  notification plays a voice's first 29.5 s (`notif/<id>.caf`), and the whole athan only plays in the app.
- **How:** `lib/athan` reads a catalogue (`catalog.json` beside the audio, at `ATHAN_BASE_URL`: the dev project's public
  Storage folder `athan/`) and downloads a chosen voice's clip into the app's `Library/Sounds`, where iOS looks a
  notification's sound up by name. JavaScript only: no native build. `athanEnabled()` is the gate (Revisely Dev and iOS).
- **Never quiet:** no voice chosen, a clip not downloaded yet, removed or withdrawn, or the gate off: the standard tone
  (`lib/prayer/sync` `iosSound`). A reminder before a prayer is never the athan.
- **Choosing:** Settings → Prayer → Athan voice (every prayer), or a prayer's Sound → Athan → Voice (that prayer; the
  picker's `prayer` param). Fajr takes the voice's Fajr athan (`lib/prayer/athanChoice`).
- **Android** takes a notification's sound from its channel, and expo-notifications gives a channel only sounds built
  into the app (the plugin's `sounds` in app.config.js, which moves both fingerprints). That, and a channel per voice
  (a channel's sound is fixed once made), wait for a native build (the 1.0.6 list).
- **The audio pipeline** is outside the repository: `~/Documents/revisely-athan` (`build_athan.py` cuts, fades and
  levels the 29.5 s clip and the full copy; `RESULTS.md`).

**Qibla** (Oct 28 2026; mocks and notes in `~/Documents/revisely-qibla-mocks/`): a compass icon in
Home's top bar (left of Activity and Settings; `TopBar`'s `sideWidth` 120 keeps the salam centred)
opens `qibla/QiblaSheet`, a `v2/Sheet` (drag to close, Done).
- `lib/qibla.ts` is the pure part: the initial great-circle bearing to the Kaaba (21.4225°N,
  39.8262°E) from **true** north, haversine distance, where it is relative to the phone
  (−180…180, right positive), facing it at ±3° and no longer past ±5°, and the nearest city from
  `src/data/cities.json` (~465 major cities, coordinates rounded to 0.01°) within 150 km. No reverse
  geocoding: nothing leaves the phone.
- `qibla/useQibla`: permission when it opens (in-app explanation → `requestForegroundPermissionsAsync`;
  refused and not askable → Open Settings), the last known position then a fresh one, and
  `watchHeadingAsync` only while the sheet is open and the app in front. It uses `trueHeading`; −1
  (no true heading yet) or no compass shows the bearing as text ("119° from north"), never a
  magnetic guess. Readings are smoothed on the circle. Accuracy ≤ 1 for a second asks for a figure 8;
  "Facing the Qibla" (and one light haptic) needs accuracy ≥ 2. Positions and headings are never
  stored, sent or logged.
- `qibla/QiblaDial` draws the mocks: the dial turns on the UI thread (the shorter way), the letters
  and the Kaaba stay upright, the Kaaba and its tick in `done`/`doneText`, a glow when facing it.
  `qiblaView` picks the state; `QiblaContent` renders one, which is how to show a state on the
  simulator (it has no compass).
- The location purpose string names prayer times, the Qibla and Fajr, and `expo-location` is SDK 54's
  ~19.0.8, both in the 1.0.3 store builds (see "Widgets", Location). The compass itself is JS.
- Privacy: the policy's Location item says the compass works on the device only. No App Privacy
  change (nothing is collected).

**Third-party content:** Qur'an page images are renderings of the Madani Mushaf made with the King
Fahd Complex fonts (open-source quran.com-images). They are served from the Storage bucket at
`mushaf/001.png` ... `mushaf/604.png` (public, immutable; `src/lib/quranImages.ts`). If App Review
asks about rights to them, that is the answer; the Qur'an text itself is public domain. The 1441
print's pages (below) are drawn from the King Fahd Complex's own vector files, which its rights page
(dm.qurancomplex.gov.sa/rights/) lets anyone use free, in apps too.

**Mushaf editions** (Settings → Mushaf and Recite → Mushaf, `lib/mushafEdition`, `components/mushaf/MushafPickerSheet`;
Nov 3 2026): the 1405 pages (the default) or the King Fahd Complex's **Madani 1441** print. The
choice is kept per phone (`@revisely_mushaf_edition:v1`), not on the account.
- **Page numbers are shared.** 568 pages hold the same verses in both; the other 36 come in runs
  (120–123, 144–145, 531–534, 564–565, 567–570, 575–576, 583–600) that begin and end on the same
  verses, and every surah and juz starts on the same page (`ayahBounds1441.test` checks all of it).
  So plans, sessions, memorized pages and Home stay on one numbering and nothing is mapped; only
  what the reader draws and its verse lookups follow the edition: `ayahBounds` (`boundsFile`,
  `versesOnPage`, `ayahRects`, `ayahAt`), `verses.pageOfVerse`, `firstSurahOnPage` (the reader's
  header: 1441 page 586 begins in 'Abasa), the page aspect (`pageFit`). `quranData`'s tables stay
  1405's.
- **Images:** `scripts/build-mushaf-1441.py` renders `1441-AI-hafs.zip` (one Illustrator/PDF file a
  page, with layers for the text, the verse numbers, the ornaments and the running heads) inside the
  frame: a 254.4 × 410.4 pt window (aspect 0.620), without running heads or page numbers, as ink alpha
  like the 1405 pages (the green discs and header boxes become a light 17%, so the dark tint works).
  `mushaf/1441/w1080/` (111 MB) and `mushaf/1441/w1440/` (153 MB; iOS uses it, there are no
  originals), 32-level palette PNGs. Uploaded with `upload-mushaf-variants.js --prefix 1441`, sizes
  in `mushafSizes.json` (`1441/w1080`, `1441/w1440`). Immutable: changed pages need a new folder.
- **Verse boxes:** `src/data/ayahBounds1441.json`, same format and 1024-wide space, measured from the
  pages (15 rows 26.93 pt apart; pages 1–2 have 7; the green marker discs split each line; headers and
  the basmala skipped). The verses come in order from `scripts/mushaf1441-page-starts.json`; the build
  fails on any page whose discs and verses don't match one for one (all 604 match).
- **On the phone:** `Documents/mushaf/1441/<set>/`; `pageCache` keys everything by edition, and the
  offline download follows the edition chosen. The other print's pages stay (switching back is
  instant) until removed in the picker. "Remove from this phone" under Offline mushaf removes both.
- Recite needs line and word data, which only the 1405 pages have: with the 1441 print the mic is the plain record
  button (`MushafEdition.reciteData`).
- **The picker** is a row per print (thumbnail, name, "On this phone" / "n of 604 pages" / "153 MB to
  download", a check) and one credit line per publisher (`mushafCredits`; both prints are the King
  Fahd Complex's, so one line). No explanations: the owner had the page-numbers note removed (Nov 3
  2026). A Tajweed (Dar al-Maʿrifah) print waits on permission from the publisher and Quran.com
  (being asked, Nov 2026); it would be another edition with its own folder and credit.
