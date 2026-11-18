# Testing checklist: test scenarios and Phase 2

Settings → Testing → **Load test scenario** (accounts with `previewTester` only) replaces your data
with a ready-made situation: **Heavy user**, **Missed yesterday** or **Getting started**. Each scenario below
says what it sets up, what to open, and what you should see. `D` is today's revision day; "pages" are mushaf
pages (Madani, 604).

## How to load one

1. Settings → Testing → Load test scenario.
2. Pick a scenario, type `RESET`, tap **Load …**.
3. Wait for the sheet to close. Home then shows the new account; there's no need to relaunch.

Good to know:

- **Like Reset my data, it replaces everything:** progress, plan, sessions, daily log, timed readings,
  recordings, Recite's takes and Revo's conversations and memory, here and in your backup. A copy is kept first that only the developer can read
  (`backups/tester-resets/…` in Storage).
- **This phone's local recordings are deleted too.**
- **Limits:** one load every 2 minutes, 30 a day (UTC). Reset my data has its own limits.
- **Your day:** the scenario is built around this phone's time zone and clock. Load it on the phone you
  test on.
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
| Day blocks, page strip, strength counts, recordings in blocks | Heavy user |
| Block-header menus, the daily log's menu and Undo | Heavy user |
| Overview Week \| Month, picked-day preview | Heavy user |
| Insights cards, Gaps, Last revised, Recitation | Heavy user (Smart Tracking on), Missed yesterday (off) |
| Weak-spot actions | Heavy user (juz plan) |
| Add sheets (Revised, Memorized, Note, From your session) | Getting started |
| Memorization Today / Before, ayah by ayah | Getting started |
| Missed-day catch-up credit | Missed yesterday |
| Streak grace (kept, restored, broken) | Missed yesterday |
| Recite's memory: marked words, Your progress, Recited | Heavy user, Getting started (the first takes) |
| Revo's History and Memory | Heavy user |
| Revise ahead, Fajr edge, custom plans, offline | automated (below) |

**Rough edges to look at:**
- The "Ahead for" and "Done ahead" lines write the date as 2026-11-07, not a weekday.
- Catch-up pages, which are for an earlier day, are still labelled "Ahead for" and "Done ahead".
- Revised and Memorized items can be deleted but not edited.
- The streak reads the last 400 days.

---

The three scenarios are built for the day you load them: `D` is today, `D−3` three days ago. The numbers below
that say "about" change a little from one day to the next (the same scenario loaded twice on one day is the same).

## 1. Heavy user

Majd, Nov 17 2026: "the most important being a super heavy user with a lot of activity and months of data".

**Sets up:**
- **Memorized:** Juz 1, Juz 11–14 and Juz 16–30 long ago, and Al-Kahf's last pages (with Juz 16). These months:
  - Al-Baqarah from page 22, a page about every six days, finished at D−38;
  - Al-Kahf's first pages (293–300), one every ten days from D−92;
  - **in part:** Al-Kahf p. 301 (its first three ayahs, D−6) and Al-Imran's first five ayahs (p. 50, D−3).
  - That is 21 whole juz and more in part, about 75% of the Qur'an.
- **Plan:** a juz a day from D−210, **Smart Tracking on**.
- **Seven months of sessions** (about 180 days):
  - a missed day now and then before D−25, and D−25 missed;
  - a **sixteen-day gap** from D−118 to D−103, with the note "Travelling for two weeks";
  - about one day in twelve left part done;
  - Juz 17 (Al-Anbiya, Al-Hajj) rated weak again and again; the new Al-Baqarah pages rated 2–4;
  - at D−2, three of D−1's pages revised ahead;
  - **today's juz begun:** 8 pages revised.
- **Sittings:** Al-Kahf every Friday (pp. 293–304), one before each page memorized, and now and then a short reading
  (about 80 in all).
- **The daily log** on about a third of the days: revision notes, memorization notes, day notes (about 80).
- **Recordings:** about a third of the sessions in the last three months, and Friday's Al-Kahf sittings in the last
  two months (about 30, each a second of silence that plays).
