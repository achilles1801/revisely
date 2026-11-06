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
  counts the day.
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
  (#198).
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
  one line above today's action with "Add to today" beneath it: "Left yesterday · Revise p. 3–5" for a
  day started and not finished, "Missed yesterday · Revise p. 1–5" for a day with no session, and
  "Missed 3 days · Revise pp. …" when several days come to more than one. Earlier days are not offered.
  A page revised at any point in those days is never offered, whichever day the schedule had it on.
- **CARRY-2.** Keep daily amount (`shift`, the default): today keeps its size. The leftovers come
  first, and the rest of the plan slides back by as many pages.
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
- **SYNC-5.** The same day revised on two phones while both were offline keeps every page either
  phone revised, in one session for the day.

## Recitation

- **AUDIO-1.** On Android, a recitation that stops leaves no notification behind: ■ or ✕ in the app,
  the end of its range, and the app swiped away from recents (whose screens then stop it). A
  notification left by an earlier run goes when the app starts. Stopping never makes Android close
  the app.
- **AUDIO-2.** On Android, Pause and ▶ on the recitation's notification work with the app away;
  paused, the notification stays, and the app shows what was pressed.

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
  oldest, or never.

- **ACT-5.** The add menu has one add per kind (Revised, Memorized, Read, Note), each on its own tab. "From
  your session" offers only the pages the session missed: its skipped pages not revised, among the memorized
  ones. It never copies the session's own revised pages or minutes.
- **ACT-6.** A note swiped away goes at once, with Undo; the delete is saved after the undo window (five
  seconds), and leaving the screen saves any delete still waiting. A hold on a Read or Note row opens Edit and
  Copy.

- **ACT-7.** Deleting a Revised session or a Memorized entry asks first, and names what goes. A memorized
  entry's pages go back to not memorized (only those still memorized) and its item is removed. A failed
  removal is kept and retried, never dropped.

- **ACT-8.** A revised page's strength comes from its weakness rating (1–5): 1–2 is weak, 3 is moderate, 4–5
  is strong. The counts on a day's Revised block are these classes, over the day's revised pages (a page with
  no rating counts as 4, strong). Confirmed by Majd, Nov 2026.

- **ACT-9.** A day's Activity items load when the day opens and again when its screen regains focus, not
  on their own: a render never starts another load (it looped and froze the app, Nov 2026).

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
| SYNC-4 | A new account could stay on "loading" until the app was relaunched. | Page and session listeners hear when the server confirms the cache (`onQuerySnapshot`, `src/services/firestoreService.ts`). |
