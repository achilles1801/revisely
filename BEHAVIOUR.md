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
  new account's 604 pages arrive in two batches (1–450, 451–604), and a juz from the second can be
  marked before it lands. Continue never saves a selection without a marked page: while a marked page
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

## Revising ahead

- **AHEAD-1.** Once today is done, Home offers the next revision day ("Tomorrow starts at …"), from its
  first page not done yet. Tapping it opens that day's pages alone, as if it were that day's session:
  today's pages are not behind them (Nov 5 2026). The next day's pages already done are left out
  (#198). After Keep daily amount filled today with leftovers (CARRY-2), the next day starts with
  today's own pages.
- **AHEAD-2.** A page revised ahead counts for the day it is scheduled on, not the day it was revised.
  That day then needs only the pages left, and is done when none are.
- **AHEAD-3.** The end card's Keep going goes on to the next revision day's pages not done yet,
  which the session then holds alone (the day before is not behind them). Done again, it goes on
  to the day after. It stops at the end of a cycle. Mark in bulk works on the day on screen.
- **AHEAD-4.** A day already done ahead is passed over: Keep going and Home's next line go to the day
  after it (the owner's rule, #198).
- **AHEAD-5.** A page is credited ahead only when it was revised in that session (checked or swiped).

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
  within 10 minutes.
- **RESET-3.** A tester can load a test scenario from Settings (Load test scenario, typed RESET): the
  account is reset as in RESET-2 (the same backup first) and filled with the scenario, on the revision
  days this phone shows (its zone, clock and Fajr). Every rule above that can be read off an account
  holds for each scenario, and the phone shows it with no relaunch. No other account can, and not
  again within 2 minutes (30 a day). The Offline queue scenario holds its changes on the phone until
  "Send held changes" (or the next start of the app), then sends them in order.
- **ACCOUNT-1.** Delete account (Settings, confirmed twice) removes the account from the server with everything of it
  (pages, sessions, notes, Revo's and the coach's data, backed-up recordings) and signs the phone out. Offline, or when
  the server refuses (App Check), nothing is deleted and the user stays signed in.
- **ACCOUNT-3.** Delete account always ends, in "Account deleted" (signed out) or an error with Try again: never an
  endless spinner. The app waits for the server at most 30 seconds. With no answer (lost, or offline), it asks whether
  the account still exists: gone, it is deleted; there, or no way to tell, the error says the account may not be deleted
  and to try again. A Try again after the server had deleted it ends in "Account deleted". Once the server has deleted
  it, nothing on the phone (its copy, signing out) keeps the spinner up more than a few seconds.
- **ACCOUNT-2.** A sign-up or sign-in that fails (an address already registered, a wrong password, Google or Apple
  refused, no connection) leaves the sign-in screen as it was: the same mode, the name, the email and the password
  still typed, with the error under them. A password reset that fails keeps the email. While an attempt runs, it
  shows on its button; only the launch shows the spinner in place of the screen.
- **SYNC-5.** The same day revised on two phones while both were offline keeps every page either
  phone revised, in one session for the day.

## Recitation

- **AUDIO-1.** On Android, a recitation that stops leaves no notification behind: ■ or ✕ in the app,
  the end of its range, and the app swiped away from recents (whose screens then stop it). A
  notification left by an earlier run goes when the app starts. Stopping never makes Android close
  the app.
- **AUDIO-2.** On Android, Pause and ▶ on the recitation's notification work with the app away;
  paused, the notification stays, and the app shows what was pressed.
- **AUDIO-4.** When the day's recordings or Listen back go away (another day picked, the screen
  closed) while a recording plays, it stops and its player is freed: nothing plays on with nothing
  on screen to stop it.

## Activity

- **ACT-1.** A memorized page is filed under the same revision day as everything else in Activity: the
  day it is in, turning at Fajr when the user has the Fajr boundary on and a location (the moment before
  that day's Fajr belongs to the day before). Otherwise it is the calendar day in the user's own time
  zone, which is the zone their revision sessions were written in (the offset under which each session's
  `createdAt` falls on its `date`); with no sessions, the saved location's zone, then UTC. (Changed Nov 5
  2026: memorized items used to have no Fajr shift; Majd chose one day rule for all of Activity.)
- **ACT-2.** A day's Revised block is built from its revision items: one per day, with the pages revised
  ahead for later days listed apart. A revision note in the daily log is not a second entry; it shows
  under the Revised block. Shown to preview testers while the Activity blocks are built.

- **ACT-3.** The calendar's day shows the share of the day's assigned pages revised (a ring), and a dot for a
  memorized item, a read item and a note on that day. A month steps with ‹ ›. Shown to preview testers while
  the Activity blocks are built.
- **ACT-4.** Insights use one definition each: coverage is the share of memorized pages revised within 7 or 30
  days (a longer window never covers less); consistency is the days with a revision or a read; pace is shown
  only from at least ten timed items; juz untouched longest is the juz whose least recently revised page is
  oldest, or never, among the juz at least half memorized (a juz under half is shown as being learned, so a
  page memorized today never makes its juz the one untouched longest).

- **ACT-5.** The day's + offers, for today and yesterday, Revised elsewhere, Memorized and Note (Majd, Nov 7
  2026: "yes trim it"). There is no Read (the reader logs reading by itself) and no free choice of pages to
  mark revised. Revised elsewhere lists the day's scheduled pages (its session's assignment, or the plan's)
  that are memorized and not revised for it yet, each ticked; untick the ones not done, and Add logs the
  rest for that day by hand, with no strength and no minutes. A page already revised for the day is never
  offered again; with none left it says so. Memorized opens its own sheet: From and To, or a surah, and
  optional minutes. Add marks the pages memorized (the composer's two writes) and records a Memorized item
  for that day, dated that day; its minutes join the day's item once (an add sent again adds none). "From
  your reading" offers the pages read that day that are not memorized yet. Note opens its own sheet: its
  text, and an optional "Show under" choice of the day's Revised, Memorized or Read item (the note's tag).
  Add is a new note with its own id and time; an empty note cannot be added.