- **Recite** (Revisely Dev): about 120 takes with Mark mistakes since D−63.
  - One to four a day; about one in five at Strict, three in ten with the page hidden.
  - Marks of every kind: wrong words, skipped words, harakat and letter slips, Not clear, tajweed notes.
  - The slips into similar ayat:
    - Al-Baqarah 58, going on as Al-A'raf 161: still slipping;
    - Al-Baqarah 35 as Al-A'raf 19: fixed a month ago;
    - Abasa 3 (يُدْرِيكَ) as Al-Infitar 17: right once since a week ago, one more right take to clear;
    - Al-Kahf 75, skipping لَّكَ into ayah 72: still slipping.
  - A few words keep slipping in Ya-Sin, Ar-Rahman, Al-Mulk, An-Naba and Al-Kahf, and one word was cleared by hand.
- **Revo:** two conversations ("Your weakest juz", "Recitation this week"), yesterday's Day in review, and four things
  it remembers. The scenario leaves your Revo switch as it was: turn Revo on to see them.

**Check:**
- **Home:**
  - "Continue at …" with a bar at 8 of today's juz;
  - **Continue revision**;
  - the streak: **24 days**;
  - about 75% memorized, and the juz dots full but for Juz 3–10 and Juz 15.
- **Activity → Overview:**
  - Month steps back seven months: rings on most days, the sixteen empty days, part-done rings.
  - Week reads one line a day.
