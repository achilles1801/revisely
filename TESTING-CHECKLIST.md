# Testing checklist: test scenarios

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

---

## 1. New account

**Sets up:** onboarding done, Juz 30 memorized (pp. 582–604), pages plan 5 a day starting today,
nothing revised.

- **Home:** today's post shows 5 pages, **pp. 582–586** (An-Naba). Not done; no "Missed" or
  "Left yesterday" line.
- **Session:** opens on p. 582. Swipe through all five: the end card, then Home says Done.
- **Activity:** today shows only "Memorized 23 pages", nothing on earlier days.
- **Insights:** if you turn Smart Tracking on, the strength counts are all at their default.

## 2. Beginner

**Sets up:** Juz 30, pages plan 2 a day from D−7. Sessions on D−7, D−6, D−4 and D−1 (all done) and on
D−3 (1 of 2). D−5 and D−2 are missed. Two daily-log notes, on D−6 and D−1.

- **Home:** a catch-up line ("Missed …" / "Left …") offering D−3's unrevised page and D−2's two pages,
  with **Add to today**. Pages revised in the last three days are never offered.
- **Add to today** with *Keep daily amount*: today keeps its size and starts with the leftovers.
- **Activity calendar:** D−7, D−6, D−4 and D−1 full; D−3 partly; D−5 and D−2 empty.
- **Daily log:** the D−6 note ("Juz 30 is going well…") and the D−1 revision note (6 min).

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

## 4. Partly done today

**Sets up:** Juz 29–30 (pp. 562–604), pages plan 5 a day from D−5. D−5 to D−2 done. D−1 left with
3 of 5. Today's session open with 2 of 5 revised.

- **Home:** "Left yesterday · Revise p. …" offering D−1's 2 pages, with Add to today. Today not done;
  the button continues the session.
- **Session:** opens on today's third page (the first not done). Its first two pages are checked.
- **Add to today:** the 2 leftovers come first (Keep daily amount) or on top (Add).
- **Activity:** today shows the partial session; D−1 shows 3 pages.

## 5. Missed days

**Sets up:** Juz 30, pages plan 3 a day from D−10. Sessions D−10 to D−3, none since.

- **Home:** the missed-day line: **"Missed 2 days · Revise pp. …"** (D−2 and D−1's pages), with Add
  to today. Today shows its own pages; the schedule hasn't moved (SCHED-5).
- **Add to today:** the missed pages become today's. If they're still not revised tomorrow, they're
  offered again (CARRY-4).
- **Activity calendar:** the last two days are empty.

## 6. Revised ahead

**Sets up:** Juz 30, pages plan 3 a day from D−3. D−3 to D−1 done. Today done, plus tomorrow's first
2 pages revised ahead.

- **Home:** **Done · 5 pages** (today's 3 and the 2 ahead). "Tomorrow starts at …" points at
  tomorrow's **third** page, the first not done.
- **Tomorrow starts at:** opens only tomorrow's remaining page, with nothing to swipe back to (AHEAD-1).
- **Review session:** today's 3 pages, then the 2 ahead pages (SESS-4).
- **Activity:** both on today. The session row says "… · 2 ahead for <tomorrow>"; nothing on
  tomorrow (DAY-9).

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

## 8. Custom reverse plan

**Sets up:** Juz 30 as a custom **reverse** plan, 4 pages a day, saved on D−2: 604–601, 601–598,
598–595, … down to 583–582. Each day starts on the page the day before ended on. D−2 and D−1 done.

- **Home:** today is **pp. 598, 597, 596, 595** (the plan's third day; SCHED-3/4).
- **Session:** p. 598 shows once, though it's also the last page of the day before (SCHED-6).
- **Plan editor:** shows the reverse days in order from today; saving an edit keeps today (CARRY-5).
- **Tomorrow:** 595–592.

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

## 10. Offline queue

**Sets up:** Juz 30, pages plan 3 a day from D−2. D−2 and D−1 done on the server. Then the phone
itself queues three changes and **holds** them:
- today's session, all 3 pages;
- a revision note;
- an 8-minute reading.

- **Home:** today shows **Done** (from the held session). Changes waiting: 3.
- **Settings → Testing:** a **Send held changes** row. The server doesn't have today's session yet
  (another phone signed in to the account shows today not done).
- **Send held changes:** the three go, in order (SYNC-1). The waiting count goes to 0, and another
  phone shows today done, the note and the reading.
- **Relaunching instead:** the hold lives in memory only, so the changes are sent at the next start.
- **To test offline:** turn on Airplane Mode before Send held changes. They stay queued, and go once
  you're back online.

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