- **ACT-6.** In the daily log, a note swiped away goes at once, with Undo; the delete is saved after the undo
  window (five seconds), and leaving the screen saves any delete still waiting. In the Activity day, the rows under
  a block (notes, timed reads) have no hold and no swipe: they are edited and deleted in the daily log. A block
  header (Revised, Memorized, Read) holds a menu: Edit for a timed read, Delete for each item (confirmed first).
  VoiceOver offers the same actions as custom actions on the header.
  The menu is the iOS-style long-press menu: a preview of the held item (its label and text) with its actions
  beneath it, over the dimmed screen. An action runs once the menu has closed; touching the backdrop runs nothing.
  The daily log's note menu is the same menu (Edit, and Copy when the note has text).

- **ACT-7.** Deleting a Revised session or a Memorized entry asks first, and names what goes. A memorized
  entry's pages go back to not memorized (only those still memorized) and its item is removed. A failed
  removal is kept and retried, never dropped.

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
- **ACT-12.** Insights live in Activity (Calendar | Insights) for accounts with the new Activity (preview testers
  while its blocks are built): their tab bar is Home and Read, with or without Smart Tracking, and there is no
  Insights tab to reach. Without Smart Tracking no page is rated, so Activity's Insights has no Weak spots (no Ask,
  no "See all"): one line stands in its place, "Turn on Smart Tracking to see your weak spots ›" (a link, not a
  guide), which opens Settings at Revision, where its switch is; once it is on, Weak spots shows. With it, Weak
  spots ends in "See all pages by strength": every revised page, weakest first, by page, surah or juz, filtered by
  juz and by strength (the Insights tab's Browse). Other accounts keep the Insights tab as before. (Majd, Nov 6
  2026; the line, Nov 7.)
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

- **REVO-1.** Revo is for previewTester accounts only, and off until the account turns it on (the opt-in, or Settings →
  Revo AI). The switch is Revo's own: turning on the Ask coach doesn't turn on Revo. Only the functions change that
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
  config is set to $150 (Nov 7 2026), within the $200 of API credit a month that only Revisely uses.

- **REVO-5.** A first question with nothing attached is kept for the revision day: the same question again (case and
  spaces aside) opens a new conversation with the same answer, with no call and nothing counted. A question with an
  attachment, a follow-up or another day is asked anew.