- **A day** (any with a session in the last three months):
  - the Revised block's ring, its strip with red dots on weak pages, and its recording;
  - Read (a Friday's Al-Kahf), Memorized (a day a page was memorized), Notes;
  - **Recited** ("N takes ›") opens the takes sheet: ▶ is missing (a take's audio stays on the phone that recited
    it), a tap shows the take on the page, and a hold gives Show on the page, Ask Revo and Delete.
- **Insights:**
  - Coverage, Consistency;
  - Weak spots: Juz 17, with **Revise these first tomorrow** and **Plan it**;
  - Memorized per month: seven months with new pages;
  - Pace, from the sittings;
  - Juz untouched longest;
  - **Gaps:** the sixteen-day gap in the strip and as Longest gap;
  - **Last revised**;
  - **Recitation:** the score's weeks, Keeps slipping (Al-Baqarah 58, Al-Kahf 75), Similar ayahs.
- **The reader:**
  - Al-Baqarah p. 9 and Al-Kahf p. 302 show the words still marked;
  - the mic's menu offers "Recite your N mistakes here";
  - Your progress shows each passage's takes.
- **Revo** (once on): History lists the three; Memory the four.
- **Relaunch:** strengths, counts and last revised days stay as they were. Before Nov 17 2026 an account with more
  than 100 days of sessions lost them at every launch (SYNC-6, #737).
- **Speed:** the load, Home, Activity, Insights, Last revised and the reader should all feel immediate. Note anything
  that doesn't.

## 2. Missed yesterday

**Sets up:**
- **Memorized:** Juz 26–30 (pp. 502–604), and the end of Al-Jathiyah (p. 501, its last four ayahs) in part.
- **Plan:** ten pages a day from D−42, **Smart Tracking off**.
- **Sessions:**
  - D−31 and D−30 missed (two in a row), D−22 and D−14 missed;
  - D−25 left at 6 of 10;
  - D−13 to D−2 done: a twelve-day run;
  - **D−1 missed**, nothing yet today.
- Sittings three days a week, a few notes, recordings on D−9, D−5 and D−2, and about ten Recite takes at Words &
  harakat over the last two weeks.

**Check:**
- **Home:**
  - the streak dimmed, with a ring for yesterday's ten pages (**12 days**, grace: SESS-6);
  - "Missed yesterday · Revise …" with **Add to today**.
- **Revise yesterday's pages** (Add to today, then the session):
  - the streak comes back at once;
  - today's own pages alone don't bring it back;
  - 13 once today is done too, and still 13 the next morning.
- **Catch-up credit:** the ten pages count for D−1, whose ring fills. Today stays not Done until its own pages are
  revised (SESS-7). With **Keep daily amount**, today is the ten carried pages alone, and its own ten are tomorrow's.
- **Insights without Smart Tracking:** recency everywhere, no strength: Coverage, Gaps (the two-day and single gaps),
  Last revised.
- **Memorized pages:** p. 501 shows its four ayahs.

## 3. Getting started

**Sets up:**
- **Memorized:** Juz 30, marked at sign-up 16 days ago.
- **Al-Mulk, ayah by ayah:**
  - its first five ayahs at D−12;
  - its first page whole at D−9;
  - four ayahs of p. 563 at D−2, so p. 563 is in part.
- **Plan:** four pages a day from D−14.
- **Sessions:** D−5 missed, D−8 left at 2 of 4, the last four days done, nothing today.
- Memorization notes, two recordings (D−6, D−1) and four sittings.
- **The first four Recite takes:**
  - D−3, An-Naba's first page: three mistakes;
  - D−2, the same page again: one of them still wrong;
  - D−1, Al-Mulk's first page with the page hidden: clean;
  - D−1, An-Naba's second page: one Not clear.

**Check:**
- **Home:** four pages, "Starts at …", the streak **4 days**, **Start revision**.
- **Memorized pages:** Al-Mulk's first page whole and p. 563 in part (its four ayahs). The Memorized items count
  them by the ayah.
- **The session:** p. 563 is named by its memorized ayahs (MEM-4).
- **The reader at An-Naba:** the word missed twice is still marked; Your progress shows the takes.
- **+ → Memorized, + → Revised, + → Note:** the add sheets on a small account.
- **Revo:** nothing yet: its opt-in and greeting as a newer user sees them.

---

## Older cases: now automated

Settings showed ten scenarios until Nov 17 2026. These seven are no longer offered: the three above take in what they
were for, or a test checks them on every push. Each stays loadable on the server for the tests (`CHECK_SCENARIO_IDS`
in `functions/src/testScenarios.ts`).

| Was | Now |
| --- | --- |
| New account, Beginner | Getting started; `checklistPlans`, `checklistCatchUp` |
| Hafiz, Heavy Activity | Heavy user; `checklistPlans` (the juz plan), `revoAttach` (a day attached) |
| Partly done today, Missed days | Missed yesterday; `checklistCatchUp`, `insightsCarry` |
| Revised ahead | Heavy user (D−2); `checklistPlans` (AHEAD-1, AHEAD-3, AHEAD-4) |
| Fajr edge | `checklistPlans` (DAY-2, DAY-9, LOG-3), E2E flow 04 |
| Custom reverse plan | `checklistPlans`, `customPlanPlanIt` (SCHED-3, SCHED-4, SCHED-6) |
| Offline queue | `checklistOffline` (SYNC-1), E2E flow 06 |

## What's checked automatically

Each scenario is loaded in turn in `tests/scenarios/scenarios/testScenarios.scenario.tsx` (RESET-3): Settings' three
in one test, the older ones in another. Every BEHAVIOUR.md rule that can be read off an account is checked
(`harness/invariants.ts`):
- **DAY:** 1, 2, 4, 9.
- **SCHED:** 1–6. SCHED-5 checks each session against the plan as it was that day, with the pages memorized by then.
- **AHEAD-2, SESS-2, CARRY-1, MEM-1.**
- **LOG:** 1, 3.
- **ACT:** 1, 2.
- **Each scenario's own promise above.**
  - Heavy user: the first launch leaves every page's count, rating and last revised day as written (SYNC-6).
  - All three: the takes reach the app's own read of Recite's memory.

`revoContext` checks that Revo is told what Home shows, in every scenario. The rules tests write every scenario's
documents as the user (`tests/firestore-rules/testScenarios.test.ts`); Revo's are written by its functions only and
are left out. The take documents are checked against the app's own reader and word data
(`src/lib/__tests__/testScenarios.port.test.ts`).

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
