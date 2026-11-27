# Every kind of user: the matrix

Majd, Nov 27 2026, after Home showed a new account's "Mark memorized pages" on a rest day of his plan (HOME-9, #1050):
"can we have a session sweep through all different possible scenarios that could arise from every type of user so we
can make sure we take into account every single case and edge case so bugs like this never come again".

This file lists the kinds of user and state the app meets, the screens that describe them, and what tests each pair.
`BEHAVIOUR.md` holds the rules; this file says which user each rule has been checked for.

**Keep it current.** A new screen or a new kind of user gets its row or column here, in the same PR as its tests. A bug
found in a cell gets that cell's test and a link to its rule.

**How it lasts.** `properties/userMatrix.property.ts` generates accounts across the rows below (memorized, plan, day,
settings, the clock), runs what each screen shows from them through the app's own code, and checks the rules every
screen keeps (the list at the end). `scenarios/userTypes.scenario.tsx` opens the real Home, against the emulators, for
one account of each user type that is easy to forget, and `scenarios/screensAgree.scenario.tsx` checks Home, the widget
and the reminders on one day. All run in CI (`PROPERTY_SCALE=10` searches ten times longer).

## The kinds of user

Each dimension below varies independently. The property test draws one value from each.

| Dimension | Values |
| --- | --- |
| Account age | brand new (signed up, onboarding not done), onboarding just done, a week in, months of history (400+ days), back after weeks away, back after a reset (RESET-1) |
| Memorized | none · 1 page · part of a page (ayahs only, MEM-4) · one juz · scattered pages · most · all 604 |
| Plan | pages a day (1–40) · juz a day (1–3) · reverse · custom with rest days (empty days) · custom all rest days · custom started in the past, today, or later · a saved plan loaded · edited today (CARRY-5) · new today · schedule anchored after today (repaired at launch) |
| Carry | none · leftovers offered (left, missed, several days) · added with Keep daily amount (shift) · added with Add · from Insights ("Revise these first tomorrow") · leftovers as many as the day or more |
| Today | rest day · not started · part done · done · done ahead from an earlier day · done and revising ahead · done ahead with nothing of its own (carried pages only) · revised by hand in Activity (ACT-15) · Recite finished pages (RECITE-9) |
| Before today | every day done · yesterday missed (grace, SESS-6) · two or more missed · a week+ missed · only hand-logged days |
| The clock | any zone from UTC−12 to UTC+14 (half-hour and 45-minute ones) · the Fajr boundary on or off · between midnight and Fajr · DST days · travel (zone changed, place kept) · the year's end |
| Settings | Smart Tracking on or off · reminders on or off (phone allows or not) · Friday Al-Kahf card on or off · prayer times on or off · Home background |
| App | store app or Revisely Dev · tester or not (previewTester) · English or Arabic (RTL, Dev only) · Ramadan theme (Dev) · offline with changes in the outbox · two phones · a cold start before Auth answers (HOME-8) |

## The screens that describe them

- **Home**: the Today post (title, detail, button, "Change"), the catch-up line, the revise-ahead line, the memorized
  line and juz dots, the streak (and its grace ring), Al-Kahf, the next prayer line.
- **Session**: its pages, the end card, Keep going.
- **Activity**: the day card and day view, Overview, the week strip, Insights (Coverage, Gaps, Last revised).
- **Edit schedule**: the header ("N pages a day", "every N days"), Daily amount, Saved plans.
- **Reminders**: what each says and when (REMIND-1, -2).
- **Widgets**: Today (small, medium, Lock Screen), on iOS and Android (`lib/widgets/snapshot.ts` writes what they read).
- **What's new**: the tour.
- **Revo**: what it is told (`lib/revo/context.ts`) and its greeting.

## What tests each

