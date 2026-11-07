# Testing checklist: test scenarios and Phase 2

Settings → Testing → **Load test scenario** (accounts with `previewTester` only) replaces your data
with a ready-made situation. Each scenario below says what it sets up, what to open, and what you
should see. `D` is today's revision day; "pages" are mushaf pages (Madani, 604).

## How to load one

1. Settings → Testing → Load test scenario.
2. Pick a scenario, type `RESET`, tap **Load …**.
3. Wait for the sheet to close. Home then shows the new account; there's no need to relaunch.

Good to know:

- **Like Reset my data, it replaces everything:** progress, plan, sessions, daily log, timed readings
  and recordings, here and in your backup. A copy is kept first that only the developer can read
  (`backups/tester-resets/…` in Storage).
- **This phone's local recordings are deleted too.**
- **Limits:** one load every 2 minutes, 30 a day (UTC). Reset my data has its own limits.
- **Your day:** the scenario is built around this phone's time zone, clock and, for Fajr edge, its
  Fajr times. Load it on the phone you test on.
- **Not loaded?** The sheet shows why (for example, the clock more than 15 minutes off, or the limit).
  Nothing on the phone is cleared when it fails.

## Phase 2: where things are

Phase 2 (the Activity redesign, the streak and the coach) shows on `previewTester` accounts.

