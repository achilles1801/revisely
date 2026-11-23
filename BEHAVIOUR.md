# Revisely: how it behaves

Every rule the app keeps for its users, each with an id. A test that checks a rule names the id in
its title, in square brackets: `it('[DAY-2] before Fajr, Home still shows yesterday', …)`. CI runs
`node tests/scenarios/check-spec.js`, which fails when a rule has no test, or a test names an id
that isn't here.

**Every bug fix adds a scenario** under `tests/scenarios/scenarios/` that fails without the fix, and
names the rule it breaks. A new rule gets a line here in the same PR. A rule that changes on
purpose changes here first, then in its tests.

How the tests are made: `tests/scenarios/README.md`.

- Scenario tests run the app's own code: the providers, the offline copy and outbox, Home and the
  session screen, and Firebase. The real security rules run in the emulators. The clock and the
  time zone are set by the scenario.
- Property tests (`tests/scenarios/properties/`) check the schedule and day rules over thousands of
  generated cases.
- `KNOWN BUG` marks a test for a broken rule (`it.failing`). It passes while the bug stands and
  fails once it is fixed; the fix then turns it into an ordinary test.

## The revision day

- **DAY-1.** With the Fajr boundary off, the revision day is the calendar day. It changes at local
  midnight.
- **DAY-2.** With the boundary on, the revision day changes at Fajr: the Fajr the Prayer sheet shows,
  for the saved location. From midnight until Fajr it is still the day before. A day's prayers are the
  ones whose Dhuhr falls on it, near the date line too.
- **DAY-3.** Tomorrow is the revision day + 1, never the calendar day + 1. This holds for Home's
  "Tomorrow starts at", the end card's "Next" and Keep going.
- **DAY-4.** A session keeps the revision day it opened on: it is saved to that day even when Fajr or
  midnight passes while it is open.
- **DAY-5.** Coming back to the app (from the background, or a screen left open overnight) shows the
  revision day it is now.
- **DAY-6.** Every time zone works the same, from UTC−12 to UTC+14, half-hour and 45-minute ones
  included. A daylight-saving change never repeats or skips a day of the schedule.
- **DAY-7.** A plan made before Fajr (boundary on) starts on that revision day: its first day is the
  day the user is in, not the calendar day.
- **DAY-8.** Wherever the phone is, and whatever location is saved, the revision day moves on one day at
  a time. It turns at the Fajr of that morning (or at midnight), and no day is skipped or repeated.
- **DAY-9.** Activity shows everything on the revision day it was done: sessions, pages revised ahead,
  daily-log notes, timed readings and recordings. Something done between midnight and Fajr (boundary
  on) shows on the day before, with no other weekday named, and nothing shows on a day that hasn't
  started. Pages revised ahead still count for the day they're scheduled on (AHEAD-2), on Home and in
  the schedule, but Activity lists them on the day they were revised.

## Onboarding

- **ONBOARD-1.** In "Select memorized portions", a page the user marks counts at once, loaded or not: a
  new account's 604 pages reach the phone once the server holds them (sign-up writes them in two
  batches, 1–450 and 451–604), and a juz can be marked before its pages land. Continue never saves a selection without a marked page: while a marked page
  hasn't loaded, it waits ("Loading your pages…"), and once the pages are there it saves them all.
- **ONBOARD-2.** An account the server holds with some of its pages but not all 604 (a sign-up stopped
  between its two batches: the app closed, the second commit failed) gets the missing ones created, as
  new pages, once the app has the server's list and isn't writing them itself. A page it already has is
  never replaced.

## The schedule

- **SCHED-1.** Pages plan: N pages a day in page order, from the plan's first day, wrapping round the
  memorized pages. Each memorized page comes round once a cycle, and every day has N pages (or all
  of them, when fewer are memorized).
- **SCHED-2.** Juz plan: N juz a day, each day's pages being the memorized pages of its juz.
- **SCHED-3.** Custom plan (the plan editor): its days in order, from the day it was saved, looping.
- **SCHED-4.** A reverse plan goes from the end of the memorized pages to the start, covering the
  same pages.
- **SCHED-5.** The schedule doesn't move by itself. Days without a session don't pile up: the app
  opened after missed days shows that day's pages.
- **SCHED-6.** A day never holds the same page twice. A plan with a page on two neighbouring days,
  shifted by a carry-over, takes that page once and the next page after it.
- **SCHED-7.** Edit schedule's header says how much a day ("10 pages a day") and how often each page comes round
  ("Every page comes round every 11 days"), never "Automatic" or "Custom plan" (Majd chose the audit's option A, a
  tidy-up, Nov 22 2026: "for edit schedule let's do option A (tidy up) for now"); a named plan shows its name above.
  "Daily amount" is the first row under it. A saved plan loaded and saved keeps its name (on every phone), and so does
  an edit of it. "Save current plan…" (in Saved plans) on a custom plan names it too (at once when it has no
  unsaved edits, with the next Save when it has). A plan made with "Create new plan" has no name. On the automatic
  schedule, saving a copy only keeps a copy. A saved plan is a copy: editing the plan in use doesn't change it, and
  deleting it doesn't rename the plan in use. With a custom plan, "Daily amount" says the plan's days stay as they are.

## A revision session

- **SESS-1.** Swiping off a page marks it revised, the last page by swiping onto the end card. The
  check marks or unmarks the page on screen.
- **SESS-2.** A day is done when all its pages are credited to it. Home then says Done, and the streak
  counts the day. The streak counts back from
  today if today is done, else from yesterday, so it stays alive until today's revision day ends. Home, the
  widget and the reminders share this rule (lib/streak). The Dashboard, the widget and the reminders read it from the Activity items
  (the last 400 days) once they load (lib/streakFromItems); the logs answer until then. An item counts as on time
  when it was written before its grace window ended (SESS-6): the end of the revision day after its own, at the
  Fajr that starts the day after that with the boundary on (so 00:30 before that Fajr is still the day before),
  midnight otherwise.
- **SESS-6.** A missed day keeps a grace window. When yesterday is missed (not all its scheduled pages credited to it)
  but the run before it is intact, the streak reads as broken and the widget and Home show the streak dimmed, with a
  ring for the missed pages. Revising yesterday's missed pages, credited to yesterday, restores the streak at once,
  and only pages of the missed day count (today's own pages don't). The grace is recoverable until today's revision
  day ends, and repeats any day a day is missed. A day restored in its grace window counts as on time from then on:
  the streak it brought back is still there the next day, and single missed days, each caught up the day after,
  keep the run going (Majd, Nov 7 2026). Two missed days in a row break the streak; a day done after its grace
  window counts itself but does not restore the run behind it, and older days can still be revised, credited to
  their own days.
- **SESS-7.** A catch-up page (one carried in from a missed or unfinished day) is credited to the day it was
  scheduled for, not to today. It never counts toward today's completion while today has pages of its own: today
  is done when today's own pages are credited to today. In shift mode (CARRY-2) today's own pages are what is left
  of its usual size after the carried pages. When the carried pages fill the day it has none, and it is done when
  its carried pages are revised, still credited to the days they were missed (Majd, Nov 7 2026). Each carried page
  keeps its source day in the carry (`carryOver.from`). A session saves a catch-up page under the ahead credit of
  its own day, and out of its own pagesRevised.
