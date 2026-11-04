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
  for the saved location. From midnight until Fajr it is still the day before.
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
- **SCHED-6.** A day never holds the same page twice.

## A revision session

- **SESS-1.** Swiping off a page marks it revised, the last page by swiping onto the end card. The
  check marks or unmarks the page on screen.
- **SESS-2.** A day is done when all its pages are credited to it. Home then says Done, and the streak
  counts the day.
- **SESS-3.** Leaving the session (Back) saves what was marked. Nothing marked: nothing is saved.

## Revising ahead

- **AHEAD-1.** Once today is done, Home offers the next revision day ("Tomorrow starts at …"). Tapping
  it opens the session on that day's first page, after today's pages.
- **AHEAD-2.** A page revised ahead counts for the day it is scheduled on, not the day it was revised.
  That day then needs only the pages left, and is done when none are.
- **AHEAD-3.** The end card's Keep going adds the next revision day's pages to the session. Done
  again, it adds the day after. It stops at the end of a cycle.
- **AHEAD-4.** A day already done ahead is passed over: Keep going and Home's next line go to the day
  after it. (The owner is deciding whether to keep this; see PR #197.)
- **AHEAD-5.** A page is credited ahead only when it was revised in that session (checked or swiped).

## Carrying pages over

- **CARRY-1.** Pages left in yesterday's session (started, not finished) are offered on Home ("from
  yesterday"), once a day.
- **CARRY-2.** Keep daily amount (`shift`, the default): today keeps its size. The leftovers come
  first, and the rest of the plan slides back by as many pages.
- **CARRY-3.** Add (`add`): the leftovers go on top of today's pages, and nothing else moves.
- **CARRY-4.** A day with no session carries nothing over: a missed day is not added to the next.
- **CARRY-5.** Saving an edit to the plan (not a new plan) leaves today's pages as they are, unless
  the edit changes today itself.

## Offline, devices and accounts

- **SYNC-1.** Offline, the app works from the copy on the phone. Changes reach the server, in order,
  once it is back online.
- **SYNC-2.** A cold start offline shows the account as it was last seen, with the changes made
  offline.
- **SYNC-3.** Another device signed in to the account sees the changes once they have synced.
- **SYNC-4.** A new account loads right after sign-up, with no relaunch.

## Known bugs

Each has a `KNOWN BUG` test that fails on purpose. Fixing one turns its test red: change it to an
ordinary test in the fix's PR.

| Rule | What happens | Where | Test |
| --- | --- | --- | --- |
| DAY-2, DAY-8 | Near the date line (Kiritimati, Samoa, Tonga; Fiji in its summer), "today's Fajr" is another day's: the revision day stays a day behind after Fajr, or a day is skipped. `dayTimes` gives adhan the phone's local date, which adhan takes as the date of the sun's transit in UTC. | `src/lib/prayer/times.ts` `dayTimes` | `scenarios/day.scenario.tsx` (Kiritimati), `properties/day.property.ts` |
| DAY-8 | With a saved location far from the phone's zone, `getNextRevisionDayStart` names a time when the day doesn't turn (widget days listed twice, reminders ending early). | `src/lib/fajrBoundary.ts` | `properties/day.property.ts` |
| SCHED-6 | A carry-over shift on a custom plan that repeats a page on neighbouring days can put that page twice on one day. | `src/lib/algorithm.ts` `shiftedCycleDay` | `properties/schedule.property.ts` |
| CARRY-5 | With scattered leftovers, saving an edit to a later day brings a page revised yesterday back into today. | `src/lib/carryOver.ts` `settleCarryOverForNewPlan`, `src/lib/planChange.ts` | `properties/carryover.property.ts` |
| SYNC-4 | A new account can stay on "loading" until the app is relaunched: the pages' only snapshot was the phone's own write (from cache), and the server's answer never comes as one (`subscribeToPages` has no `includeMetadataChanges`). | `src/services/firestoreService.ts`, `src/context/AppContext.tsx` | `scenarios/sync.scenario.tsx` |