- **REVO-6.** The model is claude-sonnet-5-5, called from the functions with the `ANTHROPIC_COACH_KEY` secret (never in
  the app), with thinking off (`between_tools`: its thinking would count against the reply's tokens) and room for the
  whole reply. The system prompt is stable and cached (above the 512-token minimum). Logs keep counts, tokens, costs and
  why a reply stopped early, never a question, an answer or a note.

- **REVO-7.** An answer has at most one small chart and one suggested action, each on pages Revo was given (anything
  else is dropped, the answer kept). The app draws the chart from its own data. Revo never changes the plan itself:
  "Add to my plan" puts the pages first in tomorrow's session only when tapped, and "Not now" changes nothing.
  Attached text is never taken as an instruction.

- **REVO-8.** With memory on (the default), Revo keeps short facts from conversations (at most 30; the oldest go first)
  and sends them with later questions. The user sees every item, deletes one, clears them all or turns memory off
  (then none are read or written). Memory goes with the account when it is deleted or reset.

- **REVO-9.** The Day in review is written at most once a revision day, from the evening, on a day with something
  done; it never counts toward the day's questions and is skipped (never an error) when the month's cap is reached.
  The button's dot shows until it is opened. It is covered by Revo's opt-in.

- **REVO-10.** Conversations are kept with the account: a follow-up sends the conversation's last 10 messages with what
  was attached to them. The app reads its own conversations and memory and can't create them. Turning Revo off deletes
  its conversations, memory and kept answers (the day's count stays); deleting the account deletes all of it.

- **REVO-20.** Revo opens on a line written on the phone from today's data (where today stands, what is next and which
  of it is weak), with suggestions; neither is a question or a call. Its own words name parts of the Qur'an by surah
  and juz (`lib/passages`): the greeting, the suggestions, a chart's rows and the + picker, never a page number alone.
  The context also carries each part it names in those words, for Revo's answers (REVO-27).

- **REVO-21.** The first tap on Revo's button opens the opt-in, which says what is sent and what isn't; nothing is
  sent before "Turn on Revo", the Day in review included. The sheet opens on the opt-in itself, at its height; a tap
  before the account's switch is read waits for it (up to 2 s), so an account with Revo on never sees the opt-in. The
  button shows on the main screens only, never in the reader or a session.

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
  above the tab bar and the mini player. The screens it shows on end their lists with room for it
  (`useRevoFootprint`), so their last row scrolls clear of it; other screens leave none.

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
  guide with it.

- **REVO-31.** An answer can offer to open a screen (`openScreen`): Jump to…, the schedule editor, the memorized
  pages, Activity (testers' Insights are a tab at its top), the daily log, Settings at one of its sections, the prayer
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

## Naming the Qur'an

- **NAME-1.** The app names a part of the Qur'an by its surahs and juz, never by its page numbers
  (the owner, Nov 7 2026; `lib/passages`): Home's Today post ("Starts at An-Naba", "Continue at
  Al-Hashr, ayah 17", "Tomorrow starts at …"), its catch-up line, the recent sessions and See all
  ("Juz 28 · 41 min", "Al-Baqarah 142–176"), the session's end card ("Revision complete", "An-Naba to
  At-Takwir", "5 pages revised today") and Keep going. Amounts are fine ("20 pages"). Page numbers
  stay only as a quiet detail after the words (the › sheet's "… · pp. 542–561"), inside the reader
  and the session (the printed page), and where the user chooses by page (Jump to's Page tab, From
  and To).

## Known bugs

Each has a `KNOWN BUG` test that fails on purpose. Fixing one turns its test red: change it to an
ordinary test in the fix's PR.

None open.

Fixed in November 2026 (the tests that pinned them are ordinary tests now):

| Rule | What happened | Fix |
| --- | --- | --- |
| DAY-2, DAY-8 | Near the date line (Kiritimati, Samoa, Tonga; Fiji around October and November) "today's Fajr" was another day's, so after Fajr it was still yesterday, or a day was skipped. | `dayTimes` (`src/lib/prayer/times.ts`) takes the prayers whose Dhuhr falls on the day, and builds a day adhan skips from the days either side. |
| DAY-8 | With a saved place far from the phone's zone, `getNextRevisionDayStart` named a time when the day doesn't turn (widget days listed twice, reminders ending early). | It returns the first midnight or Fajr at which the revision day changes (`src/lib/fajrBoundary.ts`). |
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