S = a scenario (real app, emulators), P = a property test, U = a unit test, — = nothing yet (a gap). Ids are
`BEHAVIOUR.md`'s. **UM** is the user-matrix property test (`properties/userMatrix.property.ts`): every row it generates
is checked on Home, the widget, the reminders and Revo at once (USER-1, USER-2), in English and Home's lines in Arabic.
**UT** is `scenarios/userTypes.scenario.tsx` (the real Home for one account of the type), **SA**
`scenarios/screensAgree.scenario.tsx` (Home, the widget and the reminders on one day).

| User | Home | Session / ahead | Activity | Reminders | Widget | Revo |
| --- | --- | --- | --- | --- | --- | --- |
| New account, nothing memorized | S ONBOARD-3, UT, UM | n/a | S | S REMIND-4, UM | UM (noPlan) | UM |
| 1 page memorized | UM | — | — | UM | UM | UM |
| Part of a page (ayahs only) | S MEM-4, UT, UM | S MEM-4 | S MEM-1, UT (Revised elsewhere) | UM | P MEM-4, UM | P MEM-1, UM |
| One juz / scattered / a run / most | S many, UM | S many | S many | S REMIND-1, UM | U, UM | P REVO, UM |
| All 604, or all but a few ayahs | S, UT, UM | S AHEAD-3 | — | UM | UM | UM |
| Pages plan, forward / reverse | S SCHED-1, -4; P; UM | S, P | S | S, UM | U, UM | P, UM |
| Juz plan | S SCHED-2, SESS-5; P; UT; UM | S | S | U, UM | U, UM | UM |
| Custom with rest days | S HOME-9, UM | — | — | UM | UM (wording needs native) | UM |
| Custom, every day a rest day | UM | — | — | UM | UM | UM |
| Plan starting later (travel west) | U, UT, UM | — | — | UM | UM | UM |
| Saved plan loaded | S SCHED-7 | — | — | — | — | — |
| Edited or new today | S CARRY-5, P | S | — | — | — | — |
| Leftovers offered / added (shift, add) | S CARRY-1..5, P, UM | S SESS-7 | S ACT-24 | UM | UM | S REVO-40, UM |
| From Insights (a rest day given pages too) | S ACT-24, UM | S | S | UM | UM | UM |
| Today done | S SESS-2, -4, UM | S AHEAD-1 | S | S REMIND-1, UM | U, UM | S REVO, UM |
| Done ahead the day before | S AHEAD-2, SA, UM | S | S DAY-9 | SA, UM | SA, UM | UM |
| Revised by hand in Activity | S ACT-15, SA, UM | — | S ACT-15 | SA, UM | SA, UM | UM |
| Yesterday missed (grace) | S SESS-6, P, UM | S | S | UM | U, UM | S REVO, UM |
| Back after weeks away | S SCHED-5, UT, UM | — | — | S REMIND-2, UM | UM | UM |
| Fajr boundary, before Fajr | S DAY-2, P, UM | S DAY-4 | S DAY-9 | U, UM | U, UM | U, UM |
| DST days, every zone | P DAY-6, -8, UM | P | — | U, UM | U, UM | UM |
| Smart Tracking on | S, UM | — | S | — | — | P, UM |
| Offline, outbox | S SYNC-1..5 | S | S ACT-13 | — | — | — |
| Two phones | S SYNC-3, -5 | — | — | — | — | — |
| Cold start before Auth | S HOME-8 | — | S ACT-36 | — | — | — |
| Store app vs Revisely Dev | S (each where it differs) | — | S ACT-35 | S REMIND-2, -5 | — | S REVO |
| Arabic (RTL) | U, P LANG-1, -2, UM (Home's lines) | — | — | — | — | — |
| Ramadan theme | S THEME-1..7 | — | S THEME-5, -6 | — | — | S THEME-8 |

## What the sweep found (Nov 27 2026)

All six were cases where one screen disagreed with Home or with the account. Each is a rule now, and its fix landed
with a scenario that fails without it.

| Rule | What happened | Fix |
| --- | --- | --- |
| USER-1 | With only a few ayahs memorized (a seventh of a page is 0.02%), Home's memorized line read "0% of the Quran memorized". The same rounding would show 100% with a few ayahs still to go. | `formatPercent` (`src/lib/homeToday.ts`) never rounds something to 0% or short of all to 100%. |
| USER-2 | A day revised ahead the evening before read "Done" on Home, while the reminders still planned "Good morning, today is …" for it: they counted only pages its own sessions revised. | The reminders read `dayProgress` (`src/lib/todaySnapshot.ts`), as Home does. |
| USER-2 | Pages logged by hand in Activity (ACT-15) finished the day on Home, but not on the widget, and the reminders kept asking. | The widget and the reminders read `dayProgress`. |
| USER-2 | A rest day given pages from Insights was never done on the widget: it counted only the day's own pages, and there were none. | `dayProgress` counts all of such a day's pages, as Home does. |
| USER-2 | A rest day showed an empty title on the widget. | It writes "Rest day" and where the next revision day starts, Home's words (`restDayWords`, `src/lib/widgets/snapshot.ts`). |
| USER-2 | With ayahs of a page memorized (MEM-4), Activity's Revised elsewhere worked the day out from whole pages only, so it offered other pages than Home's today (2–6 where Home had 1–5). | The sheets and the day view read `revisablePages`, as Home does. |

Home itself held up: over thousands of generated accounts per run, HOME-9 doesn't come back (and with its fix undone,
the property finds it at once, through a plan that starts tomorrow as well as a rest day).