- **Activity → +** opens **Add**:
  - **From your session** (only when today's session skipped memorized pages);
  - **Revised:** From and To, minutes, and an optional **How did it go?** (Weak, Moderate, Strong rate
    the pages 2, 3 or 4);
  - **Memorized:** From and To, or a surah; **From your reading** offers pages read today that aren't
    memorized;
  - **Read:** the Read tab's timer;
  - **Note:** text, and an optional **Show under** (the day's Revised, Memorized or Read item).
- **Overview | Insights** under Activity's header.
  - **Overview** has **Week | Month**. The choice is kept on this phone; swipe or ‹ › steps.
  - A day cell has a ring (the share of the day's assigned pages revised) and dots for memorized,
    read and a note.
  - Week has one line a day ("Revised x of y · …").
  - The picked day (today until you tap one) previews its blocks under the grid.
- **A day** (tap it) has blocks:
  - **Revised:**
    - a ring;
    - a page strip (revised filled, skipped hollow, not reached dimmed, a red dot on weak pages);
    - weak / moderate / strong counts;
    - **"Ahead for <date>: …"** for pages credited to another day;
    - **"Done ahead, from <date>: …"** for this day's pages revised on another day;
    - its revision note and recordings.
  - **Memorized** and **Read**.
  - **Notes:** untagged notes, and tagged ones whose item is gone. A tagged note sits under its item
    (ACT-11).
  - **Footer:** "<Weekday> runs Fajr to Fajr, <time> to <time>", or "… runs midnight to midnight".
- **Hold a block header** (Revised, Memorized, Read): the iOS-style menu, with the item previewed
  over a dimmed screen.
  - Each item has a **Delete**, asked first, that names what goes; a timed read also has **Edit**.
  - Touching outside the menu runs nothing.
  - The rows under a block have no hold and no swipe: notes are edited in the daily log.
  - VoiceOver offers the same actions on the header.
- **Daily log:** swipe a note away, with **Undo** for 5 seconds; hold a note for **Edit** and **Copy**.
- **Insights** cards:
  - Coverage (7 and 30 days);
  - Consistency (30 days);
  - Weak spots (pages rated 1–2), with **Revise these first tomorrow** and **Plan it**;
  - Memorized per month;
  - Pace (from 10 timed readings);
  - Juz untouched longest (red past 30 days, or never);
  - **Ask the coach**.
- **Memorized pages** (Settings, or Home's Memorized line): saving new marks asks **"When did you
  memorize these?"**
  - **Today** logs them in today's Memorized item. **Before (don't log)** logs nothing.
  - Before comes first when it's more than five pages.
  - Unmarking a page removes it from the Memorized items.
- **The streak:**
  - A day counts when all its scheduled pages are credited to it.
  - It counts back from today if today is done, else from yesterday.
  - **Grace:** when yesterday was missed but the run before it is intact, Home (once today has a
    session) and the widget show the streak dimmed, with a ring. Revising yesterday's missed pages
    restores it at once; today's own pages don't (SESS-6). A day restored that way keeps counting:
    the streak is still there the next morning.
  - Two missed days in a row break it.
- **Catch-up credit:** a page carried in from a missed or unfinished day is credited to that day, never
  to today. Today is Done only when today's own pages are revised (SESS-7). With *Keep daily amount*,
  when the carried pages fill today (as many as the day holds, or more), today is those pages alone and
  is Done once they're revised; today's own pages are tomorrow's, offered by "Tomorrow starts at" and
  Keep going (CARRY-2).
- **Ask the coach** (Insights):
  - The first time, the sheet says what is sent and asks you to turn it on.
  - Then pick one insight and Ask: the answer, and "N questions left today" (5 a day).
  - The same insight again on the same day gives the same answer and costs nothing.

| Phase 2 | Test it with |
| --- | --- |
| Day blocks, page strip, strength counts, recordings in blocks | 3, 4, 9 |
| Block-header menus, the daily log's menu and Undo | 9 (and 1) |
| Overview Week \| Month, picked-day preview | 3, 9 |
| Insights cards | 3, 9 |
| Weak-spot actions | 3 (juz plan), 8 (custom plan) |
| Add sheets (Revised, Memorized, Note, From your session) | 1, 4, 9 |
| Memorization Today / Before | 1 |
| Missed-day catch-up credit | 2, 4, 5 |
| Streak grace (kept, restored, broken) | 4, 5 |
| Ask the coach | 1 (consent), 3, 9 |
| Revise ahead | 6 |
| Fajr edge cases | 7 |
| Offline | 10 |

**Rough edges to look at:**
- The "Ahead for" and "Done ahead" lines write the date as 2026-11-07, not a weekday.
- Catch-up pages, which are for an earlier day, are still labelled "Ahead for" and "Done ahead".
- Memorized items have no minutes.
- Revised and Memorized items can be deleted but not edited.
- The streak reads the last 400 days.

---

## 1. New account

**Sets up:** onboarding done, Juz 30 memorized (pp. 582–604), pages plan 5 a day starting today,
nothing revised.

- **Home:** today's post shows 5 pages, **pp. 582–586** (An-Naba). Not done; no "Missed" or
  "Left yesterday" line.
- **Session:** opens on p. 582. Swipe through all five: the end card, then Home says Done.
- **Activity:** today shows only "Memorized 23 pages", nothing on earlier days.
- **Insights:** if you turn Smart Tracking on, the strength counts are all at their default.

**Phase 2:**

- **Activity, today:** the Memorized block. The footer reads "<today> runs midnight to midnight" (Fajr to
  Fajr if your Fajr boundary is on).
- **+ → Revised:** From 582 To 583, 10 minutes, **Weak**, Add.
  - Today's Revised block gains the two pages.
  - Insights → Weak spots lists 582–583.
  - The same with no strength rates nothing.
- **+ → Memorized:** From 580 To 581, Add.
  - The pages are memorized, today's Memorized block lists them, and Overview shows today's
    memorized dot.
  - Then hold the Memorized header → **Delete**: asked first, and the two pages go back to not
    memorized (ACT-7).
- **+ → Note:** some text, **Show under → Memorized**, Add. The note shows under the Memorized block,
  not in Notes. An empty note can't be added.
- **Memorized pages:** mark 562–563 and save: "When did you memorize these?" with **Today** first.
  - Today puts them in today's Memorized block.
  - Mark six or more: **Before (don't log)** comes first, and it adds nothing to Activity.
  - Unmark a page logged today: it leaves the Memorized block.
- **Ask the coach:** Activity → Insights → Ask the coach shows the consent first. Nothing is sent until
  you turn it on.

## 2. Beginner

**Sets up:** Juz 30, pages plan 2 a day from D−7. Sessions on D−7, D−6, D−4 and D−1 (all done) and on
D−3 (1 of 2). D−5 and D−2 are missed. Two daily-log notes, on D−6 and D−1.

- **Home:** a catch-up line ("Missed …" / "Left …") offering D−3's unrevised page and D−2's two pages,
  with **Add to today**. Pages revised in the last three days are never offered.
- **Add to today** with *Keep daily amount*: the three leftovers fill today (a 2-page day), so today
  is those three alone (591–593); today's own two pages move to tomorrow.
- **Activity calendar:** D−7, D−6, D−4 and D−1 full; D−3 partly; D−5 and D−2 empty.
- **Daily log:** the D−6 note ("Juz 30 is going well…") and the D−1 revision note (6 min).

**Phase 2:**

- **Catch-up credit:** Add to today, then revise D−2's two pages.
  - They're credited to D−2: its ring fills in Overview, and D−2's day shows "Done ahead, from <today>: …".
  - Today's Revised block lists them as "Ahead for <D−2>: …".
  - Revising the three makes today Done (Home: Done · 3 pages). Home then offers "Tomorrow starts
    at" today's own two pages; revising them, there or with Keep going on the end card, counts for
    tomorrow.
- **Streak:** D−1 was done, so there's no grace. D−2 done today counts for D−2, but two days late
  (after its grace window) it doesn't join the run before it (SESS-6). Today counts once the three
  are revised: 2 days.
- **Day view:**
  - D−1: the revision note sits under the Revised block (ACT-2).
  - D−6: the note is in the Notes block.
  - D−3: the strip has one page revised and one not.
- **+ menu:** "From your session" appears only once today's session has skipped a memorized page.

## 3. Hafiz

**Sets up:** all 604 pages memorized, juz plan 1 a day from D−60. Sessions every day for 60 days
except D−55, D−41, D−33, D−20 and D−9. D−12 half done. Two ratings a day. Recordings on D−3, D−2
and D−1. Smart Tracking on.

- **Home:** today is **Juz 1 (pp. 1–21)** (day 60 of a 30-day cycle). Recent sessions read
  **"Juz N"**, not surah names (SESS-5); D−12's half session keeps its surahs.
- **Activity calendar:** two months of full days with five gaps. D−12 shows a partial ring.
- **Insights:** strength counts and weak spots from the ratings. The juz outline and coverage over
  7 and 30 days.
- **Recordings:** Activity → D−1, D−2, D−3: a revision recording each (one second of silence; it
  downloads and plays). Listen back shows its two pages.

**Phase 2:**

- **Day view (D−1 to D−3):** the Revised block's ring, its strip with red dots on weak pages, the
  weak / moderate / strong counts, and the recording inside the block. D−12: a partial ring and
  strip.
- **Overview:**
  - Month: two months of rings with five empty days.
  - Week: seven cells with a line each.
  - Switch, leave Activity and come back: the choice is kept. Swipe steps a week or a month.
- **Insights:**
  - Coverage over 30 days is never below 7 days.
  - The consistency squares.
  - Weak spots from the ratings.
  - Juz untouched longest.
  - Pace needs ten timed readings; this account has none.
- **Weak spots → Revise these first tomorrow:** tomorrow's session starts with the weak pages, under
  "From Insights: the weak pages first" (check tomorrow). On this juz plan, **Plan it** does the same
  (pages and juz plans have no day editor).
- **Ask the coach:** turn it on and ask about Weak spots: an answer, and "4 questions left today".
  Ask Weak spots again: the same answer, and the count doesn't move.
- **Streak:** D−9 was missed, so the streak counts from D−1 back to D−8: 8 days, 9 once today is
  done.

## 4. Partly done today

**Sets up:** Juz 29–30 (pp. 562–604), pages plan 5 a day from D−5. D−5 to D−2 done. D−1 left with
3 of 5. Today's session open with 2 of 5 revised.

- **Home:** "Left yesterday · Revise p. …" offering D−1's 2 pages, with Add to today. Today not done;
  the button continues the session.
- **Session:** opens on today's third page (the first not done). Its first two pages are checked.
- **Add to today:** the 2 leftovers come first (Keep daily amount) or on top (Add).
- **Activity:** today shows the partial session; D−1 shows 3 pages.

**Phase 2:**

- **Streak grace:** D−1 was left at 3 of 5 and D−5 to D−2 are done, so yesterday is a missed day.
  - Home (today has a session) and the widget show the streak dimmed, with a ring for D−1's two pages.
  - Revise those two (Add to today, then the session): the streak comes back at once.
  - Today's own pages alone don't bring it back.
  - With today done too it reads 6, and it stays: the next morning, before anything is revised,
    still 6. D−1, restored in its grace window, counts as on time from then on (SESS-6).
- **Catch-up credit:**
  - The two pages count for D−1: its ring fills, and D−1's day shows "Done ahead, from <today>: …".
  - Today's Revised block lists them as "Ahead for <D−1>: …".
  - Today stays not Done until its own pages are revised: with Keep daily amount, the three left
    after the two leftovers (its last two move to tomorrow).
- **Day view, today:** the strip shows 2 revised and 3 not reached.
- **+ → Revised, From your session** (after the session skips a memorized page): From and To are
  filled with the skipped pages; Undo clears them.

## 5. Missed days

**Sets up:** Juz 30, pages plan 3 a day from D−10. Sessions D−10 to D−3, none since.

- **Home:** the missed-day line: **"Missed 2 days · Revise pp. …"** (D−2 and D−1's pages), with Add
  to today. Today shows its own pages; the schedule hasn't moved (SCHED-5).
- **Add to today:** the missed pages become today's: with Keep daily amount, the six alone (today's own
  three move to tomorrow). If they're still not revised tomorrow, they're offered again (CARRY-4).
- **Activity calendar:** the last two days are empty.

**Phase 2:**

- **Streak:** two missed days in a row break it. There's no dimmed grace ring, and revising those
  pages doesn't bring the old streak back (SESS-6). Revising them today makes today count: 2 days
  (yesterday, caught up in its grace window, and today).
- **Catch-up credit:** after Add to today, the missed pages count for D−2 and D−1, whose rings fill
  in Overview. With Keep daily amount, today is Done once the six are revised (Home: Done · 6 pages);
  today's usual 3 are tomorrow's, offered by "Tomorrow starts at".
- **Overview, Week:** D−2 and D−1 read "Revised 0 of 3" before, and are full after.

## 6. Revised ahead

**Sets up:** Juz 30, pages plan 3 a day from D−3. D−3 to D−1 done. Today done, plus tomorrow's first
2 pages revised ahead.

- **Home:** **Done · 5 pages** (today's 3 and the 2 ahead). "Tomorrow starts at …" points at
  tomorrow's **third** page, the first not done.
- **Tomorrow starts at:** opens only tomorrow's remaining page, with nothing to swipe back to (AHEAD-1).
- **Review session:** today's 3 pages, then the 2 ahead pages (SESS-4).
- **Activity:** both on today. The session row says "… · 2 ahead for <tomorrow>"; nothing on
  tomorrow (DAY-9).

**Phase 2:**

- **Day view, today:** the Revised block, and "Ahead for <tomorrow>: …" for the two pages.
- **Tomorrow's day:** only "Done ahead, from <today>: …". The session itself stays on today (DAY-9).
- **Keep going:** tap "Tomorrow starts at" (the Review session has no end card). It opens
  tomorrow's one page left, held alone. Swipe onto the end card: tomorrow is now done ahead, and
  **Keep going** opens the day after's pages, held alone too (AHEAD-3). Back on Home, the line has
  moved to the day after: "<weekday> starts at …" (AHEAD-4).
- **Overview:** today's ring is full.

## 7. Fajr edge

**Sets up:** Fajr boundary on, at your saved location (or one in this phone's time zone). Juz 30,
pages plan 3 a day from D−4.
- A session on D−4 at 20:00.
- A session on D−3 at 21:00.
- A session opened at **00:30** on the calendar day after D−2, which is still **D−2**.
- A session opened **10 minutes before Fajr** on today's calendar date, which is still **D−1**.
- A note at 00:40, also on D−2.
- A 15-minute reading before Fajr, on D−1.

- **Home:** the revision day is D. Before Fajr it's still the day before, after Fajr it's D (DAY-2).
- **Activity:** the 00:30 session and the 00:40 note are on **D−2**, with no other weekday named. The
  pre-Fajr session and reading are on D−1 (DAY-9, LOG-3).
- **Daily log for D−2:** the note shows "12:40 am" alone.
- **Settings → Fajr:** the boundary is on, with the location and method used.

**Phase 2:**

- **Day footer:** "<Weekday> runs Fajr to Fajr, <time> to <time>", your location's Fajr times.
- **On time:** the 00:30 session counts for D−2 and the pre-Fajr one for D−1, so the streak runs
  through D−1 unbroken: 4 days, 5 once today is done (SESS-2).
- **Overview:** D−2's cell has the 00:30 session's ring and the 00:40 note's dot. D−1's has a ring
  and a read dot. The Week lines say the same.
- **Memorized before Fajr** (only if you test between midnight and Fajr): mark a page with **Today**.
  It's filed under the day before, the revision day it's still in (ACT-1).

## 8. Custom reverse plan

**Sets up:** Juz 30 as a custom **reverse** plan, 4 pages a day, saved on D−2: 604–601, 601–598,
598–595, … down to 583–582. Each day starts on the page the day before ended on. D−2 and D−1 done.

- **Home:** today is **pp. 598, 597, 596, 595** (the plan's third day; SCHED-3/4).
- **Session:** p. 598 shows once, though it's also the last page of the day before (SCHED-6).
- **Plan editor:** shows the reverse days in order from today; saving an edit keeps today (CARRY-5).
- **Tomorrow:** 595–592.

**Phase 2:**

- **Weak spots → Plan it on a custom plan:** first make two weak pages.
  - + → Revised, From 604 To 603, **Weak**, Add.
  - Insights → Weak spots lists 603–604. **Plan it** opens tomorrow's plan day, pre-filled with
    them.
  - **Revise these first tomorrow** instead puts them at the front of tomorrow's session.
- **Day view, today:** the strip has p. 598 once.

## 9. Heavy Activity

**Sets up:**
- **Memorized:** Juz 29–30 four months ago, then Juz 28 two pages at a time, every six days over the
  last three months.
- **Plan:** pages, 5 a day from D−90.
- **Sessions** on most days of the last 90: about 15% missed, about 10% left part done, some rated.
- **Timed readings** every 4 days, and daily-log notes every 3 days (memorization, revision and note,
  all untagged).
- **Smart Tracking:** on.

- **Activity calendar:** three months of rings and dots. Months with memorizing show it.
- **Activity → All:** search and filters across sessions, readings, notes and memorized pages.
- **Insights:** memorized per month (three months with new pages) and coverage over 7 and 30 days.
- **Daily log:** about 30 notes across the months.
- **Note tags:** not seeded. Develop didn't have the note tag (#248) when this was built; the notes
  are untagged.

**Phase 2:**

- **Overview:**
  - Month and Week across three months: rings, and memorized, read and note dots.
  - Swipe and ‹ › step.
  - Tap a day: the preview under the grid (Revised x of y and minutes, Memorized, Read, Notes).
- **Day view:** a part-done day (ring, strip, counts), a day with a reading (the Read block and its
  minutes), and the Notes block with untagged notes.
- **Menus:**
  - Hold the Read header for Edit and Delete.
  - Hold Revised for Delete: asked first, it names what goes and un-marks that session's pages.
  - Hold Memorized for Delete: the pages go back to not memorized.
  - Touching outside does nothing.
  - The rows under a block have no hold or swipe; tapping a note opens the daily log.
- **Daily log:** swipe a note: it goes, with Undo for 5 seconds. Hold one for Edit and Copy.
- **Insights:**
  - Coverage over 7 and 30 days, Consistency, Memorized per month (three months), Juz untouched
    longest.
  - **Pace** is shown (about 22 timed readings).
  - Ask the coach about Pace and Consistency.
- **Tagged note:** + → Note, Show under → Revised (once today has a session), Add. The note shows
  under today's Revised block (ACT-11).

## 10. Offline queue

**Sets up:** Juz 30, pages plan 3 a day from D−2. D−2 and D−1 done on the server. Then the phone
itself queues three changes and **holds** them:
- today's session, all 3 pages;
- a revision note;
- an 8-minute reading.

- **Home:** today shows **Done** (from the held session). The three changes wait on the phone; the
  app shows no count of them.
- **Settings → Testing:** a **Send held changes** row. The server doesn't have today's session yet
  (another phone signed in to the account shows today not done).
- **Send held changes:** the three go, in order (SYNC-1). The row goes away, and another phone
  shows today done, the note and the reading.
- **Relaunching instead:** the hold lives in memory only, so the changes are sent at the next start.
- **To test offline:** turn on Airplane Mode before Send held changes. They stay queued, and go once
  you're back online.

**Phase 2:**

- **After Send held changes:** today's day shows the Revised block (3 of 3), the note under it and a
  Read block of 8 minutes. Today's ring is full in Overview, and the streak counts today.
- **Offline add:** in Airplane Mode, + → Note → Add. The note shows at once, and goes once you're
  back online (LOG-4).

---

## What's checked automatically

Each scenario is loaded in turn in `tests/scenarios/scenarios/testScenarios.scenario.tsx` (RESET-3),
and every BEHAVIOUR.md rule that can be read off an account is checked (`harness/invariants.ts`):
- **DAY:** 1, 2, 4, 9.
- **SCHED:** 1–6.
- **AHEAD-2, SESS-2, CARRY-1.**
- **LOG:** 1, 3.
- **ACT:** 1, 2.
- **Each scenario's own promise above.**

The rules tests write every scenario's documents as the user (`tests/firestore-rules/testScenarios.test.ts`).

Phase 2 has its own scenario tests:
- **The day's blocks and menus:** `dayBlocksMenus`, `contextMenu` (ACT-6).
- **The add sheets:** `addRevised`, `addMemorized`, `addNote` (ACT-5).
- **The memorization items:** ACT-10.
- **The coach:** `askCoach` (COACH-4).
- **Catch-up credit:** `catchUpCredit.property` (SESS-7).
- **The streak and its grace:** `streak.property` (SESS-2, SESS-6), including a grace window that ends
  at Fajr, and days each caught up the next day keeping the run; `checklistCatchUp` › 4 checks the
  restored streak the next morning on Home, in Revo and on the widget.

E2E covers the session, revise ahead, the Fajr boundary, the daily log, offline and recordings on the
built app. Every run keeps screenshots of key screens (artifact `e2e-<platform>-screens-…`).