- **SESS-3.** Leaving the session (Back) saves what was marked. Nothing marked: nothing is saved.
- **SESS-4.** Home's "Done · N pages" counts the pages done that day, its own and the ones revised
  ahead in its sessions, and Review session opens exactly those (#199): the day's own pages first,
  in the day's order, then the pages revised ahead, the earliest later day first (Nov 5 2026).
  A day done only by pages revised ahead (no session of its own) still opens its review with those
  pages checked; saving it makes that day's session.
- **SESS-5.** On the juz plan, a session whose pages revised for its own day are whole juz (one, or
  several in a row) is named by the juz, "Juz 29" or "Juz 28–29", wherever sessions are listed (Home,
  Activity); pages credited ahead to another day don't count toward it. Any other session, a juz
  with a page not revised, or whole juz with other pages besides, is named by its surahs.
- **SESS-8.** (Revisely Dev) Asking for a rating, never annoying and never every time (Majd, Nov 21 2026). When a swipe
  finishes a day's revision and the streak is 7 days or more (the day just finished counted), the end card adds one
  quiet line, "Enjoying Revisely? Rate it ›", with a ✕ ("Don't ask again"). The line opens the App Store's Write a
  Review page (Revisely's Google Play listing on Android). A phone asks at most 3 times ever, 120 days apart (a line
  shown counts as asked, tapped or not), never for an account under 7 days old, and stops for good once the line is
  tapped or dismissed, or Settings → Help and support → Rate Revisely is used (that row opens the same page at any time). The same
  for everyone: no stars asked for, no reward, nothing that sends unhappy users anywhere else. The stores' own in-app
  prompt needs a native module and waits for the next native release (lib/rateAsk).

## Revising ahead

- **AHEAD-1.** Once today is done, Home offers the next revision day ("Tomorrow starts at …"), from its
  first page not done yet. Tapping it opens that day's pages alone, as if it were that day's session:
  today's pages are not behind them (Nov 5 2026). The next day's pages already done are left out
  (#198). After Keep daily amount filled today with leftovers (CARRY-2), the next day starts with
  today's own pages.
- **AHEAD-2.** A page revised ahead counts for the day it is scheduled on, not the day it was revised.
  That day then needs only the pages left, and is done when none are.
- **AHEAD-3.** The end card's Keep going goes on to the next revision day's pages not done yet, which
  the session then holds alone (the day before is not behind them). Done again, it goes on to the day
  after. It never stops at the end of a cycle: once every day of the cycle is done (ahead or not), it
  goes on into the next cycle and on through it, on every plan. Those pages count for the next cycle's
  days (AHEAD-2) on their own dates; when the plan starts doesn't move, and recency still counts them
  on the day they were revised (AHEAD-6). A day that repeats pages the session already holds (the
  cycle has come round) starts a new round: the session holds that day alone, its pages unchecked, and
  today keeps its own revision of them (unchecking one in the round takes back only its credit to that
  day). One revision counts for one day. Activity and Insights show those pages on the day they were
  revised (DAY-9, AHEAD-6): the day's own pages stay done there, each later day it counted for is
  named ("Ahead for Monday 9 November: …"), and Coverage counts them. Home's line goes on the same
  way, "Next cycle starts at Al-Fatihah ›" for a day that begins the plan again, and a day a week or
  more away is named with its date ("Mon 16 Nov"). Mark in bulk works on the day on screen. (Majd, Nov
  9 2026: "it should restart the cycle if they finish it before their cycle ends so for example if my
  cycle is one week and i procrastinated all my revision for today and kept revising ahead until that
  one week is done, my next revise ahead would just be restarting the cycle." It used to stop at the
  end of the cycle.)
- **AHEAD-4.** A day already done ahead is passed over: Keep going and Home's next line go to the day
  after it (the owner's rule, #198).
- **AHEAD-5.** A page is credited ahead only when it was revised in that session (checked or swiped).
- **AHEAD-6.** A page revised ahead (Keep going) or caught up is revised on the day it was revised, wherever
  recency shows: Coverage's figure, its Juz, Surah and Page views and the untouched row, the juz sheet (its
  strip, headline and days), Pages by strength and Revo. Only the schedule credits it to the day it is
  planned on (AHEAD-2) or was missed on (SESS-7). (Majd, Nov 9 2026: "when i revise ahead, does that show up
  in coverage because i don't see it?" Coverage read the credited day and skipped a credit for a later day.)

## Carrying pages over

- **CARRY-1.** Pages left over from the last three revision days are offered on Home, once a day, as
  one line above today's action with "Add to today" beneath it: "Left yesterday · Revise Al-Baqarah
  6–29" for a day started and not finished, "Missed yesterday · Revise Al-Fatihah to Al-Baqarah" for a
  day with no session, and "Missed 3 days · Revise …" when several days come to more than one (the
  pages named by their surahs, NAME-1). Earlier days are not offered.
  A page revised at any point in those days is never offered, whichever day the schedule had it on.
- **CARRY-2.** Keep daily amount (`shift`, the default): today keeps its size. The leftovers come
  first, and the rest of the plan slides back by as many pages. With as many leftovers as today holds or
  more, today is the leftovers alone, all of them, and the whole of today's plan moves on a day: revising
  them finishes today (SESS-7), and today's own pages, the next day's now, are revised ahead (AHEAD-1,
  AHEAD-3) if the user wants them (Majd, Nov 7 2026: "let it be missed pages only").
- **CARRY-3.** Add (`add`): the leftovers go on top of today's pages, and nothing else moves.
- **CARRY-4.** A missed day (no session) is offered like the rest, but not added: nothing moves until the
  user taps "Add to today". Adding makes them today's pages; if they are still unrevised the day after,
  they are offered again. (Changed Nov 2026: a missed day used to vanish.)
- **CARRY-5.** Saving an edit to the plan (not a new plan) leaves today's pages as they are, unless
  the edit changes today itself.

## Jump to…

- **JUMP-1.** Jump to… starts today at the chosen juz, surah or page, earlier or later than today's
  start, and the days after carry on from it. The start moves at once.
- **JUMP-2.** The session holds today's pages from that start. Pages behind it are not in the session.
- **JUMP-3.** A jump drops pages carried into today that are not yet revised: they were the old start's.
  Pages revised in today's own session stay counted and go first. Pages revised ahead for today from an
  earlier day are dropped too, and a jump leaves no carry-over offered for today. (Changed Nov 2026: a
  carry kept the old start in place, so Jump to an earlier juz did nothing. Changed Nov 5 2026: pages
  revised ahead for today came back in front of the new start, and a leftover offer made after the jump
  was added in front of it: Jump to p. 1 showed pages 236–240 first.)

## Reminders

The revision reminders are local notifications that the phone schedules while the app runs
(`lib/reminders`, `components/RevisionRemindersSync`). Their plan is made again each time the app opens,
comes back to the front, saves a session or changes the plan. Onboarding's Start asks for notification
permission when "Daily reminders" is on, and a no saves reminders off.

- **REMIND-1.** While today's revision isn't done, up to three a day: 8:00 AM, 20 minutes after Asr at
  the prayer place (3:00 PM without one), and an hour before the revision day ends (quiet between
  midnight and Fajr). Two due within 30 minutes become one. Once today is done, the rest of today's go,
  and the next becomes one quiet congratulation. Tomorrow gets the same three.
- **REMIND-2.** (Revisely Dev) Someone who doesn't open the app still gets one reminder a day, at the morning time,
  on each day after tomorrow, for a week counting the day the app was last open. It names where that day's
  revision is, in words that change from one day to the next, and is never a second reminder on a day. Then they stop until
  it's opened again, which plans the week again from that day. In the store app, until its switch is
  on (`lib/release/remindersWhileAway`), only today and tomorrow are planned, so someone who doesn't open
  the app on their second day hears nothing more.
- **REMIND-3.** None is scheduled while the phone doesn't allow notifications, or while reminders are
  off in Settings. Allowed later in the phone's Settings, they're planned once the app is back in front.
- **REMIND-4.** Home asks for notification permission only for an account with reminders on whose phone
  hasn't been asked yet (signed in on a new phone, a reinstall, or reminders turned on in Settings), and
  never asks again once answered. With reminders off, nothing asks. (Changed Nov 2026: the app asked on
  every launch, so a fresh install asked on its first screen, before sign-in; a no there turned reminders
  off at onboarding. Home asked again even with reminders off, and a yes there didn't turn them on.)
- **REMIND-5.** (Revisely Dev) In Settings → Reminders, "Revision reminders" shows on only while reminders can come.
  While the phone refuses Revisely's notifications, it shows off and says so ("Off in your phone's
  Settings"), and turning it on offers Open Settings instead of a switch that does nothing. Allowed there
  and back in the app, it shows on again if reminders were on. Turned on with the phone not asked yet, it
  asks, and a no leaves it off. (In the store app, until the reminders-while-away switch is on, the switch
  shows the account's choice whatever the phone allows.)

## The athan (Revisely Dev)

On iPhone only, until a version with the athan's sounds built in (Android plays a notification's sound from sounds
inside the app). Majd, Nov 22 2026: "genuine adthan notifications like the athan actually playing instead of our
current basic sounds". October 2026's version was removed for the voices it offered.

- **ATHAN-1.** A prayer's notification sound can be the athan: at the prayer's time its voice's athan plays, as far
  as an iPhone notification can play one (its first 30 seconds). A reminder before the prayer keeps the standard
  tone. Silent mode and Focus are the phone's, as for any notification.
- **ATHAN-2.** A voice is chosen for every prayer at once (Settings → Prayer → Athan voice), which leaves which
  prayers play the athan as they are, or for one prayer from its sound, which sets that prayer to the athan. A
  prayer's sound is reached from Prayer notifications and from the prayer sheet's times (a prayer's row). Fajr
  takes the voice's own Fajr athan when the voice has one. The voices are one list (Majd, Nov 23 2026: "there
  should be just one consolidated list for all the athan options people can choose from"): every voice in it can
  be chosen, and a row shows the voice's name and its size only. A Fajr athan with no voice of its own style is
  in the list as Fajr's alone: chosen for every prayer it changes Fajr only, and a picker opened from another
  prayer leaves it out.
- **ATHAN-3.** A prayer's notification never goes quiet for the athan's sake. Until its voice has downloaded, after
  it is removed or withdrawn, with no voice chosen, and wherever the athan isn't offered (the store app, Android), a
  prayer set to the athan plays the standard tone.
- **ATHAN-4.** A tap on a prayer's notification that played the athan, within 15 minutes of it, opens the app and
  plays that voice's whole athan from its start, under a sheet with Stop. It stops at its end, on Stop or the sheet
  closing, when other audio starts, and when the app goes to the background. A later tap, a notification that played
  the standard tone, a reminder's, and a voice no longer offered play nothing: the app just opens.

## Al-Kahf on Friday

- **KAHF-1.** The Al-Kahf card (Settings → Reminders → "Friday Al-Kahf reminder", on by default) is on Home
  for the Islamic Friday: from Thursday's maghrib to Friday's maghrib, where the user is. Maghrib is the Prayer
  sheet's, for the place its times are worked out for (the phone's last position, else the saved Fajr location).
  With neither, the city the phone's time zone is named after stands in when the bundled city list has it
  (Chicago for America/Chicago), else 18:00 on the phone's clock. Nothing asks for the location for it. On
  Thursday evening the card says Friday began at maghrib. It comes and goes on time with Home left open, and on
  coming back to the app. (Changed Nov 21 2026, Majd: it followed the revision day, so it showed on Friday evening
  after maghrib and never on Thursday evening.)
- **KAHF-2.** Al-Kahf read inside that window counts for that Friday: "Mark as read", or every page of it in
  readings that ended inside it (the reader's timer), with the pages revised on Friday's own revision day. Read on
  Thursday evening, the card shows it as done on Friday morning. Read on Thursday before maghrib, it doesn't count.
  Activity still shows each reading on the revision day it was done (DAY-9): a Thursday-evening reading is on
  Thursday.
- **KAHF-3.** "Not today" hides the card until that Friday's maghrib, from Thursday evening too.

## The daily log

- **LOG-1.** Every note added to a day's log stays, each as its own entry with its text; adding one
  never replaces another.
- **LOG-2.** Editing a note changes only that note; deleting one removes only it. Both reach every
  phone.
- **LOG-3.** A note written between midnight and Fajr (boundary on) belongs to the revision day.
- **LOG-4.** The log writes what is added at once: a note or a revised portion shows as soon as it is sent, stays
  while the server catches up, and the first note of a day shows without leaving the log.

## Offline, devices and accounts

- **SYNC-1.** Offline, the app works from the copy on the phone. Changes reach the server, in order,
  once it is back online.
- **SYNC-2.** A cold start offline shows the account as it was last seen, with the changes made
  offline.
- **SYNC-3.** Another device signed in to the account sees the changes once they have synced.
- **SYNC-4.** A new account loads right after sign-up, with no relaunch.
- **RESET-1.** After the owner resets an account (`functions/scripts/reset-account.js`), every phone
  shows it as new. A change a phone made offline before the reset never reaches the server.
- **RESET-2.** A tester (`previewTester`) can reset their own data from Settings (Reset my data, typed
  RESET): a backup only the owner can read is taken first, then the account is as new, onboarding
  next, still signed in, with nothing of before on the phone. No other account can, and not again
  within 10 minutes. While the server resets it, the phone doesn't listen to the account (its user
  document, pages and sessions), and reads it afresh once the server has answered.
- **RESET-3.** A tester can load a test scenario from Settings (Load test scenario, typed RESET): the
  account is reset as in RESET-2 (the same backup first) and filled with the scenario, on the revision
  days this phone shows (its zone, clock and Fajr). Every rule above that can be read off an account
  holds for each scenario, and the phone shows it with no relaunch. No other account can, and not
  again within 2 minutes (30 a day). Settings offers three (Majd, Nov 17 2026: "3 scenarios should be
  sufficient with the most important being a super heavy user with a lot of activity and months of data"):
  Heavy user (seven months: a juz a day, gaps, the daily log, recordings, sittings, over a hundred Recite
  takes with marks, Revo's conversations and memory), Missed yesterday (the streak's grace ring and the
  catch-up) and Getting started (two weeks, Al-Mulk ayah by ayah, the first takes). The older, narrow
  scenarios stay loadable for the automated tests; their Offline queue holds its changes on the phone until
  "Send held changes" (or the next start of the app), then sends them in order.
- **ACCOUNT-1.** Delete account (Settings → Account, confirmed twice) removes the account from the server with everything of it
  (pages, sessions, notes, Revo's and the coach's data, backed-up recordings) and signs the phone out. Offline, or when
  the server refuses (App Check), nothing is deleted and the user stays signed in.
- **ACCOUNT-3.** Delete account always ends, in "Account deleted" (signed out) or an error with Try again: never an
  endless spinner. The app waits for the server at most 30 seconds. With no answer (lost, or offline), it asks whether
  the account still exists: gone, it is deleted; there, or no way to tell, the error says the account may not be deleted
  and to try again. A Try again after the server had deleted it ends in "Account deleted". Once the server has deleted
  it, nothing on the phone (its copy, signing out) keeps the spinner up more than a few seconds. The deletion itself
  doesn't hold the phone up either: the phone stops listening to the account (its user document, pages and sessions)
  while the server deletes it, and listens again if the account is still there.
- **ACCOUNT-2.** A sign-up or sign-in that fails (an address already registered, a wrong password, Google or Apple
  refused, no connection) leaves the sign-in screen as it was: the same mode, the name, the email and the password
  still typed, with the error under them. A password reset that fails keeps the email. While an attempt runs, it
  shows on its button; only the launch shows the spinner in place of the screen.
- **AUTH-1.** A phone signed in stays signed in at launch when Google can't check the sign-in just then (an
  outage, a rate limit: a 5xx, a 429, or a quota or internal error). It checks again at the next start. A sign-in
  that was ended, a disabled or deleted account, or any other answer still signs it out, as before.
- **SYNC-5.** The same day revised on two phones while both were offline keeps every page either
  phone revised, in one session for the day.
- **SYNC-6.** A page keeps its last revised day, its number of revisions and its rating however long the
  history grows. The app reads the latest 100 days of sessions; a page last revised before them keeps what it
  had, and one rated before them keeps its rating until a session rates it again. (Nov 17 2026: past 100 days of
  sessions, every launch wiped the last revised day, count and rating of each page last revised before them, and
  saved that to the account.)
- **AUTH-2.** When the app finds the phone signed out at launch, though a sign-in was saved on it (the
  account's sign-ins were ended on the server, or it was disabled or deleted), the sign-in screen says "You were
  signed out. Sign in again to carry on." until the next sign-in, and Sentry hears of it once, with no account
  details. A sign-out or an account deletion from the app says nothing.

## Settings

- **SET-1.** Settings opens on a short first level (Majd, Nov 22 2026, the Settings audit's option B: "i feel like
  option B is way better and cleaner let's do that"): your account at the top (name, email, and Premium when the account
  has it), then a row per page with what it is set to (Revision "Smart Tracking on", Reminders "On · 3 prayers", Prayer
  its method and city, Mushaf and Recite the mushaf, Revo AI, Downloads and storage how much is on the phone,
  Appearance "Light · Indigo"), then Help and support, About and, for testers, Testing, and the version. Each row opens
  its own page with that group's rows and nothing else:
  - Account: Display name, Premium, Time in app, Sign out and Delete account;
  - Revision: Smart Tracking, Keep daily amount, Start day at fajr (always here, with prayer times or without),
    Memorized pages and Activity;
  - Reminders: Revision reminders (the revision reminders' switch, REMIND-1), Prayer notifications and the Friday
    Al-Kahf reminder;
  - Prayer (with prayer times): Prayer times, Calculation, Qibla and Next prayer on Home;
  - Mushaf and Recite: the mushaf and, with Recite, its settings;
  - Downloads and storage: Offline mushaf, Download over mobile data, Recordings, Back up recordings, Back up over
    mobile data and the speech model;
  - Appearance, Help and support, About and Testing: as their names say.

  Back from a page returns to the first level. A Settings section opened from elsewhere (Revo's card, Insights' "Turn on
  Smart Tracking") opens the page that holds it. No setting was removed or changed by the move; the rows look as they
  did (flat rows, the theme's colours).
- **SET-5.** (Revisely Dev until on-device Recite ships) Settings → About → Licences opens the Quran Muaalem License in
  full, word for word, with no network: Revisely's recitation model is derived from Quran Muaalem's, and a copy of the
  model on the phone must carry the licence ("Every distribution of the Work or Derivative Works must reproduce this
  License in full", section 2.4). One quiet row and the licence's own text, nothing else (Majd, Nov 23 2026: "super
  subtle like a singular button that takes them to the page with the license"). The AI notice the licence asks for is
  unchanged: before the first take and from About, in English and always in Arabic, the app's only interface
  languages.

## Tabs

- **TAB-1.** A sideways swipe never presses what is under the finger: a touch that has moved more than
  12 pt sideways opens nothing, whether or not it changed the tab. A press that comes without a touch
  (VoiceOver, TalkBack) always counts. (Nov 22 2026: on Android, a swipe from Read toward Home that the
  tab pager didn't take opened the surah under the finger, 4 swipes in about 100 on the emulator.)
- **TAB-2.** (Revisely Dev) Settings → Appearance → Activity tab (off until turned on, kept on that phone, not the
  account) makes Activity a tab of its own between Home and Read, to compare with the button at the top of Home (Majd,
  Nov 23 2026: "a test toggle in settings for me to see what it's like normal(rn) vs with it"). On: the tab bar is
  Home, Activity, Read (the pulse icon), a swipe moves between them in that order, and Home's top bar has no Activity
  button. Activity, with Insights inside it as before, starts its tab with no back arrow; what it opens (a day, See
  all, the reader, the daily log) is pushed in its tab and Back comes back to it, and a press on the tab while it shows
  goes back to Activity and its top. On the calendar's days a sideways swipe still steps the month or week; anywhere
  else on Activity it moves between tabs. Settings' and Revo's ways to Activity open the tab. Off: the app as before. The
  store app has no switch and never shows the tab (`lib/activityTab`).

## Sheets and updates

- **SHEET-1.** One sheet at a time: a sheet asked to open while another is open, or still closing,
  opens once that one has gone (a sheet opened from inside another opens over it). So whatever opens
  a sheet (the user, an update, Revo's "Open Jump to"), the screen under it takes taps again once the
  sheets have gone. (Nov 9 2026: "A new update is ready" opened by itself over the Today menu; iOS
  refused it, and Home took no taps, only the swipe to Read, until the app restarted.)
- **UPD-1.** "A new update is ready" opens by itself once an update has downloaded, on a tab's main
  screen, 1.2 s after nothing is going on: never during a session, a recording, a recitation or a
  timer, nor while another sheet is open (it waits until that one has gone, then the delay again).
  Later puts it off until the next cold start.

## Sharing Revisely and reporting a problem

- **SET-2.** Settings → Help and support → Share Revisely opens the phone's share sheet with one short sentence about
  Revisely and the link revisely.app, each once: on an iPhone the link goes apart from the words (Messages and
  WhatsApp draw the site's preview under them); on Android it ends the text. The sentence claims only what
  every account has. (Nov 22 2026: the link was in the words and shared again beside them.)
- **SET-3.** Settings → Help and support → Report a problem opens the app's own form, in the app's design, light or
  dark: "Report a problem" between Cancel and Send, one line saying what goes with it, and the field. Send
  needs words; it sends them to us with the app's version, never a name or an email, closes the form and says
  "Your report was sent." Cancel, or closing the sheet, sends nothing and keeps nothing. Offline, the report
  waits on the phone and goes when it can. (Majd, Nov 22 2026: Sentry's white form with its logo was
  "terrible ui".)
- **SET-4.** "Add a screenshot" puts the form away and shows a small bar, "Capture this screen" and ✕, over
  whatever screen is in front, so the user can go to the screen with the problem first. Capture takes the
  picture without the bar in it and brings the form back with the words still there and "Screenshot added ·
  Remove"; ✕ brings it back without one. A capture that fails says so in the form, and the report can still
  be sent. The picture goes only with a report that is sent.

## Links

- **LINK-1.** A link to a web page opens in the app's own browser: the privacy policy and the terms
  (Settings), Revo's "How your data is used", the credits under a translation and the Arabic, and the
  support program's page. If that browser can't open it, the phone's browser does; if neither can,
  the page's address shows with Copy. Contact support does the same with the email address when no
  email app opens. A tap on a link never does nothing. (Nov 18 2026: App Review's iPhone couldn't
  hand links to Safari, and "How your data is used" and Privacy Policy did nothing when tapped.)

## Recitation

- **AUDIO-1.** On Android, a recitation that stops leaves no notification behind: ■ or ✕ in the app,
  the end of its range, and the app swiped away from recents (whose screens then stop it). A
  notification left by an earlier run goes when the app starts. Stopping never makes Android close
  the app.
- **AUDIO-2.** On Android, Pause and ▶ on the recitation's notification work with the app away;
  paused, the notification stays, and the app shows what was pressed. From 1.0.4 it also has
  previous and next, which move a verse back or on as the lock screen's do on iOS.
- **AUDIO-3.** On Android (1.0.4 on), the notification of a paused recitation can be put away: "Hide"
  on the system's media control, or a swipe a minute after the pause (Android 12 and earlier). The
  recitation stays paused where it was, and ▶ in the app goes on from there and shows the
  notification again.
- **AUDIO-4.** When the day's recordings or Listen back go away (another day picked, the screen
  closed) while a recording plays, it stops and its player is freed: nothing plays on with nothing
  on screen to stop it.

## The reader

- **READ-1.** The reader opens on the page it was opened for (a surah or juz from the Read tab, a search
  result, Jump to, a day's or a session's page): its first frame is that page, never page 1 first. Before
  Nov 15 2026 it began at Al-Fatihah and moved to the page a moment later (Majd, on Revisely Dev: "the first
  thing that pops up is Surah Fatiha, and then after like a half second or so, it jumps to the surah").
- **READ-2.** A similar ayah opened from Recite (a mark's or past word's "Similar phrases", or the summary's "You
  continued with …") opens in a reader of its own over the one you were in, that ayah highlighted. Back, the
  button or the swipe, returns to the page you left, as you left it. Before Nov 21 2026 the reader turned to it in
  place, so Back left the reader and lost where you were (Majd: "going back should take me back to that exact page i
  was on").
- **REC-1.** A sitting in the reader: ending the timer while a recording runs, or is paused,
  ends both. The recording is saved first, then the timed sitting. One note says what was saved, by
  surah and ayah, and opens its day: "Saved to today: Al-Mulk, ayahs 1–26, 41 min · Undo · View". Its
  Undo takes back the sitting and the recording that ended with it, as the day's Delete session does; the
  recording uploads only once the note has gone, so an undone one never leaves the phone. It takes the
  place of the "Session saved" alert and the "Recording saved" note. The sitting is named by the pages
  it held, each on screen a minute or more (time paused doesn't count); a page only glanced at isn't
  named. Stopping only the recording leaves the timer running.
- **REC-2.** A sitting in the reader is saved with the pages it held, so the Day's Read block
  counts them and names the sitting by them ("2 pages · Al-Mulk 1–26", the row "Al-Mulk, ayahs 1–26").
  Pages marked revised while it ran come first, and the pages can still be edited. A sitting with no
  pages known reads "Timed in Read".
- **REC-3.** On today or yesterday in Activity, a sitting from the reader with nothing left to
  memorize on its pages, that held pages of the day's revision not revised yet, offers Add to revised:
  "At-Taghabun is the 2 pages left of today's revision" ("… is 2 of the 4 pages left …" when it held
  some of them). Add logs exactly those pages for that day by hand, as Revised elsewhere does: they show
  in the Revised block at once (ACT-13), carry no strength or minutes, and go from its menu (ACT-14).
  A sitting offers one thing: pages not memorized come first (MEM-5). Pages not scheduled that day,
  already revised, or on an older day were reading, and offer nothing.

## Gaps and Last revised

Activity → Insights for every account, from the mistake detection release (`gapsInsightsEnabled`); Revo's main guide
has them.

- **ACT-28.** Insights' Gaps, after Consistency, says how long the user goes without revising. A revision day is a
  revision day (DAY-2, DAY-9) with at least one page revised: a session, pages revised ahead (on the day they were
  done) or pages logged as revised elsewhere; reading and memorizing don't count. A gap is 2 days or more in a row
  without a revision day, counted as the calendar shows them (Monday, then Thursday, is a 2-day gap: Tuesday and
  Wednesday); one day missed is not a gap. The gap still open counts the days since the last revision, today included
  ("6 days so far", as the figure says "6 days since your last revision"), once 2 whole days have gone by. (Majd, Nov
  20 2026, on a day-old account: "there's just a dot on that graph and literally it makes no sense … There has to be a
  better way to represent this.") Lengths under 2 weeks are days; from 2 weeks they are said as a person says them,
  weeks ("over 3 weeks"), from 6 weeks months ("about 2 months"), from a year years, and Days at the section's top
  right (shown only when something reads differently) switches every length to exact days, kept on the phone. (Majd,
  Nov 16 2026: "saying 25 days gap is kinda pointless … but 'days' specifically should always be an option".) Its
  figure is how long since the last revision: under 2 weeks a number ("6 days since your last revision", red from 3
  days); from 2 weeks words and the date, never red ("Over 3 weeks since your last revision, on 24 Oct"); the pages'
  own last revised dates when no item reaches that far back. Revised today: "Today, you revised", "you revised, after a
  5-day gap" when it ended a gap, "you're back, after over 3 weeks" after 2 weeks or more. It opens the day of the last
  revision. Under it one line: how many gaps the range had (ACT-22; never before the account's first day, and named by
  it then: "1 gap since 19 November"), and the usual rhythm, the median step between revision days in the range, from
  two steps ("3 gaps in 30 days · you usually revise every 1–2 days"); with no gap, "No gaps in 30 days", or "No gaps
  yet" while the range has one revision day. Then the gaps themselves, the one still open first, then the latest first,
  three until "Show all 5 gaps": each its length ("5 days", "6 days so far", "60+ days" when it began before the days
  read) and its days ("29 Oct – 2 Nov", "14 Nov – today", "until 2 Nov"), over a bar as long against its track as the
  gap is against the range's longest, red (grey for the one still open from 2 weeks: someone coming back is welcomed,
  not alarmed). With no gap nothing is drawn. A tap on a gap opens Overview, at its top, with the gap marked on the
  calendar: a band in the red's quiet fill behind its days without a revision (an open gap: to today), drawn in from
  its first day to its last with a red edge that then settles (with Reduce Motion it fades in whole), and "Gap, 29 Oct
  – 2 Nov · 5 days" above the grid, said once for VoiceOver. Month opens at the month holding most of it, Week at the week
  it begins in; the band is flat where it carries on into the next week or month, and the arrows or a swipe follow it
  there. It fades at the first touch on the calendar (a day picked, Today, Week | Month) and is gone after leaving
  Overview. (Majd, Nov 16 2026: "it should take them to the overview tab with some 'animation' or visual que showing
  the user their gap on the calendar itself… we'd just have to keep in mind the fact the user could have the week view
  open instead of month.") Under the gaps, the full revision against the plan as it is now, read forwards from today
  (nothing records what an older plan scheduled): a page's spacing is the days between its next two slots (days off,
  custom plans, juz mode and carried pages included), it is due its spacing after its last revision (never revised:
  after the day it was memorized), and it is late when its next slot comes after that. "Full revision pushed back 5
  days · 18 pages from your gaps come round by 13 Nov instead of 8 Nov. Your plan goes round every 5 days." runs from
  the latest due day of a late page to the latest day one comes round ("from your gaps" when every late page was due
  before today; a catch-up that slid the plan back says only "come round"); none late, after a gap in the range: "Full
  revision on schedule"; none late and no gap: no line. A plan changed mid-cycle is judged by the new plan; pages it
  doesn't hold are left out. Nothing revised on record: no section. Recency only, the same with Smart Tracking on or
  off (ACT-19). Revo is told the same figures over the last 30 days with each question (how long since the last
  revision, how many gaps and the longest in days without revising, the usual rhythm, the full revision), and when each
  memorized surah was last revised (ACT-30), from the items Home read and only once they have loaded; any app whose
  account has Gaps sends them. (Majd, Nov 16 2026: "some metric in insights that give the user an idea on their 'gaps'
  between session"; mocks insights-gaps.)

- **ACT-30.** Last revised says when each memorized surah, juz, hizb or page was last revised. It opens from Gaps'
  "When did I last revise…?" at the section's end and from its full revision line (ACT-28), which opens it longest
  waiting first for that visit. Three chips at its top choose what it shows (Majd, Nov 16 2026: "showing recents with
  either surah/juz/hizb/page depending on what makes the most sense for each user then there should be a filter and
  sort options like by date"):
  - the unit ("Surahs", "Juz", "Hizbs", "Pages"). Until the user picks one, it is the one that suits the account
    ("Suggested for you" in its sheet): Juz on the juz plan or with 200 pages or more memorized, Page while every
    memorized page is in one surah, Surah otherwise;
  - the sort: "Recent first" (the latest revised at the top, never revised last), "Longest waiting first", or
    "Mushaf order";
  - the filter, All at each visit: "Revised this week" (the last 7 days), "2 weeks or more" (waiting 14 days or more
    since the last revision, or since it was memorized when never revised) or "Not revised yet". It is filled in ink
    while on. A surah, juz or hizb shows when one of its memorized pages passes, lists only those, and says how many
    of its pages they are ("6 of 20 pages"). A line under the chips counts the rows ("5 surahs", "3 of 15 juz"); when
    nothing passes, "Nothing here with this filter" and Show all.

  The unit and sort picked are kept on the phone for the account. A surah, juz or hizb is as recent as its least
  recently revised page shown (a page shared by two surahs is under both) and says that page's date and how long ago
  ("24 Oct · 22 days ago", "14 Nov · yesterday", "Today"). A tap opens it to those pages, in the same order, drawn as
  part of it (Majd: "it's hard to tell which card falls under what when a user opens up a surah"): no disc, indented
  to its name, the thread line from its disc running down through them, one line each with how long ago ("6 days
  ago"; a surah's pages named by their ayahs alone, "Ayahs 1–5 · p. 2"), and no separator until the group ends. In
  Pages, each page is one line with its date. A page opens the reader there. A page never revised waits from the day
  it was memorized: "Not revised yet" for its first 30 days, "Never revised" after (ACT-25). Recency only, the same
  with Smart Tracking on or off (ACT-19). (Majd, Nov 16 2026: "being able to click on a page or surah or juz or hizb
  and seeing the last time u revised it".)

## Recite

The reader's mic follows the reciter on the page and, with Mark mistakes, marks their mistakes as they recite (Majd,
Nov 11–16 2026). A revision session has the same mic (Nov 17 2026). The checking runs on Revisely's checker (Cloud Run); these rules are what the app shows of what it says.

- **RECITE-1.** A take starts anywhere on the page, or anywhere in the Qur'an. Until the checker has found where the
  reciter is, the take shows nothing of them: no band on the line, no box on a word ("Listening…"). The first place
  found is where the take started, and nothing before it is ever marked skipped, during the take or in its summary.
  Turning the page by hand during a take looks for the reciter on that page, keeping what was already decided. It
  always finds them (Majd, Nov 20 2026: "it should always find where i am there's no exception"; there is no "can't find
  you" message): past the isti'adha, the basmala and anything else said before the start, at a surah's opening as soon
  as its first word is heard, and mid-ayah. Found a word or a few into an ayah, the take starts at that ayah's first word
  when those words were said just before (Majd, Nov 20 2026: they count), and never takes in a word that wasn't said.
  Only while what was said reads the same in two places on the page (a refrain)
  does it wait, for the words that part them. A take whose start is never found (no recitation in it) ends with
  nothing: no summary, no score, and nothing kept. Before it is sure (protocol 9), the checker's guess at where the
  reciter is shows as the cursor on the page shown, moving with them and corrected as words come; never on a hidden
  page, never turning the page, never a start or a mark, and "Listening…" stays until it is sure. The checker is woken when the app comes to the front (at most every
  10 minutes) and when the reader opens, so a take begun soon after doesn't wait for it to start. A microphone that is
  refused or can't start says so ("Microphone
  access is off" with Open Settings, or "Couldn't start the microphone"), never nothing (Majd's Android store build,
  Nov 22 2026: a tap did nothing).
- **RECITE-2.** With Mark mistakes, a take marks two tiers (Majd, Nov 22 2026: "saying a wrong haraka or letter IS a
  word mistake"). Mistakes: a word said wrong, skipped or added, a wrong haraka and a wrong letter, each named for what
  it is ("Wrong word", "Wrong haraka", "Wrong letter") and counted as a mistake, on its card, in the bar, in the
  summary's line ("1 wrong haraka, 1 wrong letter") and in the score, never called a slip. With Strict, tajweed notes,
  labelled Beta wherever they show (Strict in Settings, a note's title, the summary's line, Insights) and never
  counted. There is no level that marks words without harakat and letters: Settings' levels are Mistakes and Strict
  (Beta). The score is the share of the words reached said right. A word with several marks shows its strongest: a
  word mistake, then a wrong haraka or letter, then a tajweed note, and a mistake over a Not clear. The marks are
  highlights in three colours: red for words, amber for harakat and letters (and Not clear), violet for tajweed.
  Strict has a switch of its own and stays Revisely Dev's until it is on, even once the rest of Recite is everyone's:
  elsewhere a take checks mistakes whatever level the phone kept, Settings offers no choice of level, and What's new
  shows no tajweed note.
- **RECITE-3.** A haraka or letter the checker couldn't hear clearly enough to judge is "Not clear", never wrong: it is
  neither a mistake nor a tier, and never counts in the score, whether or not the checker left it out of its own count.
- **RECITE-4.** "Not a mistake" takes a mark off at once, with what it counted in the score; Undo, or the summary's
  Put back, brings it back as it was, its count too. A mark taken off stays off whatever the checker sends again,
  during the take or in its final answer. In Revisely Dev, Stop tells the checker the take's counts with its end (marks
  shown, Not a mistake, Put back, words peeked, resumes): numbers only, never words, audio or ids.
- **RECITE-5.** A take whose connection drops and comes back shows the same take: its start, the words recited, its
  marks and its score. Anything the checker sends again changes none of them. (The hidden view's red cover, a hint,
  may show again on the next word until it is reached.) When a slow connection leaves the checker 3 s or more behind
  what was recorded and still falling behind, the bar's line says "Slow connection: checking is behind" in place of the
  words until it is under 2 s behind again: quietly, never a pop-up, a sound or speech. A resume is measured afresh,
  and while the checker checks the take again from its start (its held audio going out again) the note never shows:
  the words stay. A take the checker hasn't answered within 20 s of its start (at capacity it holds a new take, then
  refuses it) ends there, the bar saying it is busy, rather than minutes of "Starting…". In Revisely Dev a take's audio goes 4:1
  (IMA-ADPCM, one self-contained block a frame) to a checker whose `ready` says it decodes it, and raw to any other, a
  resume included.
- **RECITE-6.** With the page hidden, the words show as they are recited, from where the take started: a word shows
  once it has been said in full (the checker has decided it), the next word has begun, or it has been the word being
  said about as long as it takes to say (its letters at the reciter's pace, a held madd longer; 0.7–2.5 s; with a
  checker whose `said` follows the voice, only as a late backstop for a noisy room, 2.5 times as long, 1.5–4 s), never a
  word ahead, and the bar names no more than the page shows (Majd, Nov 21 2026: "we shouldn't
  be showing the full word until the user maybe either starts the next word or we get a full match"; Nov 22: "it should
  be under one second max that it shows up"). Nothing is drawn on the word being said, still hidden (Majd's Dev take,
  Nov 22 2026: marking it showed where the next word was and how long, before it was said); the newest word shown is in
  the following ink (RECITE-20), so the reciter always sees where they are. ‹ shows the next hidden word and ‹‹ the rest of its ayah: a word shown by hand is peeked, never counts in the score, and its
  ayah joins Recite the mistakes again. While something else is said where the next word goes, that word's cover
  turns red. It goes once the word is reached or said, the reciter goes back, or a mark lands on it (or an extra word
  just before it); it is never a mark and never counts.
- **RECITE-7.** Recite the mistakes again is one take over the stretch from the ayah before the first mistake (in its
  surah) to the last mistake's ayah. Tajweed notes are left out, and peeked ayahs are in. It stops by itself once
  that ayah's last word is decided. Holding the mic on a page that still has remembered mistakes offers the same
  stretch over them ("Recite your N mistakes here"), one each per word.
- **RECITE-8.** Test me picks up to five places at random in what the account has memorized, or in one juz of it,
  no two sharing an ayah. Each starts in an ayah long enough to go on after its first two words, which are all the
  hidden page shows. Its take covers that ayah and up to two more memorized ayahs of the same surah, and stops at
  their end. A place is clean when it reached the end with no mistake and nothing peeked; peeks make it "helped".
  Tajweed notes and Not clear never count against it, and a place whose start was never found counts as not
  continued.
- **RECITE-9.** A revision session has the reader's mic, with the same takes, marks, hidden view, cards and summary;
  Test me stays in the reader. A take there stays in Recite: it never marks a page revised, since its own page turns
  credit nothing, so only a swipe off a page or ✓ marks one (SESS-1). Its page turns stay on the session's pages, and
  a place outside them (a similar ayah, a past take) opens in the reader over the session; Back comes back to it.
  (Majd, Nov 17 2026: "add the mistake detection and mic functionality same as mushaf to the revision sessions".)
- **RECITE-10.** A long take keeps up: what the checker sends is shown as it comes, and a burst of it never holds the
  screen. After a dropped connection the take's audio is sent again paced, never as one pile, and a checker that checks
  the take again from its start never moves the page back: its cursor shows again once it passes where the page was. A
  checker that sends a heartbeat is watched: about 8 s without a word from it counts as a dropped connection, and the
  take resumes, so a connection that goes quiet without closing never leaves the page not following. (Majd, Nov 19
  2026: "being able to keep up with longer sessions like 3min+ at least"; his take stopped following for 76 s.)
- **RECITE-11.** (Revisely Dev) Stop always ends in the take's result within a few seconds: nothing opens by itself, the bar
  settles into the result (Mark mistakes' score and mistakes, or "Done"), a tap on it opens the summary, and VoiceOver or
  TalkBack say it once (Majd, Nov 22 2026: "nothing pops up in my face at any time"). If the checker's final answer
  hasn't come by then, or the connection failed after the take's start was found, the summary shows what the take found, says its end
  wasn't checked, and the take is kept as unfinished with its marks and its recording. A final answer that comes after
  replaces it. An unfinished take never counts in a score or a passage's progress. (Majd, Nov 19 2026: Stop "kept
  loading for so long i had to click out and come back in and it was gone".)
- **RECITE-12.** (Revisely Dev) Leaving the screen during a take, or while Stop waits, keeps the take as unfinished, with its
  recording; one whose start was never found leaves nothing. A take that ends without its final answer is reported
  (Revisely Dev, numbers only). A take's audio that no take names (saved before takes were kept this way) shows in
  Recited as an unfinished take of its own, never checked: no score, and no part in any.
- **RECITE-13.** (Revisely Dev) With the page hidden and no take running, a word with a mistake keeps its wash on its
  place, the word still hidden: a take's marks in their colour, after it, and the words Recite's memory still holds on
  the page, lighter (with Show past mistakes on). During a take nothing is drawn on a word still hidden, its marks and
  past mistakes included (Majd's Dev take, Nov 22 2026: boxes on lines not yet recited gave words away); each shows
  once its word does, a past mistake as a lighter wash. A word that shows has its wash behind its ink, as on a shown
  page. (Majd, Nov 20 2026: "if I hide the page, that highlight should still be there.
  Obviously, the word won't be shown, but the highlight should still be there so I know where I typically make
  mistakes".) A tap on a highlighted cover opens that mark's card, as a tap on a marked word does on a shown page (Majd,
  Nov 21 2026: "the shaded mistakes when the page is hidden aren't clickable which they should be").
- **RECITE-14.** A mark shown during a take stays after Stop, on the page and in the summary, unless it was called Not
  a mistake: one the checker's final answer leaves out stays as it was shown and counts as it did, unless the final
  answer judged that word itself (its mark there replaces it). (Majd, Nov 20 2026: "As soon as a mistake is made, the
  color should be highlighted immediately and should stay that way".)
- **RECITE-15.** (Revisely Dev) Each new mistake that counts (a word wrong, skipped or added, a wrong haraka or letter)
  plays a short sound and a tap as it is marked during a take: never for Not clear or a tajweed note, never twice for
  one mark (a resume sends marks again), and at most one every 0.7 s. It plays in silent mode, at the volume the
  buttons set, and Settings → Mushaf and Recite → Sound on a mistake turns it off. (Majd, Nov 20 2026: "there should be some like
  error sound ... so I know I just made a mistake".)
- **RECITE-16.** (Revisely Dev) Pause keeps the take open however long the pause lasts: nothing ends it or opens its
  summary until Stop, ✕ or leaving the app, and Resume carries on the same take. A checker that let a paused take go
  anyway is reconnected to, never taken as the take's end. (Majd, Nov 21 2026: a session's take, paused with nothing
  wrong, opened its summary by itself.)
- **RECITE-17.** (Revisely Dev) The bar's score can be tapped throughout a take: while it runs, or Stop waits, it opens
  what the take has found so far, with Done only, and the take goes on; once it's done, it opens the take's summary
  again. A take's summary carries no line about test data or Premium. (Majd, Nov 21 2026: "the percentage score
  should be clickable throughout the whole process".)
- **RECITE-18.** (Revisely Dev) "Your recitation" on a mark's card plays the phrase the mistake is in, not the mark's
  second alone: from the word after the last pause mark before it (or its ayah's start) to the next word that carries
  one, its own included (or its ayah's end). Every pause mark ends a phrase but ۙ (don't stop), and a phrase never
  leaves its ayah. A short ayah (12 words or fewer, or 8 seconds or less in the take) plays whole. It is never longer
  than 15 seconds: a longer phrase is the mistake with 4 words before and 3 after, and if that is still longer (a slow
  take), the 15 seconds of it around the mistake. A skipped word plays from the word
  before it, so the jump is heard; an extra word, the phrase of the word it came after, up to the word after it.
  (Majd, Nov 21 2026: "the playback should be 'smart' it should know based on where and what the mistake is, what
  exactly and how much of the recording they need to playback in order to benefit".)
- **RECITE-19.** (Revisely Dev) Recite's highlights on a page are soft pastel washes behind the word, never boxes: each a
  rounded core with an edge that fades out all round, reaching a little past its word on every side, with no outline
  and the ink as it is. That holds for the mistakes (red for words, amber for harakat, letters and Not clear, violet for
  tajweed; the mark a card is open for a firmer shade), Recite's memory's past mistakes (lighter), and what marks a hidden
  page's covers. With the page shown, a flat grey band lies behind the whole ayah being recited, across every line of it
  on the page, full line height and without blur, moving on per ayah, and a firmer grey rectangle sits on the word being
  recited, moving word by word with where the checker has the reciter, never ahead of them; a mark's wash shows over it
  (Majd, Nov 22 2026: "we should follow how tarteel does it here"; of Tarteel's shown page, "follow along is clearly
  shading each word and i like how it looks essentially like a boxed rectangle kinda that moves side to side"). (Majd,
  Nov 21 2026: Tarteel's shading "is way more elegant than ours and also seems like a blurb or splash … I also like their
  color shades its like more pastel which is what we should aim for".)
- **RECITE-20.** (Revisely Dev) A hidden page is an empty page, ready at once when it is hidden: a faint rule where each
  line's words are still hidden, the ayah markers whole, and each word shown (recited, peeked, or in an ayah shown whole)
  in place in its own ink. Nothing over or under a marker shows while the word beside it on that side is hidden (a
  sajdah's overline did beside page 379's ۲٤, Nov 22 2026). Nothing of it fills in afterwards (Majd's Dev take, Nov 22 2026: "it should just appear ready
  from the start like it was before"). During a take the newest word shown is in the following colour (green, the same as the word being
  said in the bar) and the words before it in the page's own ink; it moves on with each word shown, never to a word
  still covered. A word with a mark keeps its wash and the page's ink instead: the mark says more than where the reciter
  is. Mistakes' washes show on a hidden word's place as on a shown word, behind the ink. With the page shown nothing is
  inked (RECITE-19). (Majd, Nov 22 2026, of Tarteel's hidden page: "i dont see the words being a different color as its
  recited with page hidden, why are we not taking that up?"; and of the empty page with rules: "let's do it and test
  it".)
- **RECITE-21.** (Revisely Dev) Switched to hidden during a take, the page keeps everything behind the reciter on
  show: the words before where the take started on the page, and the words recited. Only what is ahead hides. Switched
  to hidden after a take, the page hides everything, the words recited too. The take's mistakes still show on their
  words' places, and a tap still opens them. Stop alone changes nothing on the page: when a take stops, the words it
  recited stay shown with those shown by hand, after it is closed too, until the page is hidden again (Majd's Dev take,
  Nov 22 2026: "it should show me the first two verses revealed since that's what i recited"). (Majd, Nov 22 2026, of Tarteel's
  smart switching: "do the same".)
- **RECITE-22.** (Revisely Dev) A recitation goes on past the checker's 15 minutes a take, as long as the reciter does
  (a 20-page session runs 30–45 minutes), and shows as one take. From 14 minutes into a take, at a pause after an
  ayah's or a phrase's last word (later at any pause, and five seconds before the cap at once), the take ends and the
  next starts by itself, looking for the reciter from the ayah they are continuing in to the end of its page (and then
  anywhere in the Qur'an), so a look-alike opening earlier on the page is never taken for it; a take the checker's cap
  ends is followed the same way. The microphone never stops: every moment of the recitation goes to exactly one take, none
  twice and none missed. A take cut mid-word (at the cap, or near it) counts and marks nothing past the last word it had
  decided: the word in flight is judged by neither take, never wrongly marked. Nothing on screen changes: the bar listens on, the clock runs on, every mark stays, and the
  cursor and a hidden page's words stay where the reciter was until the next take has found the place. Stop, ✕,
  leaving the app or a drill's or a test's end never start a next take. The summary covers the whole recitation once
  every take has its answer (a take whose answer doesn't come stands unfinished, RECITE-11), with one score, one
  recording and one record in Recite's memory, whose Not a mistake labels go to the take that judged the word. "Your
  recitation" on an earlier take's mark plays from the recitation's recording, while it lasts and after Stop (read from
  the file as saved); with Save recordings off nothing keeps an earlier take's audio, and its marks have none. (The
  release owner's plan, Nov 22 2026: Recite in a revision session stopped at 15 minutes.)

- **RECITE-24.** (Revisely Dev) A take's summary: a take of 2 pages or more says its mistakes per page beside the count
  ("3 mistakes · 1.5 a page"; never in the bar), where a % alone hides how many there were. Insights' Recitation
  section says it for its range, in one quiet line under the score: the mistakes a page across the range's finished takes
  of 2 pages or more, pooled ("Takes of 2 pages or more: 1.2 mistakes a page"; "no mistakes"; "under 0.1" rather than
  none), each take's pages counted as its summary counts them, from its first word's page to its last's, so takes kept
  before this count too. Revo is told the same. Each wrong word, haraka or
  letter slip with what was heard shows two lines, Expected and what was recited, each the phrase around it (two words
  either side, in its ayah), as its card does. (Majd, Nov 22 2026, Tarteel picks 4 and 5: "ur recommended is fine, we
  should aim to keep it clean", "recommended is fine".)
- **RECITE-25.** Nothing a take shows under the page covers it, on any phone and at any text size, the page shown or
  hidden (Majd, Nov 22 2026, of the shown take's card: "it's blocking the view of the bottom verses which is
  unacceptable"). The take's bar and a shown take's card ("Your take · …", RMEM-5) are the screen's footer, in the
  player's place and of its height, in the room the page leaves under it; the card's text is one line each. Not a
  mistake's Undo (RECITE-4) is in the take's bar, in the words' place, for 5 s (15 with VoiceOver or TalkBack), the bar's
  buttons staying; Stop ends it, and the summary's Removed list has Put back. Before, both were notes over the page's
  last lines. A mark's card, opened from its word, is the one thing over the page, on purpose.
- **RECITE-26.** (Revisely Dev) "Keep my recitations as test data" (on by default: each take and its result are kept on
  revisely-dev for the lab, and nobody listens to them) is on Settings → Mushaf and Recite, for every account that
  recites, tester or not. Off, takes are no longer kept. Revisely Dev is shared by link with people who aren't testers
  (Majd, Nov 22 2026: "i just need to have the link to send to my friends"), and the Testing page shows only to
  testers, so before this they had no way to turn it off. The store app never shows it: production's checker keeps
  nothing.
## Recite insights

What a user's takes with Mark mistakes show over time, and Revo knowing it (Majd, Nov 16 2026).

- **RINS-1.** Revo knows what Recite found in the account's takes, worked out on the phone: the last 4
  weeks' takes and score, mistakes by kind, Not clear and tajweed notes apart, words still marked and
  cleared, the passages that keep slipping and the similar ayahs gone on with, and the latest take. A take's
  own marks go only when the user attaches it. It is told text only: never audio, recordings or ids, and
  never a sound spelt out. Its rules for this come only with a recitation, so every other question is asked
  exactly as before. It speaks only of marks that exist, says Not clear wasn't clear enough to check (never
  wrong), puts words and similar ayahs before harakat, never calls going back to restart a mistake, and
  names surahs and ayahs, never pages.
- **RINS-2.** Activity's Insights has a Recitation section for an account that recites, over Insights'
  range: the score (each take's own score weighted by the words it recited) and its weeks; the passages
  with words still marked, the most slipped first, each with those words on their highlights, opening the
  reader there; the similar ayahs gone on with; and one line of the words cleared and the kinds, words
  first, Not clear never counted. With Smart Tracking on, a passage rated strong that still slips is named,
  and Weak spots say how many words Recite still marks there. Off, nothing about strength: a passage's
  row says when it was last recited instead of how often it went wrong.
- **RINS-3.** A take in a day's Recited block that slipped into a similar ayah says so under its line ("You
  went on with Yusuf 90, a similar ayah"; an ending, "You ended Al-Falaq 3 as ayah 5 ends"), two at most.
  Holding the take's passage and lines opens its menu: Show on the page, and Ask Revo about this take while
  Revo is on for the account, which opens Revo with that take attached (as Revo's + attaches one). VoiceOver
  has the same two as actions on the take.

## Recite's memory

Recite with Mark mistakes remembers each take (Majd, Nov 15 2026; Tarteel's biggest lead over Revisely).

- **RMEM-1.** A take with Mark mistakes is remembered on the account, so it follows the user to another
  phone. It keeps its marks (less any called Not a mistake, after the take too, and again once put back),
  where it ran, its score by the page, whether the page was hidden, and which recording on the phone is its
  own. It keeps text only, never audio. A Recite take (following only), and a take whose start was never found
  (a failure before then included) leave nothing; one that failed after it is kept unfinished (RECITE-11). Forgetting a take removes it from every phone.
- **RMEM-2.** A remembered mistake on a word clears after 2 right takes of that word in a row, on 2
  different revision days. Getting it wrong again starts the count over. A take counts only for what it
  checked: a take without Strict never clears a tajweed note. A Not clear mark is remembered like a wrong haraka, amber,
  until the word is said clearly: a take that heard its harakat only as Not clear hasn't said it clearly, so it
  counts as wrong. It still never counts in a score. (Majd, Nov 20 2026, on Not clear staying after a take: "yes
  (a) is fine".) Clear now clears a word at once. The word's card says plainly what clears it: how many more right
  takes, and on another day ("Right today. 1 more right take, on another day, clears it."), with Strict on for a
  tajweed note. (Majd, Nov 22 2026: "yeah that's fine".)
- **RMEM-3.** Outside a take, a word with a remembered mistake stays marked on the page, in its highlight
  colour made lighter (red for a word, amber for harakat and letters, violet for tajweed). A word shows one
  mark, its most severe. Marks don't show during a take, where only that take's marks do. They also don't
  show on a hidden page, or with Settings → Mushaf and Recite → Show past mistakes off. (In Revisely Dev a hidden page keeps
  them on its covers, during a take too: RECITE-13.) Tapping one opens its history,
  which shows:
  - the kind in words, with its place and how often it went wrong;
  - what was expected;
  - its latest takes: the date, right or what was said, whether the page was hidden, and ▶ your own voice
    when that take's recording is on the phone;
  - where the clear rule stands;
  - Hear it and Similar phrases.

  Clear now takes the mark off at once, with Undo.
- **RMEM-4.** A take's summary names the words it cleared from the page (said right on a second day).
  Once its passage has two takes or more, the summary also shows the passage's trend, with a small line:
  "Up from 95.1% on Mon 2 Nov · 6 takes". The trend opens the passage's progress, which shows:
  - the latest accuracy by the page;
  - a chart of every take of the passage (a take counts when it covers at least half of it);
  - the words still to fix there;
  - the takes, newest first.

  A word's card opens the same page (See all). From the summary, Done goes back to the summary.
- **RMEM-5.** A day in Activity lists its recitation takes in a block of their own, Recited ("2 takes"), newest first,
  each take a row: its passage, its line (time, length, mistakes, Not clear, words cleared, page hidden), its score by
  the page, and ▶ its audio while that is on the phone; a tap shows it on the page, a hold opens its menu. A day with
  more than five shows the newest four and "All N takes". Overview's preview of the picked day has a Recited row (its
  passages and how many takes) that opens the day at its takes. (Majd, Nov 20 2026: "after I finished my recording, I
  go to my journal to go take a look at it ... today is Thursday, so I'll go to Thursday to see what I did". Before,
  the preview had no takes and the day one quiet "1 take ›" row.) All activity has
  Recitations, with All takes, With mistakes and Page hidden. Show on the page opens the reader at the
  take's page with that take's marks at full strength and nothing else, until Done. Its bar has ▶ for the
  take's audio while that audio is on the phone. Each mark has its card, and Not a mistake there updates the
  take. The progress page's takes open it too.
- **RMEM-6.** A take is never a recording, a sitting or pages revised (Majd, Nov 16 2026: "separate normal
  recordings from those recorded with mistake detection because it's clobbering the journals"). A take with
  Mark mistakes keeps its audio with the take (Save recordings, on by default); Recite alone keeps nothing.
  No note follows a take: its summary is its end, with "Delete this take" in its ⋯ (after a confirm the
  take, its marks and its audio go, as they do from the take's menu in Activity) and "In today's Recited ›".
  A take's audio is never in a day's Read, All activity's recordings, the calendar's count of recordings,
  Settings' recordings or what Revo is told of a day's recordings, and Settings' Delete all recordings
  leaves it. A take saved before as a plain recording becomes a take's audio again once its take is on the
  phone; Recite alone's old audio has no take, so it stays a recording.
- **RMEM-7.** (Revisely Dev) A take's summary lists the user's earlier takes of the same stretch, newest first, five at
  most: "This passage: your last 3 takes" (Majd, Nov 22 2026, after the Tarteel analysis: "we can queue up another
  session to implement this, no reason to wait until later"). An earlier take counts when the two share at least half
  of each one's words, so a whole-page take isn't the history of two of its ayat, nor the other way round; a take
  deleted, or kept without its final answer (RECITE-11), never does. Each row says:
  - when, as a day and never a date: Earlier today, Yesterday, a weekday within the week, then "9 days ago", "3 weeks
    ago", "2 months ago";
  - its score by the page, and its mistakes as the summary counts them (tajweed notes and Not clear never count);
  - its ayat, only when they aren't this take's, and "page hidden" when it was.

  A tap shows that take on its page with its marks until Done, as Show on the page does (RMEM-5). VoiceOver reads a row
  in words ("Yesterday: 98.1%, 2 mistakes. Show it on the page"). With no earlier take, during a take (the score's "so
  far") and after Recite alone, there is no such section. "Your progress here" (RMEM-4) follows it.

  Its progress compares like with like (the orchestrator, Nov 22 2026: "'Up from 99.3%' must not credit a take for
  ayat it never recited"): the summary's trend line, and the progress page's score, line and chart, count only takes
  of the same stretch, by the same rule. "Your takes here" still lists every take covering half of the passage, each
  with its ayat on screen and for VoiceOver, and the page says "The score and chart count only your takes of these
  ayat" when it lists takes the chart leaves out.
- **RMEM-8.** (Revisely Dev) A finished take's summary opens again from its card (Majd, Nov 22 2026: "make that take card
  clickable and have it open that days summary popup sheet"). A take shown on its page (RMEM-5: from a day's Recited, the
  progress page's takes, or a row of "This passage", RMEM-7) has its card in the player's place under the page (RECITE-25),
  "Your take · Yesterday, 9:41 PM", with ▶ and Done as before; a tap anywhere else on the card opens that take's summary. All activity's Recitations show a
  take on its page the same way (before, a tap there opened its day). The summary is built from the take's record, as it
  was when the take ended:
  - when it was, first, and "page hidden" when it was; its score by the page and its mistakes (per page from 2 pages), or
    no score for a take never checked (RECITE-12), and the unfinished line when it has no final answer (RECITE-11);
  - its mistakes, similar ayahs gone on with, Not clear and tajweed notes, as right after the take: a mistake's row shows
    it on its page with its card open, a similar ayah opens in the reader;
  - the words it peeked, a row per ayah, and the marks called Not a mistake, with Put back (the mark is the take's again
    on every phone, its score with it, and the checker hears it). Not a mistake on the shown take's card lists the mark
    there too;
  - the words it cleared (RMEM-4), "This passage" (RMEM-7), and "Your progress here", whose line is the passage's trend up
    to and including this take (a later take isn't this take's progress); the progress page's Done comes back to it.

  Its buttons: Recite the mistakes again with Premium (one take over its mistakes and peeked ayat, as right after it),
  and Done, back to the take on its page; no Recite again. Under them "Its day in Activity" (or "In today's Recited")
  opens its day at its takes, and ⋯ has Delete this take. A take kept before Nov 22 2026 has no peeked words or marks
  called Not a mistake to show: the record didn't keep them then. A take of Recite the mistakes again shows no
  "Before:" line later, and no take of Recite alone is kept (RMEM-1), so none has a summary to open.

## Searching the Qur'an

Every account, from the Read tab: "Search the Quran" under its title (`lib/search`,
`screens/read/QuranSearchScreen`; Majd, Nov 8 2026 for testers, Nov 9 for everyone). A result opens
the reader at its ayah, highlighted until the page is turned. Searching by voice, a mic beside it, is
for every account on an iPhone that can listen (1.0.3 on; Majd, Nov 9 2026); Android types only. Its
first use downloads the speech model, once and on the user's tap (Settings → Downloads and storage → Speech model
shows and deletes it). Listening uses that model on the phone: nothing said is recorded or sent. The
microphone's purpose string (in the binary) names searching only from 1.0.4.

- **SEARCH-1.** A few words of an ayah, recited or typed in Arabic (with or without vowel marks, in
  Uthmani or standard spelling), find it: from its start or its middle, running on into the next
  ayah (found at the first, named as the run and highlighted across both), with a word misheard, left
  out or said twice (words the text itself says twice are found as said), and after an isti'adha or a
  basmala said first.
  A phrase in several ayat lists every one, in mushaf order, the phrase itself before ayat that only
  nearly hold it. Words that aren't in the Qur'an find nothing.
- **SEARCH-2.** A place typed by name or number goes there: a surah by its name, Latin or Arabic,
  with or without its "al-" ("Yunus", "Fatiha", "الكهف"), an ayah ("2:255", "Yunus 16", in Arabic
  digits too), a page ("page 62") or a juz ("juz 30"). A bare number offers the surah and the page.
  A number that isn't in the mushaf goes nowhere.
- **SEARCH-3.** Searching by voice hears only what is said. Under "Listening…" nothing shows until the person
  speaks, and the room (silence, its steady noise, the microphone's first moments) is never taken for words: the
  speech model writes a word for any of them. Words show as they are said, and someone who speaks at once is heard.
  Listening that hears nothing ends after 8 seconds and searches nothing.
- **SEARCH-4.** (With Recite) A voice search that finds exactly one place (the list
  would say "1 result", not "Closest matches") opens the reader at that ayah, highlighted as the result's Open in the
  reader does, with nothing recording or listening: listening ended with the search. Back returns to the search, its
  words and that result still there. Several results, the closest there is, or a typed search stay a list, and nothing
  opens by itself.

## Translations

A held verse's translation (the verse sheet). The sources' terms are in CLAUDE.md ("Saheeh
International", "The Clear Quran®") and in `lib/quranenc`.

- **TRANS-1.** A translation shows exactly as its source gives it: the text and its footnotes, nothing
  changed, added or cut. A "[n]" marker that has its footnote shows as the raised number, and the
  footnote is under the verse. A translation that can't load says so; another translation's text is
  never shown in its place or under its name.
- **TRANS-2.** Under a QuranEnc translation is its credit: QuranEnc's own description of who translated
  and issued it, the version of the text shown ("· v1.1.3"), and QuranEnc.com, a link to its page. The
  picker shows the same credit with each translation.
- **TRANS-3.** A right-to-left translation (Urdu, Persian, Kurdish, Pashto, Uyghur, N'Ko) reads right to
  left, aligned to the right, its footnotes too.
- **TRANS-4.** A QuranEnc translation stays at QuranEnc's latest version. Its list is read at most once a
  day, and one request answers for every translation. A sura kept from an older version is fetched again
  when it is read, and shows with its own version until then.
- **TRANS-5.** Every account chooses from every translation in QuranEnc's list (76, in 56 languages, Nov 2026).
  The picker lists Selected (the one in use), Favorites, Downloaded, then each language by its English
  name with its own name beside it, each translation once. A search over every group finds a language,
  in English or its own name (accents aside), or a translator. (Testers only until the November 2026
  release, when everyone else had Saheeh International and The Clear Quran®.)
- **TRANS-6.** A whole QuranEnc translation can be downloaded from the picker, on any connection:
  its size shows before ("1.2 MB"), its progress while it downloads ("Downloading… 40%"), and it can be
  stopped, carrying on later from where it stopped. Once every sura is on the phone it reads "On this
  phone" and is listed under Downloaded; Remove, after a confirmation, deletes it. A download that fails
  says so and keeps what came. Saheeh International comes and goes with the offline mushaf, as before.
- **TRANS-7.** Offline, a verse in a translation that isn't on the phone says so ("This translation isn't
  downloaded"; The Clear Quran® "needs the internet") and offers a translation of that sura that is on
  the phone: one in the same language first, then Saheeh International, then any other. A verse whose
  Arabic isn't on the phone either says it shows once back online. Back online, it loads by itself.
- **TRANS-8.** Starred translations are kept under Favorites, below Selected, in the order they were
  starred. Edit moves a favorite up or down or takes its star away, and deletes downloads (after a
  confirmation). Favorites are kept on the phone for each account.

## Activity

- **ACT-1.** A memorized page is filed under the same revision day as everything else in Activity: the
  day it is in, turning at Fajr when the user has the Fajr boundary on and a location (the moment before
  that day's Fajr belongs to the day before). Otherwise it is the calendar day in the user's own time
  zone, which is the zone their revision sessions were written in (the offset under which each session's
  `createdAt` falls on its `date`); with no sessions, the saved location's zone, then UTC. (Changed Nov 5
  2026: memorized items used to have no Fajr shift; Majd chose one day rule for all of Activity.)
- **ACT-2.** A day's Revised block is built from its revision items: one per day, with the pages revised
  ahead for later days listed apart. A revision note in the daily log is not a second entry; it shows
  under the Revised block. Every account's since the November 2026 release (testers' before).

- **ACT-3.** The calendar's day shows the share of the day's assigned pages revised (a ring), and a dot for a
  memorized item, a read item and a note on that day. A month steps with ‹ ›. Every account's since the
  November 2026 release (testers' before).
- **ACT-4.** Insights use one definition each: coverage is the share of memorized pages revised within the range
  (ACT-22; a longer range never covers less, and it never shows 100% while a page is left); consistency is the days with a revision or a read; pace is shown
  only from at least ten timed items; juz untouched longest is the juz whose least recently revised page is
  oldest, or never revised in the 30 or more days on record (ACT-25), among the juz at least half memorized
  (a juz under half is shown as being learned, so a page memorized today never makes its juz the one
  untouched longest).

- **ACT-5.** The day's + offers, for today and yesterday, Revised elsewhere, Memorized and Note (Majd, Nov 7
  2026: "yes trim it"). There is no Read (the reader logs reading by itself) and no free choice of pages to
  mark revised. Revised elsewhere lists the day's scheduled pages (its session's assignment, or the plan's)
  that are memorized and not revised for it yet, each ticked; untick the ones not done, and Add logs the
  rest for that day by hand, with no strength and no minutes. A page already revised for the day is never
  offered again; with none left it says so. Memorized opens its own sheet: From and To, or a surah, and
  optional minutes. From and To are rows that open wheels, the same on its Ayahs and Whole pages tabs
  (Majd, Nov 8 2026): a surah and an ayah wheel, or one wheel of pages whose rows name the surah each page
  starts in ("542 · Al-Mujadila"). To is never before From, and each opens on the first ayah or page not
  yet memorized. Under them, the passage in words and how many ayahs or pages. Add marks the pages memorized (the composer's two writes) and records a Memorized item
  for that day, dated that day; its minutes join the day's item once (an add sent again adds none). "From
  your reading" offers the pages read that day that are not memorized yet. Note opens its own sheet: its
  text, and an optional "Show under" choice of the day's Revised, Memorized or Read item (the note's tag).
  Add is a new note with its own id and time; an empty note cannot be added.
- **ACT-6.** In the daily log, a note swiped away goes at once, with Undo; the delete is saved after the undo
  window (five seconds), and leaving the screen saves any delete still waiting. In the Activity day, the rows under
  a block (notes, timed reads) have no hold and no swipe: they are edited and deleted in the daily log. A block
  header (Revised, Memorized, Read) holds a menu: Edit for a timed read, Delete for each item (confirmed first).
  A Memorized entry's menu is exactly Edit and Delete (each named when the day has several entries); Edit opens
  the memorized pages ready to edit, at that entry: its surah open and scrolled to, its pages ringed. A
  recording has no swipe either: a hold opens its menu (Listen back, Delete). (Majd, Nov 8 2026.)
  VoiceOver offers the same actions as custom actions on the header (a recording's Delete, on its play button).
  The menu is the iOS-style long-press menu: a preview of the held item (its label and text) with its actions
  beneath it, over the dimmed screen. An action runs once the menu has closed; touching the backdrop runs nothing.
  The daily log's note menu is the same menu (Edit, and Copy when the note has text).

- **ACT-7.** Deleting a Revised session or a Memorized entry asks first, and names what goes. A Memorized
  entry takes off exactly the ayahs it added (MEM-3), and its item is removed: a page it memorized goes back
  to not memorized, and a page it added part of keeps only its other ayahs (Nov 8 2026: before, a page it
  added part of kept the entry's ayahs). Ayahs another day's entry also holds stay, and so does a page that
  was memorized before any entry that holds it (marked in the memorized pages, or at sign-up). Home's %
  memorized, the juz dots, the plan and Revo follow the pages; a custom plan drops the pages that are no
  longer memorized, as editing the memorized pages does. Undo of an add takes its ayahs out of that day's
  entry only, so Undo straight after an add and Delete leave the same pages. A failed removal is kept and
  retried, never dropped.

- **ACT-8.** A revised page's strength comes from its weakness rating (1–5): 1–2 is weak, 3 is moderate, 4–5
  is strong. The counts on a day's Revised block are these classes, over the day's revised pages (a page with
  no rating counts as 4, strong). Confirmed by Majd, Nov 2026.

- **ACT-9.** A day's Activity items load when the day opens and again when its screen regains focus, not
  on their own: a render never starts another load (it looped and froze the app, Nov 2026).
- **ACT-10.** Pages marked memorized in the memorization manager, or in the Memorized composer, are logged as a
  memorization item for the day the user chooses: Today writes them into that day's item (merged, idempotent);
  Before (don't log) writes nothing. The manager asks "When did you memorize these?" (default Before above five
  pages). Pages unmarked are removed from the items that hold them. The Memorized composer takes a page range
  (From and To) and marks it in the same save.
- **ACT-11.** A log note tagged to one of the day's items shows under that item in Activity: a Revised,
  Memorized or timed Read item. A tagged note whose item is gone, and an untagged note, stay in the Notes block.
  While the day's items load, a tagged note shows nowhere (it never flickers into Notes).
- **ACT-12.** Insights live in Activity (Calendar | Insights), for every account since the November 2026 release
  (testers' before): the tab bar is Home and Read, with or without Smart Tracking, and there is no Insights tab
  to reach. Without Smart Tracking no page is rated, so Activity's Insights has no Weak spots (no Ask,
  no "See all"): one line stands in its place, "Turn on Smart Tracking to see your weak spots ›" (a link, not a
  guide), which opens Settings at Revision, where its switch is; once it is on, Weak spots shows. With it, Weak
  spots ends in "See all pages by strength": every revised page, weakest first, by page, surah or juz, filtered by
  juz and by strength (the Insights tab's Browse). (Majd, Nov 6 2026; the line, Nov 7.)
- **ACT-13.** What the day's + adds (pages revised elsewhere, Memorized, a note) shows on
  that day the moment its sheet closes, without leaving the screen, and offline too: the day lays the
  changes still waiting on the phone over what it read. Once the server has them, the day shows the
  server's copy. (Nov 7 2026: every add saved, but the day showed it only once it was opened again.)
- **ACT-14.** Revised pages added by hand (the day's +) are the user's own: saving, editing or deleting the
  day's session never removes them. Each is deleted from the Revised block's menu ("Delete …, added by
  hand"), confirmed first, as every item is (ACT-7). (Nov 7 2026: a session save deleted them, and there
  was no way to delete one.)
- **ACT-15.** Pages logged as revised elsewhere count as a session's pages do: for the streak (SESS-6: a day
  whose scheduled pages are all credited to it is done, and a day restored within its grace window counts on
  time), on Home's today ("N of 20", Done) and in its catch-up offer (a day's pages logged are not left
  over). Home shows them when it next comes into view, offline too. A page counts once a day, whether a
  session or a log revised it. Pages logged by hand never stand for what a day had scheduled: that stays
  its session's assignment, or the plan. (Nov 7 2026: a missed day caught up by hand stayed missed.)
- **ACT-17.** A day before yesterday offers only a note: its + opens the Note sheet at once, so old history
  and streaks can't be rewritten. What is already logged there can still be seen and deleted. (Majd,
  Nov 7 2026.)
- **ACT-16.** Pages logged as revised elsewhere are revised that day: they count in each page's last revised
  day and number of revisions (and clear its skips) as a session's pages do, at once and after every
  launch, so Pages by strength, Coverage and weakest-first plans see revision done elsewhere. They carry
  no rating: a page keeps the one its sessions gave it. Deleting the log takes them back. (Nov 7 2026: the
  pages were re-derived from sessions alone.)
- **ACT-18.** Activity has two tabs, Overview and Insights. Overview's calendar shows a month or a week:
  a chip beside its title ("Month ⌄") opens the two, and the choice is kept on the phone. Switching keeps
  the picked day (or else today) on screen. When the calendar shows another month or week than today's,
  Today, beside the arrows, brings back today's with today picked: its cell highlighted as a tapped day's
  is, and its preview below (Majd, Nov 8 2026). The picked day's whole preview opens
  that day: its date and Open at the top, each of its rows (Revised, Memorized, Read, Notes) scrolled to
  that block. (Majd, Nov 8 2026: Week and Month as a second row of pills was "a whole tab just to show
  weeks instead of month"; Open alone was easy to miss.)
- **ACT-19.** Without Smart Tracking no page is rated, so Activity shows no strength: no weak, moderate or
  strong counts, no weak marks on a day's pages, no Weak spots (ACT-12) and no rating colours. Recency
  stands in where it reads well: when a part was last revised and how often. With Smart Tracking on,
  strength shows as before (ACT-8). (Majd, Nov 8 2026: the strength displays mean nothing without it.)
- **ACT-20.** A day's Revised block has a strip of the day's assigned pages, each revised, skipped or not
  reached. Its ends are named by surah (NAME-1), and the line under it gives the pages' strength with
  Smart Tracking, or else what the strip shows ("18 revised · 2 skipped"). A tap on a page opens it in the
  reader over the day, and back returns to the day; a weak spot in Insights opens the reader the same way.
  (Majd, Nov 8 2026: "you'd think u can atleast click on it".)
- **ACT-21.** One juz opens in a sheet from its Coverage tile, from the untouched row (whose Plan it stays its
  own button), and from a day's Revised block (the juz most of its pages were in). It names the juz by its
  surahs and says when a memorized page of it was last revised and on how many days in the last 30. A strip
  of its pages and a row per surah follow: strength with Smart Tracking ("Ayahs 17–24 weak", "Strong ·
  skipped 3 times"), recency without it ("Last revised 3 days ago · twice in 30 days", the wording Revo uses:
  lib/recency; ACT-19). A page, a row and Open in the
  reader open the reader there, once the sheet has gone; a stale juz offers Plan it for tomorrow first.
  (Majd, Nov 7 2026: "not being able to click on anything in coverage"; mocks i5 and i6.)
- **ACT-22.** Insights read one range for the whole tab: 7 days, 30 days (at first), 3 months or All time, from a
  chip at the end of the Overview | Insights row ("30 days ⌄", on Insights only) that opens the four (All time
  names its start, "Since 9 September"); the choice is kept on the phone. Coverage's figure, Consistency's days and hours, Weak spots' counts, Memorization's
  "+N" and Pace (against the same length before it) follow it, and so does the juz sheet's "times"; the juz
  tiles always show where each juz stands now. A range longer than the account counts from its first day,
  and says so by its date at every range ("50 of 56 days since 9 September"). At 3 months Consistency shows a
  weeks grid by weekday and, when there is one, the missed days' pattern by weekday ("Every missed day was a
  Saturday"). The grid has a column per week since the account's first (up to 13 at 3 months, 26 All time),
  its cells one fixed size whatever the history (at most 18 pt), drawn from the left, with each row's
  weekday initial before it and the days before the account or after today drawn faintly: a day-old account
  is one small column that reads as a week, never a cell stretched to the width or a gap under one cell. All time reads from the account's first day:
  Coverage in cycles ("3.1 cycles of your 305 memorized pages since 9 September", since a long range covers
  nearly everything) once the pages have gone round once, and before that the share, as the other ranges
  show it ("4% · 1 of 23 memorized pages since 8 November", never "0 cycles"); the weeks grid from the start
  (up to half a year), and Pace week by
  week ("Week by week: 2.1 → 1.8 min a page") in place of a comparison. (Majd, Nov 7 2026: "why is
  insights restricted to just the last 30 days?"; mocks i1 and i2.) Every count agrees with its number ("1 of 1
  day", "1 of 1 memorized page"). (Majd, Nov 8 2026, on a day-old account: "think i found a bug when u filter by
  all time or 3 months".)
- **ACT-31.** On a young account Insights draws no chart that says nothing (Majd, Nov 20 2026, of Gaps on a day-old
  account: "It's not telling me anything. I don't know what to make of it."). Days before the account's first day are neither done nor missed: the
  week's circles draw them faintly and they open nothing, and at 7 days a count from a younger account is "1 of 1 day
  since 19 November", as the other ranges count, with no month beside it; the month beside the week counts from the
  account's first day when it began in that month ("5 of the last 7 days · 10 of 12 since 8 November"). Consistency's
  minutes by hour show once timed revisions or reads fall on 3 days of the range (one session's hour says nothing about
  when they revise). Memorization's month bars show once a month among them has a page memorized; until then the figure
  alone. Gaps says "No gaps yet" and draws nothing (ACT-28).

- **ACT-23.** Insights answer a tap: a day's circle (or a day of the weeks grid) opens that day, a missed one
  too (empty, with its +); Consistency's figure opens Overview at its month; Coverage's figure ("264 of 305
  memorized pages in 30 days ›") lists what wasn't revised in the range, a memorized juz as one row ("Juz 4 …
  41 days ago") and otherwise each run of pages ("Memorized today, not revised yet"), each row opening its juz
  (ACT-21); a month's bar under Memorization turns the figure into that month ("9 pages in October · …") and
  lists its memorizations, each opening its day, until the same bar is tapped again; Pace's "From 24 timed
  revisions ›" shows each one (its minutes a page as a dot against the range's pace and the same length
  before, then a row each, opening its day) and says how many had no time; a press that slides on the hour
  bars turns their title into the hour under the finger ("6–7 AM · 5 h 54 min", "15 sessions in 30 days, the
  last on Monday") until it lets go. (Majd, Nov 7 2026: "why's none of the activity screen interactive?";
  mocks i7, i8, i10 and i11.)

- **ACT-24.** "Revise these first tomorrow" (Weak spots), Plan it (the untouched juz, on every plan),
  the juz sheet's "Plan it for tomorrow first" and the Day's "Revise them tomorrow" put the pages in front of
  tomorrow's session (Insights' carry). They come in addition to tomorrow's scheduled pages, never in place
  of any: nothing shifts, whatever Keep daily amount says, and tomorrow is done (for the streak and Home's
  Done) when its own pages are, with or without them. A page tomorrow has anyway stays one of its own, put
  first; a day with no pages of its own (an off day) is done once the pages from Insights are revised.
  (Nov 8 2026: with every page of the day put first, none was its own, and Home said "28 of 28" and Continue
  revision for good.) On a custom plan this is temporary too, and the plan is never changed by it: under
  Plan it's "First tomorrow" (the untouched row, the juz sheet), "Add to plan ›" opens tomorrow's day of
  the plan with the pages added after its own, saying "… to this day in every cycle"; the plan changes
  only when it is saved (Majd, Nov 8 2026: "a temp change by default with the option to make it a perm
  change"; Plan it used to open that day with the juz alone, and saving replaced the day). The session
  names them ("From Insights: Juz 1"; it said "the weak pages" whatever put them there), and Home says
  "2 from Insights first". A toast confirms it ("Al-Hashr 17–24 goes first tomorrow"; several passages lead
  with the outcome, "6 pages go first tomorrow: …"; Undo puts the carry back as it was), and the button
  becomes "First tomorrow ✓", which can't be tapped again. (Majd, Nov 8 2026: "the buttons on the activity
  screen don't work": they saved, silently.)
  They never stop the catch-up (CARRY-1): on their day, the leftovers of the days before are offered as
  on any other, and Add to today puts them after the pages from Insights, each credited to the day it was
  missed (SESS-7). The pages from Insights stay labelled and stay extra, even when the leftovers fill the
  day, and Home names both ("2 from Insights, 5 from yesterday first"). (Before Nov 8 2026 they blocked it:
  no catch-up was offered that day.)
- **ACT-25.** A memorized page never revised counts from when it was memorized, or from the account's first
  day when that is later (nothing before it is on record). For 30 days it is "not revised yet", never "30+
  days": its Coverage tile, a page of the juz sheet's strip and a surah row there are neutral (a grey outline,
  "Not revised yet" in the legend while one shows), the juz sheet's headline says "Not revised yet" when none
  of the juz was revised, and it is never untouched the longest. A juz is as recent as its least recently
  revised page, so one with a page not revised yet (and none 30+ days) is "not revised yet": "Juz 30, 5 of
  23 pages revised, the rest not revised yet" for VoiceOver. After 30 days on record it is 30+ days, as a page
  revised 30 or more days ago is. Revo's juz map draws the same. (Majd, Nov 8 2026: a new account with Juz 30
  memorized and five pages revised showed Juz 30 red a day after it began.)
- **ACT-26.** Coverage shows the memorized pages three ways, Juz | Surah | Page (small pills under the
  figure; the choice is kept on the phone, like Week | Month), each coloured by ACT-25's recency, with the
  same legend, figure and untouched row (always juz). A juz tile, a juz's header and a surah chip fill from
  the left by the share of its memorized pages revised this week (dark) then this month (light), like
  Home's juz dots; the outline says what the rest is (grey not revised yet, red 30+ days), and the label is
  drawn in each part's own colour so it reads wherever the fill ends. A juz revised in full looks as before.
  Surah: a header per juz with memorized pages (its tile, filled, and where it stands: "5 of 23 pages
  revised, the rest not revised yet"); a tap shows or hides its surahs, by name, each with its pages in that
  juz (a surah running on into the next juz is under both, as the juz sheet's rows are). Open at first: the
  juz with something to act on (a page 30+ days or not revised yet), or with none the one revised least
  recently; what the user opens or closes is kept on the phone over that. A chip opens its juz's sheet.
  Page: a row per juz with memorized pages, a cell per page; a cell opens the reader there, a row's juz
  number its sheet. VoiceOver reads each: "Juz 30, 5 of 23 pages revised, the rest not revised yet", "An-Naba,
  revised this week", "At-Takwir, page 586, not revised yet". Revo's juz map fills the same way. (Majd, Nov 8
  2026: "for coverage shouldn't we allow for different views, not just juz?"; on the mocks: "fill is nicer
  than the bar", Surah filterable by juz, "having both surah and page is fine".)
- **ACT-27.** Activity's Overview and Insights show a change as soon as the server has it, without leaving the
  screen: a session or a revise-ahead saved before or while it is open shows once the phone has sent it (the
  screen reads its items again whenever a change leaves the outbox), as well as on coming back to it. Pull to
  refresh reads everything again, the items Overview and Insights read included, and its spinner always ends
  (after 10 s at most), on a transparent ground as Home's. (Majd, Nov 9 2026: "shouldnt this update whenever
  a user scrolls down to refresh the page instead of having to close out the app?")
- **ACT-29.** Activity's sections are the user's to arrange (every account from the mistake detection release): Edit sections (an icon at the end
  of the tabs row) opens the tab's sections, each with a switch to show or hide it; holding a section (350 ms,
  still) lifts it to drag to another place, and VoiceOver has Move up and Move down. Every change shows at once.
  Overview's month header stays on top; under it the month's totals, the calendar (always shown), its key and the
  picked day's summary. Insights: Coverage, Consistency, Gaps (where it is open, ACT-28), Weak spots (its Smart
  Tracking invite when that is off), Recitation (for an account that recites), Memorization, Pace; a section added
  later comes in after the one it follows in the usual order. A section the account can't have keeps its place;
  the first one shown has no hairline above it; with every Insights section hidden, one line says so with Edit
  sections. The layout is kept per account on the phone, never on the account; another account, or a new one,
  starts with the usual layout, which "Show all, in the usual order" brings back. Everyone else keeps the usual
  layout and no Edit sections. (Majd, Nov 16 2026: "all these 'sections' on activity should be configurable so
  users can pick what they want to see and should be able to drag and move them around".)

## Ask coach

- **COACH-1.** The coach answers only a previewTester account that has opted in. One answer is kept per insight and
  revision day, so a repeat ask is free and counts nothing. An account may ask 5 new questions a day (UTC). A monthly
  hard cap in dollars (`MONTHLY_CAP_USD`) stops every call once the month's reserved spend would pass it. A failed
  call gives back the question and its reserve.

- **COACH-2.** The coach is sent only the totals for the asked insight, as whole numbers (pages per day to a tenth).
  No notes, recordings, names or page lists. The server refuses any field the insight does not name.

- **COACH-3.** The model is claude-haiku-5-5, called from a Cloud Function only: the key is the ANTHROPIC_COACH_KEY
  secret and never reaches the app. The system prompt is stable and cached (above the 512-token minimum); each call
  is priced from its usage at the current rates (pricing.ts). A call retries only on 429 and 5xx (with the retry-after
  when short), with a timeout per attempt, and its log keeps the usage and never the content.

- **COACH-4.** The Ask coach sheet is for previewTester accounts only. Before the first question it says what is sent and
  asks the user to turn it on; the question then sends that one insight's totals, and nothing else. Insights no longer
  opens it: Weak spots' Ask opens Revo with that insight attached (REVO).

- **COACH-5.** The sheet shows the coach's answer and how many questions are left today; asked again the same day, it
  says the answer was kept. A refusal shows the server's reason (not available on this account, not turned on, today's
  questions used, paused for the month, busy), and a call that fails (offline, the phone not recognised by App Check,
  the model unavailable) shows an error. A refused or failed question is not counted.

## Revo

Revo is the in-app assistant (it supersedes the Ask coach, whose rules above still hold for its own calls).

- **REVO-1.** Revo is for the accounts its release switch opens it to (REVO-37: previewTester accounts until the
  production release), and off until the account turns it on (the opt-in, or Settings → Revo AI). The switch is Revo's own: turning on the Ask coach doesn't turn on Revo. Only the functions change that
  switch, its memory switch and the day's count; the account reads its own. During the changeover the server also
  serves an account that never set Revo's switch but has the coach's on (apps from before it read that one); only
  Revo's own switch turned off stops it.

- **REVO-2.** Every question sends the totals behind Insights (coverage, consistency, weak spots, pace) and today's
  blocks, as numbers and page numbers. A surah, a juz, pages, a day or a recording goes only with the question it was
  picked for with + (REVO-32, REVO-33): a day's notes only with that day, and the picker says so before it is added
  ("includes 2 notes"; there is no separate Notes option), a recording only as its length and pages, never the
  audio. Names are never sent. The server refuses any field the contract doesn't name, a page outside 1–604 and a
  question over 600 characters.

- **REVO-3.** An account may ask 20 new questions a revision day (it starts at Fajr or midnight, the user's setting). A
  later day starts the count again; a day earlier than the one counted is refused, so moving the phone's date back
  can't refill it. A failed call, or a reply with no answer, gives the question back.

- **REVO-4.** Revo and the Ask coach share one monthly hard cap in dollars and one ledger: $10 unless `config/coach`
  sets another (0 to $1,000, `functions/scripts/set-coach-cap.js`), read again within a minute, with no deploy. A
  question that would pass it is refused as `monthly`, makes no call and is given back; the real cost replaces each
  call's reserve, at the call's model's prices (Revo: claude-sonnet-5-5; the Ask coach: claude-haiku-5-5). The
  config is set to $150 (Nov 7 2026), within the $200 of API credit a month that only Revisely uses. One UTC day may
  spend at most a tenth of the month's cap on Revo (`config/coach.dailyCapUsd` sets another, 0 to the monthly cap):
  past it a question is refused as `resting`, saying in hours when Revo is back (the next UTC midnight), makes no call
  and is given back, and no Day in review is written, so a burst can't use up the month. A refusal that isn't one of
  ours (the platform turning a call away) says Revo is busy, never that the day's questions are used.

- **REVO-5.** A first question with nothing attached is kept for the revision day: the same question again (case and
  spaces aside) opens a new conversation with the same answer, with no call and nothing counted. A question with an
  attachment, a follow-up or another day is asked anew.

- **REVO-6.** The model is claude-sonnet-5-5, called from the functions with the `ANTHROPIC_COACH_KEY` secret (never in
  the app), with thinking off (`between_tools`: its thinking would count against the reply's tokens) and room for the
  whole reply. The system prompt is stable and cached (above the 512-token minimum). Logs keep counts, tokens, costs and
  why a reply stopped early, never a question, an answer or a note.

- **REVO-7.** An answer has at most one small chart and one suggested action, each on pages Revo was given (anything
  else is dropped, the answer kept). The app draws the chart from its own data, and a kind it doesn't know isn't
  drawn. A chart answers a touch: a tap (or a slide along the bars) picks a mark, the chart's header says what it is,
  and a panel under it leads on: a day to that day in Activity, a passage to the reader or to "Revise first
  tomorrow". Revo never changes the plan itself: "Add to my plan" and "Revise first tomorrow" put the pages first in
  tomorrow's session only when tapped, and "Not now" changes nothing. Attached text is never taken as an instruction.

- **REVO-8.** With memory on (the default), Revo keeps short facts from conversations (at most 30; the oldest go first)
  and sends them with later questions. The user sees every item, deletes one, clears them all or turns memory off
  (then none are read or written). Memory goes with the account when it is deleted or reset.

- **REVO-9.** The Day in review is written at most once a revision day, from the evening, on a day with something
  done; it never counts toward the day's questions and is skipped (never an error) when the month's cap is reached.
  The button's dot shows until it is opened (from its row under Revo's greeting, or from History; REVO-34). It is
  covered by Revo's opt-in.

- **REVO-10.** Conversations are kept with the account: a follow-up sends the conversation's last 10 messages with what
  was attached to them. The app reads its own conversations and memory and can't create them. Turning Revo off deletes
  its conversations, memory and kept answers (the day's count stays); deleting the account deletes all of it.

- **REVO-20.** Revo opens on a line written on the phone from today's data (where today stands, what is next and,
  with Smart Tracking on, which of it is weak), with suggestions; neither is a question or a call. Every first line
  starts "Assalamu alaikum, Majd." with the account's first name, or "Assalamu alaikum." without one (Majd, Nov 8
  2026: "revos greeting should be Assalamu alaikum not just salam"). Its own words name
  parts of the Qur'an by surah and juz (`lib/passages`): the greeting, the suggestions, a chart's rows and the + picker, never a page number alone.
  The context also carries each part it names in those words, for Revo's answers (REVO-27). A day with nothing
  left to revise reads as done, even before it is marked done, and no greeting or suggestion names an empty passage
  (Majd's phone, Nov 8 2026: "You're 28 pages into today, and  is next.").

- **REVO-34.** Each time Revo's sheet opens (its button, or another screen opening it), it opens on a new
  conversation with a greeting written from what the phone shows at that moment (REVO-20): after a session, pages
  added or revised, today finished, or the revision day starting again at Fajr or midnight, the next open says so.
  A conversation from earlier shows only when the user picks it: in History, or, while today's Day in review hasn't
  been opened, from its row under the greeting (it was written earlier and may no longer be true). Once the review
  is opened, from either, its dot and its row go for good, a follow-up asked in it included.

- **REVO-35.** The greeting doesn't repeat itself. The phone counts, per account and across restarts, the day's
  opens of a new conversation in the state today is in (not started or how many pages done, done, nothing planned).
  Today done: the first open after it says so, with Home's "Done · N" count and the streak; later opens lead with one
  thing from the account's own data instead, in turn, so two opens in a row differ: where the next revision day
  starts (as Home's "Tomorrow starts at …"), the weak part left longest (with Smart Tracking on: without it nothing
  is said about strength), the week's pages, the share of the Quran memorized. Not done: the greeting always says where today stands and what is next, and a second open with nothing
  changed follows that with the week, the share memorized or the streak, in turn, instead of the same offer. Nothing
  planned works like done. The first suggestion follows what the greeting leads with. All of it is written on the
  phone: no call, nothing counted.

- **REVO-21.** The first tap on Revo's button opens the opt-in, which says what is sent, that Claude, from Anthropic,
  answers (Anthropic doesn't train its models on it), and what isn't sent; with Smart Tracking off it says nothing
  about weak spots (REVO-36). Settings → Revo AI's switch opens the same opt-in. Nothing is sent before "Turn on
  Revo", the Day in review included. The sheet opens on the opt-in itself, at its height; a tap
  before the account's switch is read waits for it (up to 2 s), so an account with Revo on never sees the opt-in. The
  button shows only on the screens REVO-25 lists: never on the Read tab or in a session.

- **REVO-22.** When the day's questions are used, the composer is greyed and says when Revo is back (after Fajr, at
  its time, or at midnight); conversations stay in History.

- **REVO-23.** An answer shows in its conversation as the server stored it, for a first question and a follow-up alike.
  A question that can't be answered says why in the sheet: offline ("You're offline. Revo needs the internet."), the
  server's own reason (it didn't answer in time, it is busy, it couldn't answer that), the chat was deleted, or the day's
  or the month's limit (REVO-22); offline and unanswered questions can be tried again, with what was attached. Nothing
  in Revo's sheet takes the app down: an error inside it says so in the sheet.

- **REVO-24.** A full sheet reaches up to just under the status bar, on Android as on iOS. With the keyboard up, Revo's sheet sits on the keyboard and gets shorter: its header (Revo, History,
  Memory) and the conversation stay on screen, and only the composer rides up with the keyboard. Where the system has
  already made room for the keyboard (Android resizing the window), the sheet isn't lifted twice. A conversation
  showing its end keeps it in view as the list gets shorter or longer (an answer's chart and plan card included),
  unless the user has scrolled up to read.

- **REVO-25.** Revo's button is a 44pt disc (the smallest touch target, with room around it to tap), bottom-right, 14
  above the tab bar and the mini player. It shows on Home, Activity (Overview and Insights), a day in Activity, See
  all and Pages by strength, and nowhere else. There is no Revo on the Read tab (its list or the reader) or in a
  revision session, and their help sheets offer no "Ask Revo" (Majd, Nov 8 2026: "no revo in the revision
  sessions. there should also be no revo in the mushaf tab at all"); none in an editor or Settings either. The
  screens it shows on end their lists with room for it (`useRevoFootprint`), so their last row scrolls clear of it;
  other screens leave none.

- **REVO-26.** Revo's context is built when a question is sent, from what the phone shows then (changes still on
  their way to the server included): a Jump to, a session part done or finished, pages added to today, pages
  revised ahead, pages marked memorized, a new or edited plan. Notes never go in it (only as an attachment the user
  picks, REVO-2). What Revo is told about today, the week and the streak is what Home shows, from the same snapshot
  (`lib/todaySnapshot`): today's pages with the carried ones, how many are done ("6 of 20"), whether the day is done,
  and the streak, with the run that can still come back when yesterday was missed (SESS-6). Each of the last 7 days
  has the pages revised in its sessions, the pages its plan had and whether it was done, as the streak counts it.
  Today's numbers add up: the pages revised today are today's done pages, less those done ahead on an earlier day,
  plus the pages revised today that aren't today's. A page marked memorized counts on the revision day it was marked.
  The server still accepts the context of an app from before this.

- **REVO-27.** Revo answers like a warm coach: the answer first in one plain sentence, about what was asked, then at
  most one short sentence of why (about 35 words) unless asked for more, and one clear next step, in the action card
  when there is one. Today's progress comes up only when the question is about today or today is the next step; while
  today isn't done, the step is today's, not tomorrow's. Days are said as people say them ("today", "yesterday", "on Tuesday"), never as dates; parts of the Qur'an by
  surah and juz ("the end of Al-Hashr", "Juz 28"), with a page number only when the user uses or asks for one, after
  the surah. It never says the numbers disagree or corrects itself about them, and says it can't see something rather
  than guess. The context it reads is written out in those words (no dates, field names or JSON).

- **REVO-30.** Revo knows how the app works from its guide (`functions/src/revo/guide.ts`), in the cached part of its
  prompt: how each rule here works for a user, in plain words; where each screen, sheet and setting is and how to reach
  it; the steps for common tasks; what is for testers only; and what the app can't do, with the closest real way. A
  how, where or why question is answered from the guide, in at most two short steps and where to find it (about 35
  words), with nothing added about today's pages unless asked, and with the screen it names offered as a card. When the
  guide says the app can't do something, Revo says so plainly ("Not yet", "There's no …") and gives the closest way;
  when the guide doesn't mention it at all, Revo says it isn't sure that's possible in Revisely rather than guess. The guide
  covers every rule in this file (or says why one isn't for users to ask about) and names only screens the navigation
  has and labels the app shows, word for word; a test fails when that stops being true, so a feature's PR changes the
  guide with it. In Revisely Dev, Revo also knows what only Revisely Dev has (Recite and its marks, the hidden page,
  the takes kept): that part of the guide goes only with Revisely Dev's questions, so the store app's are asked exactly
  as before.

- **REVO-31.** An answer can offer to open a screen (`openScreen`): Jump to…, the schedule editor, the memorized
  pages, Activity (Insights are a tab at its top), the daily log, Settings at one of its sections, the prayer
  times, the Qibla, or the reader at a surah or a juz. The server drops any other screen, section, surah or juz (the
  answer kept, as with a page Revo wasn't given). An answer that suggests nothing but names one of those screens the way
  the app does ("Edit schedule", "Settings → Appearance", "Jump to…") gets that screen's card from the server, the
  first one it names. Nothing opens until the user taps the card's button, and an app that doesn't know an action shows
  no card for it.

- **REVO-32.** A surah, a juz or pages attached with + go with what the app shows for them, worked out on the phone
  from the sources Insights, Activity and the streak read, the way they read them: how many of its pages are
  memorized; its strength as Insights counts it (memorized pages revised at least once: weak, moderate, strong, the
  average to one decimal; the rest not rated yet) and its weak spots; when it was last revised and its page left
  longest; how many times it was revised in the last 7 and 30 days and on record (a page counts once a day; "in full"
  is the fewest times any of its memorized pages was); its pages on the plan over the 7 and 30 days before today,
  each revised on its day, carried over and revised later, revised ahead, or never revised, as the streak credits
  them; its pages in today's revision; and when the plan next has it. Parts are named by surah and juz. The figures
  add up (never more missed than planned) and the server refuses any that don't, an unknown field, or a surah or juz
  whose pages aren't its own. Revo answers about it from those figures alone, and says when the one asked about
  isn't there. Several things (at most six) can go with one question; the conversation keeps them for follow-ups.

- **REVO-33.** A day attached with + goes with what Activity shows for it, and for today what Home shows: its pages
  (today's carried ones too), each revised on the day, ahead on an earlier day, caught up later or not, and whether
  it counts as done for the streak; every page its sessions revised, with those for later and earlier days; its
  revision minutes, timed reading, pages marked memorized, ratings given, this phone's recordings, and its daily-log
  notes as written. What couldn't be read is sent as not known, never as nothing. The server refuses a day after the
  question's day, or whose place ("2 days ago") or figures don't match it.

- **REVO-36.** With Smart Tracking off (the account's setting; off unless turned on), Revo shows nothing of strength:
  no ratings chart, no strength strip in a chart's panel, no weak or strength column in a table, and no plan built
  on weak pages. Its charts show when each part was last revised and how often instead, and every chart that isn't
  about strength is still offered (asked why a part keeps slipping, a timeline of it). The server reads the
  setting from the account: Revo isn't told ratings or weak pages, and a ratings chart or a weak or strength column
  in its reply is dropped.

- **REVO-37.** Who has Revo is one switch, `config/app.revo` (`functions/scripts/set-app-config.js --revo`), read by
  the functions and the app: `testers` (or unset, or anything else) opens it to previewTester accounts only;
  `everyone`, to every signed-in account, with no new build (set at the production release); `off`, to nobody,
  testers included (an emergency). The functions apply a change within a minute. The app reads it when Revo is
  first needed and back in front after 10 minutes, keeps the last value on the phone (testers until it has read
  one), and reads it again at once when the server refuses Revo as paused or not open to the account; the button,
  Settings → Revo AI and every "Ask Revo" follow it. Such a refusal is said in the sheet as it is, never as the
  opt-in. Turning Revo off, turning memory off and deleting conversations or memory stay open to every account,
  whatever the switch.

- **REVO-38.** Revo's first line follows where it was opened (Majd, Nov 8 2026: "it should be adaptive depending on
  where i open it and what's going on"). Like REVO-20, it is written on the phone (no call, nothing counted), names
  parts of the Qur'an by surah and juz, and says nothing about strength without Smart Tracking (REVO-36).
  - Home, See all, today's day in Activity and Settings: today's line (REVO-20, REVO-35). A screen's help sheet
    opens Revo as that screen's button would.
  - A past day in Activity: what its plan held and how much of it was revised, its minutes and its notes, or that
    its pages weren't revised. A day ahead: how many pages it has and where they start.
  - Activity's Overview: the month so far (the days revised out of the days so far, and the pages).
  - Insights: with Smart Tracking on, the weak part left longest and when it was last revised; without it, the
    juz that has gone longest without coming round. Opened again: how much of what's memorized was revised in
    the last 30 days, then the pace against the plan.
  - Insights' "Ask Revo" on Weak spots, and Pages by strength: how many pages are rated weak and where most of
    them are.
  - A juz sheet's "Ask": how much of the juz is memorized, how often it was revised in full in the last 30 days and
    when last, and with Smart Tracking on how many of its pages are weak.

  A day's and the Overview's line end with today's next part while today isn't done. The suggestions follow the
  line. The day Revo was opened from (today or a past one, never a day ahead) or the juz goes with the next
  question, attached as + would attach it, and × removes it. Each place counts its own opens (REVO-35): opened
  again from the same place with nothing changed, the line's second sentence changes, in turn; another place, day
  or juz starts afresh, and "done" is still said once a day.

- **REVO-39.** The first time an account opens Revo while it's off (its button, Settings → Revo AI's switch, or a
  screen's Ask Revo), Revo's moment plays first, then Revo's opt-in (REVO-21), which is never skipped or
  shortened (Majd, Nov 9 2026: "whenever a new user clicks revo for the first time that way they know what revo
  is"). Skip ends it as in What's new (NEW-2). It plays once per account on that phone: played or skipped there,
  in What's new, on this first open or from Settings, it doesn't play on an open again. Settings → Revo AI →
  "What Revo can do" plays it any time, ending on Turn on Revo and Later while Revo is off, or Done.

- **REVO-40.** Revo notices patterns in the account's own last days and may say so, gently, with one practical idea
  (Majd, Nov 9 2026: "it should know such jargon like hey seems like you were making up blah blah blah how about we
  try..."). The app finds them from what Activity and the streak read (catch-up pages credited to earlier days,
  SESS-7; pages revised ahead credited to later ones, AHEAD-2; each day's session time) and sends them with the
  question and the Day in review, beside each day's caught-up and ahead pages and start time. Revo never reads a
  pattern into the numbers itself.
  - Catching up: the latest day this week that revised, for earlier days, at least half a usual day's pages (3 at
    least); it names those days and whether Keep daily amount is on.
  - Revising far ahead: the latest day this week that revised pages for 3 or more later days, at least two days'
    worth; with how many of those days have since come with nothing left to revise.
  - Late at night: at least 3 of the last 14 days with revision, and at least half of them, started between 10 PM
    and 4 AM.
  - Steady: a streak of 7 days or more, with nothing caught up this week.

  It mentions at most one, only when it fits the question (how they're doing, the week, their routine, the streak,
  catching up, the plan) or the Day in review is about that day; never in a how-to answer, and not again in the
  same conversation. Most answers mention none. No pattern is about strength, so Smart Tracking changes none of
  them. The app sends the patterns and the day facts only once config/app's `revoPatterns` is on (set after the
  functions that take them are deployed: older ones refuse fields they don't know); off, it sends what it sent
  before, and turning it off stops them with no deploy.

## Memorizing

- **MEM-1.** What is memorized is kept by the ayah (most people memorize ayahs, not pages: Majd, Nov 7
  2026). A page is memorized when every ayah on it is. A page with some of its ayahs memorized is partly
  memorized, and keeps which ones. Adding a page's last ayah makes it memorized, whether it came in one
  sitting or several. Adding ayahs to a memorized page, or ones already memorized, changes nothing.
- **MEM-2.** How much is memorized is measured in pages. A partly memorized page counts for the share of
  the page its memorized ayahs fill: their length on the page, not how many they are. This holds for
  Home's % memorized and its juz dots, the manager's progress, a juz's share, Insights' pages
  memorized each month and Revo's totals. Ayahs differ in length
  (Juz 30 is 9% of the ayahs and under 4% of the pages), so the share follows the text. A surah is
  memorized once every one of its own ayahs is, also when it ends partway down a page.
- **MEM-3.** Taking ayahs off the memorized takes only those. A memorized page keeps its other ayahs as
  partly memorized, and a page left with none is not memorized. Taking off just what was added puts every
  page back as it was.
- **MEM-4.** A partly memorized page is revised like a memorized one. It is in the revision cycle (the
  pages plan, the juz plan, the plans the editor builds, revising ahead, the streak, the widget), so a
  short surah, or a surah's end that shares its page, is revised before the rest of the page is learned.
  Home, the widget and Revo name it by its memorized ayahs: with only An-Nas memorized on the Qur'an's
  last page, the day "Starts at An-Nas", not Al-Ikhlas.
- **MEM-5.** On a day in Activity, a sitting from the reader whose pages aren't all memorized
  offers Add to memorized. The Memorized sheet opens on Ayahs, From and To never outside the pages the
  sitting held. From starts at the first ayah not yet memorized there, To at the end of those pages, and
  the sitting's minutes come with it. Whole pages and Surah are its other tabs; Whole pages keeps to the
  sitting's pages too, from the first not yet memorized to its last.
  - After adding, the sitting stands under Memorized. The block counts in ayahs when part of a page was
    memorized ("20 ayahs"), and says what finishes the page ("Al-Mulk 21–26 finishes the page").
  - Undo puts every page back as it was and takes the ayahs out of the day (MEM-3).
  - Memorized today, the block says where the pages stand in the plan. On an automatic plan it says when
    they first come up, with Revise them tomorrow and Edit schedule. On a custom plan, which doesn't
    add new pages by itself, it offers Add to your plan: tomorrow's day of it with the pages added after
    its own (it opened with them alone, and saving replaced the day).

- **MEM-6.** The schedule editor lists, under "Not in your plan", the memorized and partly
  memorized pages a custom plan doesn't hold, named by their ayahs. A custom plan never adds new pages by
  itself. Add offers "With tomorrow's pages" (they join tomorrow's day) or "As a day of its own,
  tomorrow" (the cycle grows by a day). Either is an edit to Save, and the list leaves at once. The
  automatic schedule holds every memorized page, so it has no such list. An edit on the automatic schedule (a day
  changed, a new plan) says before Save that saving makes it a custom plan, which pages memorized later won't join by
  themselves.

- **MEM-7.** The juz sheet shows a juz being learned (Activity). A page memorized in part is
  filled by the share of it that is memorized ("Part of a page" in the legend). A surah with ayahs
  memorized on such a page reads what is memorized and what is to go ("Ayahs 1–20 · 21–30 to go"),
  and opens the reader where it goes on. The sheet says what is learned so far ("Al-Mulk 1–20 so far"):
  as its headline, "Being learned", while nothing of the juz has been revised yet, and on a line of its
  own after that. Its button is Continue at the first ayah not memorized ("Continue at Al-Mulk 21").
  A page marked in progress with no ayahs saved has nothing memorized, and reads as not memorized.

## Help

- **HELP-1.** Screens that need explaining have a ?. Home's sits at the right of the Today
  post's header; the schedule editor's before Save; the reader's is a round button at the right of its
  header; a session's is the last row of its ⋯ menu, "How a session works" (its header is full);
  Activity's is in its top bar before search, and explains the tab on show (Overview or Insights); a
  day's is before +. It opens
  that screen's help ("How Home works"): at most four short topics, then "Ask Revo ›" when the account has
  Revo (it opens Revo; nothing is counted until a question is sent; never in the reader's or a session's help,
  REVO-25), "Hide help buttons", and Done. The
  words name surahs and juz, never page numbers. (Majd, Nov 8 2026: "helper buttons are good".)
- **HELP-2.** "Hide help buttons" removes every ? at once, for this account on this phone, and they stay
  hidden across launches. The screen they were hidden from says "Help buttons hidden. Settings → Help and
  support brings them back." with Undo. Settings → Help and support → Help buttons turns them back on, or off again.
- **HELP-3.** Help follows Smart Tracking: with it off, no topic mentions ratings or strength. A session's
  Rating topic and the new plan's "weakest first" show only with it on. Recite's topics show only where Recite is
  offered.
- **HELP-4.** The ? buttons are on by default: an account that has help sees them on every phone where
  its user hasn't hidden them, new or existing, with nothing stored. Only the user takes them away, with
  "Hide help buttons" or Settings → Help and support → Help buttons (HELP-2); a setting that can't be read leaves
  them on. Help is every account's since the November 2026 release (testers' before). (Majd, Nov 8
  2026: "the helper icons should be on by default for ex a new user account unless a user turns them
  off manually".)

## What's new

A short walkthrough after the update (`lib/help/whatsNew`, `components/whatsNew`; Majd, Nov 8 2026: "only
shows up once and they must go through it and complete it … just the main stuff").

- **NEW-1.** An account set up before a release sees that release's "What's new" once, after the update,
  when the release is switched on: its user document has no `whatsNewSeen`, or an earlier release's.
  Finishing it (Done) marks the release seen on the account, so no other phone shows it. Finishing
  onboarding marks the release it ran on, so an account set up on it never sees its walkthrough. A card
  shows only when the account has what it describes (a feature still for testers is left out). The kill
  switch (`config/app.whatsNewOff`) stops it showing.
- **NEW-2.** It is required: the walkthrough can't be skipped or closed, one Next a card and Done on the
  last. Revo's card plays by itself (about 19 s) and ends on Turn on Revo, which opens Revo's opt-in
  (REVO-21), or Later, which goes on and turns nothing on. While it plays, Skip in its top corner takes it
  to that end and a touch anywhere else does nothing; past 1.6× text it is words and Next like any card.
  A swipe right or Android's back goes to the card before. Leaving the app part way (or a restart) reopens
  it on the card it was on, on that phone.
- **NEW-3.** Settings → About → What's new shows the release's cards again, with a ✕, and changes nothing
  (testers see the row before the release is switched on). A tester's Settings → Testing → Show What's
  new at launch runs it as App Store users will see it from the next launch, resuming the same way;
  finishing that run turns the switch off and writes nothing to the account.
- **NEW-4.** It opens before Home, so nothing opens over it: "A new update is ready", "New version
  available" and Revo wait for Home, a widget's link opened at launch goes through after Done, and an
  update never restarts the app under it. Only "Update required" comes first.

## Naming the Qur'an

- **NAME-1.** The app names a part of the Qur'an by its surahs and juz, never by its page numbers
  (the owner, Nov 7 2026; `lib/passages`): Home's Today post ("Starts at An-Naba", "Continue at
  Al-Hashr, ayah 17", "Tomorrow starts at …"), its catch-up line, the recent sessions and See all
  ("Juz 28 · 41 min", "Al-Baqarah 142–176"), the session's end card ("Revision complete", "An-Naba to
  At-Takwir", "5 pages revised today") and Keep going. Amounts are fine ("20 pages"). Page numbers
  stay only as a quiet detail after the words (the › sheet's "… · pp. 542–561"), inside the reader
  and the session (the printed page), and where the user chooses by page (Jump to's Page tab, From
  and To). Any ayahs, not only whole pages, are named the same way: whole surahs and juz by name,
  the rest by surah and ayah ("Al-Mulk, ayahs 1–20", "Al-Mulk 27 to Al-Qalam 15"). Whole pages and
  the ayahs they hold read alike.

## Language and layout

- **LANG-1.** The app lays out the way its language reads, not the phone's: while it shows English it
  is left to right on every phone, Arabic or Persian or Hebrew included, from its first screen. React
  Native reads the direction at launch, so a launch that started the other way (the first on an Android
  phone set to an RTL language, or after the phone's language changed) restarts once, in the splash; if
  that restart doesn't take, the app carries on as it is rather than restart again. Never in tests or
  E2E builds. (Until Nov 2026 an Android phone set to an RTL language mirrored the English app: rows,
  the tab swipe, the verse highlights and the mushaf's page order, and until Nov 22 2026 its first
  launch still did; `src/i18n/direction.ts`.)
- **LANG-2.** (Revisely Dev) In Arabic (right to left), the mushaf still reads like a printed one: page 1 on the
  right, the next page coming from the left (a swipe from left to right turns forward), the same as in English. A
  page is never mirrored: its image, verse highlights, a hidden page's covers and Recite's marks stay on their words,
  and a swipe credits the page it left (SESS-1). A held verse's menu opens beside the verse. (Until Nov 21 2026 the
  pager was pinned left to right while React Native's list measured from the right, and the page came out black.)

## The Ramadan theme (Revisely Dev)

- **THEME-1.** Settings → Appearance → Ramadan theme (on until turned off, kept on that phone, not the account) dresses
  the app for Ramadan and changes nothing it does (Majd, Nov 21 2026): on Home, light falling softly over the glow,
  lanterns hanging in the top bar's empty side (gone while the timer chip shows there) and a crescent by the greeting;
  string lights along the tab bar. None of it is drawn over the mushaf page, a revision session's page or a Recite take,
  none of it takes a touch or is read by VoiceOver, and with Reduce Motion it stays still. The store app has no switch
  and never shows it (`lib/ramadanTheme`, `components/ramadan`). The Settings row is just its name and the switch. It is
  on by default (Majd, Nov 22 2026: "yes ramadan theme as default for dev too"), and at the next release
  (`RAMADAN_THEME_RELEASED`, Majd, Nov 21 2026) every app has it, the same way.

## Recite on the phone (Revisely Dev)

- **ONDEV-1.** Settings → Testing → On-device model times Recite's model on this phone, the first step to checking
  recitation on the phone instead of the server (Majd, Nov 23 2026). It lists this platform's runs from the dev
  backend (each a model file, a processor (CPU, Core ML, XNNPACK or NNAPI) and a thread count; all chosen, any left
  out), downloads what the chosen runs need once (only for accounts the team has given bench access: Revisely Dev is open
  to anyone with its link; the models are the watermarked ones; each file checked by size and SHA-256, kept on the
  phone out of backups; without access it says so) and runs them one after another with the screen kept on. Each run first checks the model on the
  checker's own output (the features within 0.0002, the model's output and its top sound per frame), then times 60,
  200 (the default) or 600 windows (4 seconds of recitation each) of a public recitation clip, and shows the model's
  time per window (median, p90, p95, worst; under or over 150 ms at p95), the features', the share of a half second
  both take, load and second-load times, memory, and the first and last windows' times with the phone's heat. A run
  can open its model from bytes in memory instead of its file, as the real path will after decrypting it, and hold the
  engine's second (any-length) graph beside it, for the memory with both. A long run
  (5 or 20 minutes, research's protocol) takes the first chosen run at a live pace, a window every 0.5 or 1 second (the choice is on the screen),
  and notes the battery, the thermal state and the window times each minute: it says whether the phone got hot
  (serious or worse), whether the last minute was within 20% of the first, and the battery's drop an hour (nothing on
  a charger). A run the app left the foreground during, or that stalled, says so on its result and in its record ("Don't use these numbers"). A run that fails says why and the others go on. The results go to the dev backend (the phone's model,
  chip, cores and memory, the build, each run's numbers; never the account or any audio) and can be shared. The store
  app has none of it: the native module is linked into Revisely Dev's builds only.

## Premium early access

Majd, Nov 16 2026: "give everyone premium access right now … it'll be paid for in the future but anyone who has
premium now will keep it forever". Nov 18 2026: "for end date tbd i meant new people from singing up and taking advantage
of this deal. those users can have premium for life".

- **PREM-1.** While Premium is in early access (`config/app.earlyAccess`), every account gets Premium with no end date:
  an account set up then gets it from the server as soon as it is set up, and older accounts get it from the owner's
  script. Early access itself has no end date yet. Marking mistakes' intro says Premium is free for everyone during
  early access, which has no end date yet, will be paid after it, and is kept for life, and its Get Premium gives it at
  once; "Can't afford it? Apply for support" is hidden. Settings' Account page's Premium row says the same (a take's
  summary doesn't: Majd, Nov 21 2026). A grant once given is never changed or taken away, after early access too; once early access ends, new
  accounts don't get it and the intro's Get Premium no longer gives it. The words say early access and for life, never
  trial, a price or a date.

## Known bugs

Each has a `KNOWN BUG` test that fails on purpose. Fixing one turns its test red: change it to an
ordinary test in the fix's PR.

None open.

Fixed in November 2026 (the tests that pinned them are ordinary tests now):

| Rule | What happened | Fix |
| --- | --- | --- |
| DAY-2, DAY-8 | Near the date line (Kiritimati, Samoa, Tonga; Fiji around October and November) "today's Fajr" was another day's, so after Fajr it was still yesterday, or a day was skipped. | `dayTimes` (`src/lib/prayer/times.ts`) takes the prayers whose Dhuhr falls on the day, and builds a day adhan skips from the days either side. |
| DAY-8 | With a saved place far from the phone's zone, `getNextRevisionDayStart` named a time when the day doesn't turn (widget days listed twice, reminders ending early). | It returns the first midnight or Fajr at which the revision day changes (`src/lib/fajrBoundary.ts`). |
| DAY-2 | With Turkey's method (Diyanet) near the Arctic Circle, for about a week either side of the June solstice, the Prayer sheet showed Fajr a minute or two after Sunrise (Tromsø, north-west Iceland). The method shows sunrise 7 minutes early, and a seventh of a night that short is less than that. | A method's earlier sunrise stops a minute after Fajr, which stays as adhan gives it; every time is to the minute (adhan's rounding kept milliseconds) (`timesOf`, `src/lib/prayer/times.ts`). |
| SCHED-6 | A carry-over shift on a custom plan with a page on two neighbouring days could put that page twice on one day. | A shifted day takes such a page once and goes on to the next (`shiftedCycleDay`, `src/lib/algorithm.ts`). |
| CARRY-5 | With scattered leftovers, saving an edit to a later day brought a page revised yesterday back into today. | Saving keeps today's carry-over as it was (`settleCarryOverForNewPlan`, `src/lib/planChange.ts`). |
| SESS-2, CARRY-2 | Today's session saved, then Add to today with Keep daily amount: the pages moved to tomorrow stayed in the session's assigned pages (the rules let them only grow), so Home said Done but the streak didn't count today. | A save from the session screen cuts the session's assignment to the day's own pages, in a change of its own (`session.assigned`, `src/lib/offline/ops.ts`); `firestore.rules` lets the list shrink to some of its pages. |
| CARRY-2, SESS-7, SESS-2 | Keep daily amount with as many leftovers as today holds or more made today the leftovers alone, with no pages of its own: once they were all revised, Home still said "Continue at … 6 of 6", never Done, and today never counted for the streak. | A day the carried pages fill is finished by them (`duePagesOf`, `src/lib/carryOver.ts`): they are its session's assignment, and its session revising them finishes it while they stay credited to the days they were missed (`needDone`, `src/lib/aheadCredit.ts`). |
| SESS-6, CARRY-2 | A day missed entirely, added to today with Keep daily amount and revised, didn't come back: with no session of its own, the streak read it from the plan the carry had moved, which gave it other pages. | A day the last carry took pages from is read from the carry (`planDuePages`, `src/lib/carryOver.ts`). |
| SESS-6 | A streak brought back in the grace window lasted a day: the next morning it fell back (6 to 1), because the run behind yesterday counted only days done on their own day. | A day restored in its grace window counts as on time from then on (`graceEndMs`, `src/lib/streakFromItems.ts`). |
| ACCOUNT-3 | Delete account could stay on the spinner for good (Android E2E, Nov 7 2026): the server deleted the account in a second, its answer never reached the phone, and the call had no time limit, nor had the steps after it. | `deleteUserAccount` gets 30 s (`callFunction`'s `timeoutMs`), then Auth is asked whether the account still exists (`src/services/firestoreService.ts`); each later step has its own limit (`src/context/AuthContext.tsx`); Settings offers Try again. |
| ACCOUNT-2 | A sign-up or sign-in that failed emptied the form: the attempt showed the launch spinner in place of the sign-in screen, so a failure mounted it again from scratch, back on "Sign in" with only the error left. | An attempt has its own flag (`isSigningIn`, `src/context/AuthContext.tsx`); the screen stays and shows it on its button. |
| SESS-7 | A session's first save holding catch-up pages alone lost their credit: the empty session was written without it. | `mergeSessionAdd` keeps it (`src/lib/offline/ops.ts`). |
| SYNC-4 | A new account could stay on "loading" until the app was relaunched. | Page and session listeners hear when the server confirms the cache (`onQuerySnapshot`, `src/services/firestoreService.ts`). |
| ACCOUNT-3 | Delete account froze the phone (Nov 10 2026): the server's removals of the 604 pages and the sessions streamed into the app's listeners, and Firestore's JavaScript took about 20 s over them on a fast Mac before "Account deleted" could show; on a phone two or three times slower that passes the 30 s the app waits, and says the server didn't answer after a delete that worked. | The account's listeners stop before the server is asked and start again if the account is still there (`pauseAccountListeners`, `src/services/firestoreService.ts`), and Firestore's string comparator is made fast for Hermes when the bundle is built (`metro/firestoreCompare.js`). |
| SYNC-4, ONBOARD-1 | Sign-up froze the phone for about 5 s on a fast Mac (Nov 10 2026): its 604 page writes went through the live pages listener, each page three times (written, confirmed, sent back). | The pages listener waits while sign-up writes the pages and reads them once after (`initializeAllPages`), with the faster comparator. |
| SYNC-4 | A new account stayed on "loading" for as long as the server took to acknowledge sign-up's 604 page writes and send them back (Nov 2026): over a minute on a CI simulator, where 01-onboarding failed on it about half the time. The pages listener waited while the pages were written (the row above), and the app showed pages only from the server. | The app shows the pages it has just written at once (`onPagesWritten`, `src/services/firestoreService.ts`; AppContext); the listener's server read replaces them. |
| SYNC-4 | Two creators of a new account (Nov 2026): on a phone the account's listener heard "no user document" while sign-up was still setting the name, and created one too. The rules refused one ("appeared while creating them"), and when the listener's won, the account had no name (Apple's, sent on the first sign-in only, was lost for good). | A sign-in that may create the account is its one creator while it runs, and the listeners wait for it (`asAccountCreator`, `src/services/firestoreService.ts`; AuthContext).
| RESET-2, RESET-3 | Reset my data and Load test scenario streamed the server's rewrite of the account into the listeners, one change at a time (Nov 10 2026): with Firestore's faster comparator (#509), a Hafiz scenario still froze the phone for 1.5–1.8 s on a fast Mac while the server worked, and a reset for 0.8–1.0 s. | The listeners pause while the server rewrites the account and read it afresh once it answers (`whileServerRewrites`, `src/services/firestoreService.ts`): no freeze while the server works; the account loaded afterwards is read once. |