## The gaps, worst first

1. **Nothing checked Home's words against the account.** Every Home test set up one account and read one line. None
   asked, over many accounts, "can Home show the new account's state while pages are memorized?" That is how HOME-9
   slipped through. **Now:** UM checks Home's lines for every generated account (`lib/homeToday` is what Home draws).
2. **The screens weren't checked against each other.** Home and Revo shared `todaySnapshot`; the reminders and the
   widget each counted a day their own way. **Now:** all four read `dayProgress`, and UM checks they agree.
3. **A day with no pages** (rest days, every day resting, a plan not started) was tested on Home alone, for one day.
   **Now:** UM generates them, and the widget names a rest day as Home does ("Rest day", then where the next day
   starts). Its status line still reads "0 pages left": that line is the widgets' native code (Swift and Kotlin), and its
   fix waits for the next native release.
4. **Extremes of memorized:** 1 page, ayahs only, all 604 had little. **Now:** UM and UT.
5. **Back after weeks away** was tested for the schedule (SCHED-5) but not for what Home says. **Now:** UT.
6. **Arabic** was tested by strings and layout, never by what Home says for an account. **Now:** UM renders Home's lines
   in Arabic too.

Still unchecked (for later): the widgets' native drawing (Swift, Kotlin), and their rest-day status line; the What's new
tour per user type; Activity's day card for a rest day in every plan; two phones on a rest day; travel across the date
line on a custom plan; the session screen and the end card for each user type (only Home's lines are generated).

## The rules every screen keeps (checked by the property test)

- With any page memorized, no screen offers the new account's state ("Nothing to revise yet", "Mark memorized pages"),
  and with none memorized, Home offers nothing else (HOME-9).
- No screen shows `NaN`, `undefined`, `null`, `Infinity`, `[object`, an unfilled `{{value}}`, or an empty line.
- A count is never negative, and "done" is never more than the total.
- Home's button does what it says: Start or Continue opens a day with pages, Revise ahead opens a day with pages,
  Review session opens a day that is done, Mark memorized pages only for an account with nothing memorized. A rest day
  with no next day has no button.
- Home, Revo, the widget and the reminders agree on today: how many pages, how many done, and whether it is done.
- With pages memorized, the memorized line never says 0%; short of the whole Qur'an, never 100%.
- A day done on Home is done on the widget, and no reminder asks for it; tomorrow, done ahead already, gets none either.
