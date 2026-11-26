/**
 * How Revisely works, for Revo: the source of truth it answers "how", "where" and "why" questions
 * from (the cached part of its system prompt, prompt.ts). Plain and compact, written for a model.
 *
 * Two parts (Majd, Nov 16 2026: "whatever app changes we make, revo should get that update too"):
 * - GUIDE_SECTIONS, in the system prompt every account gets: what the store app does (and its testers').
 * - DEV_GUIDE_SECTIONS, a system block of its own sent only from Revisely Dev (the context's `app: 'dev'`,
 *   prompt.ts): what only Revisely Dev has. Store requests never carry it, so they stay byte-identical.
 *
 * Keep it true (guide.test.ts):
 * - every rule id in BEHAVIOUR.md is in a section's `covers`, or in GUIDE_INTERNAL with a reason that starts
 *   with one of GUIDE_INTERNAL_KINDS (nothing a user sees: timing, server, layout, an owner's tool…);
 * - a rule under a BEHAVIOUR.md heading marked "(Revisely Dev)", or marked so right after its id
 *   ("- **ACT-28.** (Revisely Dev) …"), is in the Dev guide, never in the main one; the Dev guide covers only those;
 * - every route in a section's `routes` is a screen in src/navigation/MainNavigator.tsx;
 * - every label in curly quotes (“Edit schedule”) is text the app shows, word for word (src/).
 * Change it in the same PR as the feature: every change a user can see updates the guide (main or Dev).
 * Verified against the code on Nov 9 2026, as of the release
 * that opens Activity, memorizing by the ayah, help, What's new and every QuranEnc translation to
 * everyone (Settings → Testing stays testers'; searching the Qur'an, typed and by voice
 * on an iPhone, opened to everyone on Nov 9 2026).
 *
 * Name parts of the Qur'an by surah and juz here too (the owner's rule); page numbers only where
 * the app itself shows them. Mark what only testers (previewTester accounts) see.
 */
import { REVO_SCREENS, RevoScreen } from './types';

export interface GuideSection {
  title: string;
  /** BEHAVIOUR.md rules this section tells the user about. */
  covers: readonly string[];
  /** The screens (route names in src/navigation/MainNavigator.tsx) this section sends the user to. */
  routes: readonly string[];
  text: string;
}

const lines = (...l: string[]) => l.join('\n');

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    title: 'Finding your way',
    covers: ['NAME-1', 'NAME-2', 'REVO-25', 'REVO-41', 'TAB-2', 'HOME-1', 'HOME-3'],
    routes: ['Dashboard', 'ReadIndex', 'Activity', 'Settings'],
    text: lines(
      '- The tab bar: Home, Activity, Read (swipe between them). Insights is in Activity; tapping Activity again goes back to its start.',
      '- Home’s top bar: a gear (Settings) on the right, a running timer on the left. No compass: the next-prayer line opens the Prayer sheet.',
      '- Home’s Today post: where today starts (e.g. "Starts at Al-Mujadila", or "Starts at Al-Hadid, 2nd page" mid-surah) and how much it is; “Change” after it opens Jump to. Under it, one button: “Start revision”, “Continue revision” or “Review session”. Then "… of the Quran memorized ›" with a dot per juz; its › opens the memorized pages. Then “Recent sessions” (the last three) and “See all”.',
      '- Read tab: “Search the Quran” under its title, “Recent pages”, then every surah, grouped by juz. Tap one to open the reader.',
      '- The app names places by surah or juz and which page of it ("Maryam, 5th page", "Juz 2, first 5 pages"); part of a page ends "· start", "· middle" or "· end". A start can show the page’s first words under it. Ayah numbers only where a verse is cited or played. Mushaf page numbers are a detail (the reader, the session, “Jump to…”’s Page tab).',
      '- Revo: the round button in a bottom corner of Home, Activity (Overview, Insights, a day, See all, Pages by strength) and “Edit schedule”; drag it to the other corner and it stays. None on the Read tab or in a session.',
    ),
  },
  {
    title: 'The revision day',
    covers: ['DAY-1', 'DAY-2', 'DAY-3', 'DAY-4', 'DAY-5', 'DAY-6', 'DAY-7', 'DAY-8'],
    routes: [],
    text: lines(
      '- “Today” is the revision day. It changes at midnight, or at Fajr with “Start day at fajr” on (Settings → Revision): from midnight until Fajr it is still the day before, so revising at 1 AM counts for the evening before. Fajr is worked out for the saved location.',
      '- Tomorrow is always the next revision day. A session keeps the day it was opened on, even if Fajr or midnight passes while it is open. Coming back to the app shows the day it is now.',
      '- Every time zone works the same; a daylight-saving change never skips or repeats a day.',
    ),
  },
  {
    title: 'Plans',
    covers: ['SCHED-1', 'SCHED-2', 'SCHED-3', 'SCHED-4', 'SCHED-5', 'SCHED-6', 'SCHED-7', 'CARRY-5'],
    routes: ['PlanEdit', 'PlanDayEdit'],
    text: lines(
      '- The plan goes round the memorized pages in a cycle, a set amount each revision day. Each memorized page comes round once a cycle.',
      '- Automatic (the default): a number of pages a day in mushaf order, or a number of juz a day (each day is the memorized pages of its juz). Set by “Daily amount”.',
      '- A custom plan: days built or edited by hand (or made with “Create new plan”); it loops from the day it was saved. New memorized pages don’t join it by themselves.',
      '- Reverse order: An-Nas back to Al-Fatiha, covering the same pages.',
      '- The plan follows the calendar: each revision day’s pages are set by its date, whether or not anything is revised. Missed days don’t pile up or push the plan back: after missed days Home shows that day’s pages, and the missed pages are offered for three days (see Catching up). To pick up where you stopped instead, use “Jump to…”.',
      '- A new plan switches today at once; pages already revised today stay done. Saving an edit leaves today as it is, unless the edit changes today itself. A day never holds the same page twice.',
      'How to (all in “Edit schedule”: Settings → Revision → “Schedule”):',
      '- Change the daily amount: “Daily amount” → Pages or Juz → “Pages per day” or “Ajzaʼ per day” → Save.',
      '- Make a new plan: “Create new plan” → “Balanced” (pages, in even days), “By Juz” (whole juz each day) or “Weakest” (Smart Tracking only: weakest and most overdue pages first) → “Pages per day” or “Juz per day”, “Today starts at” (a surah, juz or page) and “Reverse order” → Apply → Save (top right).',
      '- Edit one day: tap it (today is “Today’s revision”) → “Add or remove content” (pick surahs or ajzaʼ) or “Make rest day” → back → Save. “Add rest day” adds a day; hold a day and drag to move it; swipe to delete it. A rest day is a day of the cycle with nothing to revise, so it comes round every cycle: it isn’t a pause.',
      '- “Saved plans”: “Save current plan…” keeps it under a name; a plan’s “Load” (then Save) or bin.',
      '- Back to automatic: “Use automatic schedule”.',
    ),
  },
  {
    title: 'A revision session',
    covers: ['SESS-1', 'SESS-3', 'SESS-4', 'SESS-5'],
    routes: ['ActiveRevision', 'ActivityAll'],
    text: lines(
      '- Home → “Start revision” (or “Continue revision”). The session shows today’s pages in the plan’s order, as mushaf pages.',
      '- Swiping on from a page marks it revised; the last page is marked by swiping onto the end card. Bars at the top show which are done.',
      '- “Pages” (top right) lists the day’s pages: a row goes there, its circle marks or unmarks it; “Mark all revised”; with Smart Tracking “Rate page strength” (“Very weak” to “Very strong”).',
      '- The bottom bar: the recitation player, the mic (record) and the timer.',
      '- Back saves what was marked; nothing marked, nothing is saved.',
      '- The end card: “Revision complete” (or how many of the pages were revised), “Keep going” (revise ahead) and “Listen back” after a recording.',
      '- When every page of today is revised, Home says Done and the button is “Review session”, which opens the day’s done pages to check or change.',
      '- A past session: Home → Recent sessions → tap it, or its menu: “Edit session”, “Delete session”. Every session: “See all” (searchable).',
      '- On a juz plan a session of whole juz is named by the juz ("Juz 29"); other sessions by their surahs.',
    ),
  },
  {
    title: 'The streak',
    covers: ['SESS-2', 'SESS-6', 'SESS-7', 'ACT-15'],
    routes: ['Dashboard'],
    text: lines(
      '- A revision day counts when every page scheduled for it is revised and credited to that day (in its own session, or revised ahead before it came). Home then says Done.',
      '- The streak is how many such days in a row, counted back from today if today is done, otherwise from yesterday. So it stays alive all day, until today’s revision day ends (at midnight, or at Fajr with “Start day at fajr”). Home shows it as "Today · 12-day streak".',
      '- Yesterday missed (not all its pages revised) with the days before it complete: the streak shows dimmed, with a small ring beside Home’s ? that fills as yesterday’s missed pages are revised. Filled before today ends, it brings the streak back at once. Only yesterday’s pages count for this, not today’s. How: Home’s "Missed yesterday · …" or "Left yesterday · …" line → “Add to today” → revise them (they come first in today’s session and are credited to yesterday).',
      '- Today still needs its own pages: pages carried in from another day never count toward today.',
      '- Two missed days in a row break the streak, and revising an older day later doesn’t bring it back. Their pages are still offered for three days (see Catching up), and finishing today starts a new streak.',
    ),
  },
  {
    title: 'Catching up (pages left over)',
    covers: ['CARRY-1', 'CARRY-2', 'CARRY-3', 'CARRY-4'],
    routes: ['Dashboard', 'Settings'],
    text: lines(
      '- Pages not revised in the last three revision days are offered on Home once a day, above today’s button: "Left yesterday · Revise Al-Baqarah, 12th page" (a day started and not finished), "Missed yesterday · …" (no session that day) or "Missed 3 days · …". Older days aren’t offered, and a page revised at any point in those days isn’t either.',
      '- Nothing moves until “Add to today” is tapped; then they come first in today’s session. Still unrevised the next day, they are offered again.',
      '- “Keep daily amount” (Settings → Revision) decides the rest. On (the default): today keeps its usual size; the missed pages come first and the rest of the plan moves back by as many pages. Off: the missed pages go on top of today’s and nothing else moves.',
      '- Added pages count for the day they came from (that is what can bring a streak back), never for today.',
    ),
  },
  {
    title: 'Revising ahead',
    covers: ['AHEAD-1', 'AHEAD-2', 'AHEAD-3', 'AHEAD-4', 'AHEAD-5', 'AHEAD-6'],
    routes: ['ActiveRevision'],
    text: lines(
      '- Once today is done, Home shows a line like "Tomorrow starts at Al-Mulk"; tapping it opens the next day’s pages alone.',
      '- On the end card, “Keep going” goes on to the next revision day’s pages not done yet, then the day after. It doesn’t stop at the end of the cycle: once the whole cycle is done, Keep going starts the next cycle from its first day (Home says "Next cycle starts at Al-Fatihah"), and goes on through it. Those pages count for the next cycle’s days. A day already done ahead is passed over.',
      '- A page revised ahead counts for the day it is planned on: that day then needs only the pages left, and is done when none are. Only pages actually revised (swiped or checked) count. Activity, Insights and Pages by strength show it (and a page caught up) on the day it was revised.',
    ),
  },
  {
    title: 'Jump to…',
    covers: ['JUMP-1', 'JUMP-2', 'JUMP-3'],
    routes: ['Dashboard'],
    text: lines(
      '- Starts today at another juz, surah or page, earlier or later than today’s start, and the days after carry on from there. The plan’s position moves at once, with Undo for a few seconds.',
      '- How: Home → “Change” after where today starts → Juz, Surah or Page → pick one → “Start today at …”.',
      '- Today’s session then holds today’s amount from the new start. Pages carried in and not yet revised are dropped, and no catch-up is offered for today; pages already revised today stay counted.',
      '- The simplest way to revise a particular juz or surah today, without making a new plan.',
    ),
  },
  {
    title: 'Memorized pages',
    covers: ['ACT-10', 'ONBOARD-1', 'ONBOARD-3', 'ONBOARD-4'],
    routes: ['Memorization'],
    text: lines(
      '- Only pages marked memorized are scheduled. Home → "… of the Quran memorized ›" opens them ready to mark (from Settings → Revision → “Memorized pages”, tap the pencil first) → tap pages to mark or unmark them (by “Surahs”, “Juz” or “Hizb”) → Save. It asks “When did you memorize these?”: Today logs them in Activity for today; Before logs nothing.',
      '- After a change it may offer “Review schedule”, to fit the plan to the new pages.',
      '- At sign-up the memorized portions are chosen once; they can be changed here any time.',
    ),
  },
  {
    title: 'Memorizing by the ayah',
    covers: ['MEM-1', 'MEM-2', 'MEM-3', 'MEM-4', 'MEM-5', 'MEM-6', 'MEM-7', 'REC-1', 'REC-2', 'REC-3'],
    routes: ['ActivityDay', 'QuranReader', 'PlanEdit'],
    text: lines(
      '- What is memorized is kept by the ayah. A page is memorized when every ayah on it is; a page with some of them is partly memorized (a thin bar in the memorized pages). Adding a page’s last ayah makes it memorized.',
      '- The % memorized and the juz dots count a partly memorized page by the share of the page its memorized ayahs fill (their length, not how many). A partly memorized page is revised like a memorized one, and Home names it by its ayahs (with only An-Nas memorized on the last page, "Starts at An-Nas").',
      '- Add ayahs: Activity → + → “Memorized” → “Ayahs” (From and To), “Whole pages” or “Surah”; “From your reading” offers what was read today. Deleting a Memorized entry takes off only its ayahs.',
      '- A sitting in the reader: start the timer there (and the mic, to record), recite, then end the timer. Ending it also stops the recording; one note says what was saved, e.g. "Saved to today: Al-Mulk, first 2 pages, 41 min", with “Undo” (takes back the sitting and the recording that ended with it, which then never uploads) and “View” (its day in Activity). Stopping only the recording leaves the timer running.',
      '- On that day in Activity the sitting is under Read, named by the pages it held (“Timed in Read” when none are known). If they aren’t all memorized it offers “Add to memorized”: the Memorized sheet opens on Ayahs, inside the sitting’s pages. Afterwards it stands under Memorized and says what finishes the page ("Rest of Al-Mulk, 2nd page to go"); Undo puts everything back.',
      '- On today or yesterday, a sitting with nothing left to memorize on its pages, that held pages of that day’s revision not revised yet, offers “Add to revised” (e.g. "At-Taghabun is the 2 pages left of today’s revision"): it logs those pages for that day, as “Revised elsewhere” does.',
      '- The juz sheet shows a juz being learned: a partly memorized page is filled by its memorized share, a surah reads what is memorized and what is to go ("Up to «…» · rest of the page to go"), the sheet says what is learned so far, and its button continues at the first ayah not memorized.',
      '- Memorized today, the block says when the pages first come up in the plan, with “Revise them tomorrow” and “Edit schedule”. A custom plan never adds new pages by itself: “Not in your custom plan yet” with “Add to your plan”, and in “Edit schedule” the list “Not in your plan” with “With tomorrow’s pages” or “As a day of its own, tomorrow” (then Save).',
    ),
  },
  {
    title: 'Activity and a day’s notes',
    covers: ['DAY-9', 'ACT-1', 'ACT-2', 'ACT-3', 'ACT-5', 'ACT-6', 'ACT-7', 'ACT-11', 'ACT-14', 'ACT-17', 'ACT-18', 'ACT-20', 'LOG-1', 'LOG-2', 'LOG-3', 'LOG-4'],
    routes: ['Activity', 'ActivityDay', 'ActivityAll', 'ListenBack', 'QuranReader'],
    text: lines(
      '- Activity (its tab, or Settings → Revision → “Activity”): everything done, day by day, on the revision day it was done: sessions, pages revised ahead (listed on the day they were revised), timed readings and sittings, recordings, memorized ayahs and notes.',
      '- Two tabs at the top, “Overview” and “Insights”. Overview is a calendar: the chip beside its title (“Month” or “Week”, with ⌄) switches between the two (kept on the phone). ‹ › step back and on; “Today” appears when another month or week is showing and brings today back. Each day has a ring for how much of its pages was revised, and dots for memorized, read and a note.',
      '- Tap a day: a preview under the calendar shows its date with “Open” and a row each for Revised, Memorized, Read and Notes. Tapping anywhere on the preview opens that day, at the block tapped.',
      '- A day: its Revised, Memorized, Read and Notes blocks and its recordings. The Revised block has a strip of the day’s pages (revised, skipped or not reached), its ends named by surah; tap a page to open it in the reader, and back returns to the day. Under the strip: the pages’ strength with Smart Tracking, or else what the strip shows (e.g. "18 revised · 2 skipped"). Tapping the Revised block’s header opens the juz most of its pages were in, in the juz sheet (see Insights).',
      '- The + adds, for today and yesterday: “Revised elsewhere” (that day’s pages not revised yet, all ticked; “Add other pages” logs any memorized pages without changing the schedule), “Memorized” and “Note”. An older day’s + adds a note only. Reading is logged by the reader itself.',
      '- Hold a block’s header for Edit or Delete (it asks first; deleting a Memorized entry takes those ayahs off the memorized).',
      '- A day’s notes: open the day → + → “Note”. Each stays on its own; hold one for Edit, Copy or Delete (Undo for five seconds). A note can be shown under the day’s Revised, Memorized or Read item. A note written between midnight and Fajr belongs to the revision day.',
      '- “See all”: everything, searchable, with filters.',
    ),
  },
  {
    title: 'Insights and page strength',
    covers: ['ACT-4', 'ACT-8', 'ACT-12', 'ACT-16', 'ACT-19', 'ACT-21', 'ACT-22', 'ACT-23', 'ACT-24', 'ACT-25', 'ACT-26', 'ACT-31'],
    routes: ['Activity', 'ActivityDay', 'PagesByStrength', 'QuranReader'],
    text: lines(
      '- Activity → “Insights”. One range for the whole tab, from the chip at the end of the Overview | Insights row ("30 days ⌄" at first): “7 days”, “30 days”, “3 months” or “All time” (since the account’s first day). It is kept on the phone; a range longer than the account counts from its first day.',
      '- “Coverage”: the share of memorized pages revised in the range, and the memorized pages by “Juz”, “Surah” or “Page” (kept on the phone), each “This week”, “This month”, “30+ days” or “Not memorized”. A page memorized but not revised is “Not revised yet” for its first 30 days, never 30+ days. A juz or surah fills by the share of its pages revised. By Surah, tap a juz for its surahs (a surah opens its juz sheet); by Page, a cell opens the reader. Tap the figure for what wasn’t revised (e.g. "Not revised in 30 days"), a row per juz or run of pages. The "Juz 4, untouched the longest" row: “Plan it” puts that juz first tomorrow, for that day only; on a custom plan, “Add to plan” under “First tomorrow” adds its pages to tomorrow’s day of the plan, every cycle once saved.',
      '- The juz sheet (from a Coverage tile, the untouched row, or a day’s Revised block): the juz named by its surahs, when it was last revised and on how many days in the last 30, a strip of its pages and a row per surah. Tap a page, a row or “Open in the reader” to read it there; a juz left too long offers “Plan it for tomorrow first”.',
      '- “Consistency”: days with a revision or a read in the range, and the minutes by hour (press and slide along the hour bars to read each hour). A day’s circle opens that day; the figure opens Overview at its month. At 3 months: a weeks grid and, if there is one, the missed days’ pattern ("Every missed day was a Saturday").',
      '- “Memorization”: pages memorized each month; tap a month’s bar for that month’s memorizations, each opening its day. “Pace”: minutes per page, shown from ten timed items, against the same length before; tap its "From 24 timed revisions ›" line for each one.',
      '- On a new account, days before it are neither done nor missed ("1 of 1 day since 19 November"); the minutes by hour show from 3 days with something timed, Memorization’s bars once a month has a page memorized.',
      '- Strength comes from ratings: 1–2 weak, 3 moderate, 4–5 strong (an unrated revised page counts as strong). Rating needs “Smart Tracking” (Settings → Revision), then “Pages” → “Rate page strength” in a session.',
      '- Smart Tracking on: “Weak spots” (pages weak now or skipped twice, with “Revise … first tomorrow” and “Ask”), strength in the juz sheet and on a day, and at the foot of Weak spots “See all pages by strength”: every revised page, weakest first, by “Pages”, “Surahs” or “Juz”, filtered by juz or strength.',
      '- Smart Tracking off: nothing in Activity shows strength (no weak, moderate or strong counts, no weak marks, no Weak spots); when a part was last revised and how often show instead. In Weak spots’ place, “Turn on Smart Tracking to see your weak spots” turns it on (Settings → Revision).',
    ),
  },
  {
    title: 'Reading, recitation and translations',
    covers: ['READ-1', 'AUDIO-1', 'AUDIO-2', 'AUDIO-3', 'TRANS-1', 'TRANS-2', 'TRANS-3', 'TRANS-4', 'TRANS-5', 'TRANS-6', 'TRANS-7', 'TRANS-8'],
    routes: ['ReadIndex', 'QuranReader'],
    text: lines(
      '- Read tab → a surah, or “Recent pages” → the reader, which opens straight on that page (from a search result, Jump to…, a day or a session too). Tap the page for the controls; swipe to turn pages; the bar at the bottom moves through the mushaf.',
      '- Hold a verse: “Play”, “Translation”, “Copy”, “Share”. “Translation” shows the verse in Arabic and in the chosen translation, exactly as its publisher gives it, with its footnotes and credit; ‹ › move between verses.',
      '- Changing the translation: in the translation sheet, ⋯ at the top right → “Select translation”. There are 76 translations in 56 languages, among them Saheeh International (the default; offline once downloaded with the offline mushaf), Urdu, Indonesian, Turkish, French, Spanish, German, Persian, Hindi, Chinese, Hausa, Swahili and Portuguese, and The Clear Quran (needs the internet, unless read before). The list shows “Selected”, “Favorites”, “Downloaded”, then every language; search a language, in English or its own name, or a translator. A translation is kept on the phone once read, and stays at its latest version.',
      '- Favorites and offline translations: the star on a translation adds it to “Favorites” (kept on this phone); “Edit” moves favorites up or down, takes a star away, and deletes downloads. Each translation shows its size; its download button downloads it whole, the bin removes it, and downloaded ones are listed under “Downloaded” and read offline. Offline, a translation that isn’t downloaded says so and offers one of that surah that is on the phone (the same language first, then Saheeh International).',
      '- The player bar: ▶ plays from this page; the reciter’s name picks the reciter; the options icon opens “Audio Options”: “Reciter”, “Playback speed” (0.25× to 2×), “From” and “To” (surah and ayah), “Play up to” (Page, Surah, Juz’ or Custom), “Repeat” (loop, or 1 to 10 times) and “Pause after each verse”. While playing: stop, speed, previous and next verse, pause.',
      '- Reciters: Al-Husary, Al-Minshawi, Abdul Basit, Alafasy, As-Sudais, Ash-Shuraim, Al-Muaiqly, Al-Ghamdi, Al-Ajamy, Ash-Shatri, Al-Hudhaify, Muhammad Ayyub, Al-Tablawi, Ad-Dossari. The reciter follows the account; speed, repeat, pause and Play up to are kept on the phone.',
      '- Recitation goes on after leaving the reader (a mini player above the tab bar: pause, ✕ to stop, › back to the reader), in the background and with the phone locked. It streams, so it needs the internet.',
      '- On Android (version 1.0.4 on), recitation’s notification has previous and next verse; a paused one can be put away ("Hide" on the media control) and ▶ in the app goes on from there.',
    ),
  },
  {
    title: 'Searching the Qur’an',
    covers: ['SEARCH-1', 'SEARCH-2', 'SEARCH-3'],
    routes: ['ReadIndex', 'QuranSearch', 'QuranReader'],
    text: lines(
      '- Everyone: the Read tab has “Search the Quran” under its title; the search field is at the bottom of the screen, in reach of a thumb. Type a few words of an ayah in Arabic (with or without vowel marks) and the ayat that hold them are listed: from the middle of an ayah too, even with a word misspelled; a phrase in several ayat lists every one. Typing a surah (Yunus, or its Arabic name), an ayah (2:255, Yunus 16), a page (page 62) or a juz (juz 30) goes there.',
      '- Each ayah found shows its surah and ayah, the Arabic with the words found in darker ink, and their translation with its credit. Under it: Share, Copy (works offline) and “Open in the reader”, which opens the reader at the ayah, highlighted.',
      '- On an iPhone there is also a mic beside the field: recite a few words and the ayah is found the same way; tap it again to stop. The first time, it offers the speech model (a one-time download of 57 MB, started by a tap; Settings → Downloads and storage → “Speech model” shows or deletes it), and the iPhone asks for the microphone. It listens on the phone: the voice isn’t recorded or sent. Microphone refused: turn it on in the iPhone’s Settings → Revisely. On Android, type the words.',
    ),
  },
  {
    title: 'Help and What’s new',
    covers: ['HELP-1', 'HELP-2', 'HELP-3', 'HELP-4', 'NEW-1', 'NEW-2', 'NEW-3'],
    routes: ['Settings'],
    text: lines(
      '- Screens that need explaining have a ?: Home (the Today post’s header), Edit schedule (before Save), the reader (its header), a session (the last row of “Pages”, “Help”), Activity (its top bar, for the tab on show) and a day (before +). It opens up to four short topics, then “Ask Revo” (not in the reader’s or a session’s help), “Hide help buttons” and Done.',
      '- The ? buttons are on unless hidden: “Hide help buttons” hides every one at once on this phone, and Settings → Help and support → “Help buttons” brings them back. With Smart Tracking off, help says nothing about ratings or strength.',
      '- After an update with something new, a short walkthrough opens once before Home: Next on each card, Done on the last; it can’t be skipped, and another phone won’t show it again. Settings → About → “What’s new” shows it again any time.',
    ),
  },
  {
    title: 'Recording, listening back and the timer',
    covers: ['AUDIO-4'],
    routes: ['ListenBack', 'ActivityDay'],
    text: lines(
      '- In the reader or a session, the mic records the recitation; pause or stop it there. A recording is saved under its day in Activity. Stopping shows “Recording saved” with “Undo” (deletes just this go, which never uploads; a day’s earlier recording stays) and “View” (its day in Activity).',
      '- “Listen back” (on the end card, or a recording in Activity) plays it over the pages it was recorded on.',
      '- Settings → Downloads and storage → “Back up recordings” keeps a copy in the account (Wi-Fi only unless “Back up over mobile data”). Recordings on a phone are deleted only when the user deletes them there.',
      '- The timer is in the reader’s and the session’s bottom bar: a stopwatch, or a timer of a set length (tap the time to type minutes). Pause, end (saved as a timed reading in Activity) or discard. A running timer shows in Home’s top bar.',
    ),
  },
  {
    title: 'Offline and other phones',
    covers: ['SYNC-1', 'SYNC-2', 'SYNC-3', 'SYNC-5', 'ACCOUNT-1', 'UPD-1'],
    routes: ['Settings'],
    text: lines(
      '- Everything works offline from the copy on the phone: changes are saved on the phone and sent in order once back online, and Home shows “Offline”. Pages not downloaded or opened before need the internet, so download the offline mushaf (below) to read and revise anywhere. Another phone signed in to the account sees changes once sent. The same day revised on two phones offline keeps every page.',
      '- The first setup on a phone needs the internet, and so do Revo, recitation, The Clear Quran (unless read before) and a day’s notes not opened before.',
      '- Offline mushaf: Settings → Downloads and storage → “Offline mushaf” → “Download now”: every page, the Arabic text and Saheeh International (up to about 250 MB). Wi-Fi only unless “Download over mobile data”; it downloads while the app is open and carries on where it stopped. “Remove from this phone” deletes it.',
      '- “Delete account” (Settings → your name, confirmed twice) deletes the account and everything in it; it needs the internet.',
      '- Updates come by themselves: “A new update is ready” → “Update now” or “Later”.',
    ),
  },
  {
    title: 'Mushaf, prayer times and the Qibla',
    covers: ['KAHF-1', 'KAHF-2', 'KAHF-3'],
    routes: ['Settings', 'PrayerCalculation', 'PrayerNotifications'],
    text: lines(
      '- Settings → Mushaf and Recite → “Mushaf”: Madani 1405 (the default) or Madani 1441. Page numbers stay the same for plans.',
      '- The next-prayer line under Home’s header opens the Prayer sheet: Times (today’s prayers, the next with a countdown) and Qibla (a compass to the Kaaba; it needs location, which stays on the phone).',
      '- Settings → Prayer: “Prayer times”, “Calculation” (method and madhab), “Qibla” and “Next prayer on Home” (a line under Home’s header).',
      '- Settings → Reminders → “Friday Al-Kahf reminder”: a card on Home from Thursday’s maghrib to Friday’s (the Prayer sheet’s maghrib). Read on Thursday evening, it counts for that Friday; “Not today” hides it until Friday’s maghrib.',
    ),
  },
  {
    title: 'Settings, section by section',
    covers: ['SET-1', 'REVO-39', 'REMIND-1', 'REMIND-3', 'REMIND-4', 'SET-2', 'SET-3', 'SET-4'],
    routes: ['Settings'],
    text: lines(
      '- Settings is a short list: your name (display name, “Premium”, “Time in app”, “Sign out”, “Delete account”), then a row per page.',
      '- Revision: “Schedule”, “Smart Tracking”, “Keep daily amount”, “Start day at fajr”, “Memorized pages”, “Activity”. Reminders: “Revision reminders” (8:00 AM, after Asr, an hour before the day ends, until today is done; times can’t be set), “Prayer notifications”, “Friday Al-Kahf reminder”.',
      '- Mushaf and Recite: “Mushaf”, and Recite’s settings. Revo AI: its switch, “What Revo can do” (its short introduction, also played before Revo is first on; Skip ends it), “Memory”, “Delete conversations”.',
      '- Downloads and storage: “Offline mushaf”, “Download over mobile data”, “Recordings”, “Back up recordings”, “Back up over mobile data”, and “Speech model” (iPhone). Appearance: “Theme”, “Accent” (Indigo, Crimson, Jade).',
      '- Help and support: “Help buttons”, “Share Revisely”, “Send feedback”, “Report a problem” (with “Add a screenshot”), “Contact support”. About: “What’s new”, “Privacy Policy”, “Terms of Service”. Testing (testers only): “Reset my data”, “Load test scenario”.',
      '- Widgets: Today, Verse of the day, Qibla and Prayer times, added like any widget: on an iPhone (Home Screen, Lock Screen) and, from 1.0.4, on Android.',
    ),
  },
  {
    title: 'Recite and Mark mistakes',
    covers: ['RECITE-1', 'RECITE-2', 'RECITE-3', 'RECITE-4', 'RECITE-5', 'RECITE-6', 'RECITE-8', 'RECITE-9', 'RECITE-14', 'RECITE-31', 'RECITE-32', 'SEARCH-4', 'PREM-1', 'READ-2'],
    routes: ['QuranReader', 'ActiveRevision', 'Settings'],
    text: lines(
      '- Who has it: an iPhone, or Android from version 1.0.5, with the Madani 1405 mushaf (Settings → Mushaf and Recite → “Mushaf”): the reader’s bar and a session’s have a mic and an eye in place of the record button. It needs the internet: Revisely’s server checks the recitation; nobody listens.',
      '- The mic: tap it to start a take. Hold it for “Record” (“Just record your recitation”), “Recite” (“The page follows you”) with the “Mark mistakes” switch under it (on from the start), and “Test me”. Recite follows them on the page; Mark mistakes marks wrong, skipped and added words and haraka and letter slips as they recite (tajweed isn’t marked yet).',
      '- Premium early access: Mark mistakes and Test me are Premium, free for everyone who signs up during early access (no end date yet); every account that got it then keeps it for life once Premium is paid. Settings → your name → “Premium” says so; an account without it gets it from “Get Premium” in Mark mistakes’ intro. Not a trial: nothing is charged and there are no prices.',
      '- A take starts anywhere: “Listening…” until it finds where they are (the page, then the whole Qur’an); then a grey band and a grey box on the word follow them, and the page turns. Never found: nothing is marked. In the bar: “Pause”, “Resume”, Stop (then “Checking…”) and ✕; a tap on the page hides the controls.',
      '- Marks are highlights behind the word: red for a wrong, skipped or extra word; amber for a haraka or letter slip, and for “Not clear” (not heard clearly; never counted); the first amber mark says so once in the bar. Restarting an ayah is never marked. Tap one: “Expected” and what was heard, “Not a mistake”, “Hear it”, “Your recitation” (their voice) and “Similar phrases”.',
      '- After Stop, “Your recitation”: the score by the page, each mark (a tap shows it), a row when they went on with a similar ayah ("You continued with «…» in Luqman (31:6), a similar ayah"), “Recite the mistakes again” (one take over just that stretch, then "Before: …"), “Ask Revo about this take”, “Recite again” and “Done”.',
      '- The eye (“Hide the page”) covers the words; they appear as recited. ‹ (“Show the next word”) and ‹‹ (“Show the whole ayah”) peek: peeked words stay grey and never count. Saying something other than the next word turns its cover red: a hint, never a mark.',
      '- “Test me”: five random places in what they’ve memorized (“Everything you’ve memorized” or one juz), each hidden but for an ayah’s first two words; then "4 of 5 continued cleanly" and “Test me again”. With nothing memorized: “Mark what you’ve memorized first”. In the reader only.',
      '- In a session a take never marks a page revised (only swiping off it or “Pages” does). A voice search that finds one place opens the reader at the ayah, highlighted, nothing listening; Back returns to the search.',
      '- Not yet: Recite with the Madani 1441 print or offline, tajweed marks, a teacher hearing the takes.',
    ),
  },
  {
    title: 'Takes, past mistakes and progress',
    covers: ['RMEM-1', 'RMEM-2', 'RMEM-3', 'RMEM-4', 'RMEM-5', 'RMEM-6', 'RINS-1', 'RINS-2', 'RINS-3'],
    routes: ['QuranReader', 'ActivityDay', 'ActivityAll', 'Activity'],
    text: lines(
      '- Every take with Mark mistakes is kept on the account as text (its marks, place, score, whether the page was hidden), never audio: its audio stays on the phone. Recite alone keeps nothing.',
      '- A word missed stays marked on the page (lighter, outside a take, not on a hidden page, not with Settings → Mushaf and Recite → “Show past mistakes” off) until it is said right in 2 takes on 2 different revision days. Tap it for its history, “Hear it” and “Clear now” (with Undo). With Premium, holding the mic there offers "Recite your 3 mistakes here".',
      '- A summary says what it cleared ("2 cleared from the page") and, from a passage’s second take, “Your progress here”: “Your progress” has its chart, “Still to fix here” and “Your takes here”.',
      '- A take is never a recording, a sitting or pages revised. Its summary’s ⋯ has “Delete this take”. In Activity a day’s takes are a “Recited” block, a row each, newest first (a tap shows it on the page, a hold opens its menu; past five, the newest four and "All 7 takes"), and Overview’s preview of the picked day has a “Recited” row that opens the day at its takes. A take’s menu has “Show on the page”, “Ask Revo about this take” and “Delete this take”; “See all” → “Recitations” lists every take.',
      '- Activity → “Insights” → “Recitation”: the score and how it moved, “Keeps slipping” (passages with words still marked; a tap opens them), “Similar ayahs” they went on with, and “Ask”. With Smart Tracking off, nothing about strength.',
      '- Revo knows what their takes show (the last 4 weeks: takes, score, mistakes by kind, words still marked and cleared, passages that keep slipping, similar ayahs), never the audio, and only what the checker marked.',
    ),
  },
  {
    title: 'Gaps, Last revised and arranging Activity',
    covers: ['ACT-28', 'ACT-29', 'ACT-30'],
    routes: ['Activity', 'ActivityDay', 'LastRevised', 'QuranReader'],
    text: lines(
      '- Activity → “Insights” → “Gaps” (after Consistency): a gap is 2 days or more in a row without revising (Monday, then Thursday, is 2 days; one missed day is not one). It shows the days since the last revision (red from 3), how many gaps and how often they usually revise ("No gaps yet" at first), then each gap, latest first, with its days and a bar; a tap marks it on the Overview calendar. “Days” shows exact days. "Full revision pushed back 5 days" (or "Full revision on schedule", after a gap) says how late their plan’s pages come round.',
      '- “When did I last revise…?” opens “Last revised”: “Surahs”, “Juz”, “Hizbs” or “Pages”, sorted “Recent first”, “Longest waiting first” or “Mushaf order”, filtered “Revised this week”, “2 weeks or more” or “Not revised yet”; a page opens the reader. Say long gaps in weeks or months, welcome them back, never scold.',
      '- “Edit sections” (the icon at the end of the Overview and Insights tabs) shows, hides and reorders a tab’s sections (hold one, then drag); “Show all, in the usual order” puts it back. Kept on this phone.',
    ),
  },
  {
    title: 'For testers',
    covers: ['RESET-2', 'RESET-3'],
    routes: ['Settings'],
    text: lines(
      '- Testers (TestFlight or Google Play testing, marked by the Revisely team) get Settings → Testing and updates early.',
      '- “Reset my data” (type RESET): a backup is kept, then the account starts again as new, still signed in; not again within 10 minutes. “Load test scenario” replaces the data with a ready-made situation the same way.',
    ),
  },
  {
    title: 'Revo itself',
    covers: ['REVO-1', 'REVO-2', 'REVO-3', 'REVO-5', 'REVO-7', 'REVO-8', 'REVO-9', 'REVO-10', 'REVO-20', 'REVO-21', 'REVO-22', 'REVO-23', 'REVO-30', 'REVO-31', 'REVO-32', 'REVO-33', 'REVO-34', 'REVO-35', 'REVO-36', 'REVO-37', 'REVO-38', 'REVO-40', 'REVO-42'],
    routes: ['Settings', 'ActivityDay', 'PagesByStrength'],
    text: lines(
      '- Its first line is about where it was opened: Home, today; Overview, the month so far; Insights, what stands out; Weak spots or Pages by strength, the weak pages; a day, or a juz’s “Ask”, that day or juz, which goes with the question (× takes it off).',
      '- Off until turned on (its first open, or Settings → Revo AI). Each question sends the numbers the app shows (today, the week, the streak, pages and ratings); 20 new questions a revision day, back after Fajr or at midnight. The same first question again that day is free.',
      '- + opens “Add to chat”: search a surah, a juz, ayahs, a day or a page, or pick from Surahs, Juz, Days (a month: tap a day, then “Add day”) and Pages; up to six go with one question, and a day goes with its daily-log notes. History keeps the conversations; Memory keeps up to 30 short facts (delete one, clear them, or turn memory off). A Day in review comes once, from the evening, on a day something was done.',
      '- Revo can’t change anything itself: a suggestion happens only when tapped (“Add to my plan” puts pages first in tomorrow’s session; a card can also open a screen, such as Jump to… or a Settings section). It answers how-to questions from this guide. It needs the internet.',
      '- Its charts answer a touch: tap a bar, dot, tile or row (or slide along the bars) to see that day or passage, then “Open in Activity”, “Open in the reader” or “Revise first tomorrow” (only when tapped). A second tap or × puts it back; a table sorts by the heading tapped. The grey bar behind a day is its plan.',
      '- It may notice a pattern in the last days and say so, with one idea (catching up on missed days, revising far ahead, late at night, a steady run), only when it fits the question.',
      '- With Smart Tracking off, Revo and its charts show when each part was last revised and how often, never ratings or strength.',
      '- Settings → Revo AI → off deletes its conversations and memory.',
    ),
  },
  {
    title: 'Not possible (yet), and the closest way',
    covers: [],
    routes: [],
    text: lines(
      '- Revising one juz backwards while the rest goes forward: no; “Reverse order” turns the whole plan backwards. Closest: “Create new plan” → “Balanced” → “Reverse order” on → “Today starts at” → that juz → Apply → Save: today starts at the juz’s end and goes back page by page, into the juz before it. (“By Juz” reversed puts the juz in reverse order, each one’s pages in their usual order.)',
      '- A plan of whole surahs made for you: there is no surah mode (only pages, juz, or weakest). Closest: in “Edit schedule”, tap a day → “Add or remove content” → Surahs; or “Jump to…” → Surah.',
      '- Revising a passage as a session without touching the plan: no. Closest: “Jump to…” (moves today’s start), or read it in the reader with the timer, and log it with Activity → + → “Revised elsewhere”.',
      '- Pausing the plan for a holiday: there’s no pause, and missed days don’t pile up: the plan follows the calendar, and their pages are offered for three days. Back from the trip, “Jump to…” picks up where you stopped. (Rest days come round every cycle, so they aren’t a pause.)',
      '- Getting a streak back after two missed days, catching up days older than three, or moving a session to another day: no.',
      '- Following the phone’s light or dark setting, choosing reminder times, translations in Bengali, Russian, Malay, Korean or Italian, tafsir, a tajweed mushaf, recitation offline, sharing progress with a teacher, exporting data, several active plans at once (one is active; others can be saved): not yet.',
    ),
  },
];

/**
 * What only Revisely Dev has (the test app that installs beside Revisely, on the dev backend, and gets new features
 * first), in the same form as GUIDE_SECTIONS. Sent as its own system block only from Revisely Dev (DEV_GUIDE_SYSTEM).
 * When a feature moves to the store app, move its section (or its lines) to GUIDE_SECTIONS.
 */
export const DEV_GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    title: 'Revised elsewhere, a day’s entry and Today’s journal',
    covers: ['ACT-33', 'ACT-34', 'ACT-35', 'HOME-2'],
    routes: ['Dashboard', 'Activity'],
    text: lines(
      '- A day’s + → “Revised elsewhere”: a search for a surah or juz above the 30 juz. A tap chooses a juz; a hold opens it for its halves or parts. Extra pages never change the day’s schedule.',
      '- Activity is one tab: “This week” (“Month” opens the calendar), the picked day (tap to open; no note), then “Your revision”: a row per section opening its page (empty ones hidden), “Edit sections” last. Spot tests: own line, block and search filter, “Finished” or “Stopped early”. A note can show under a take or spot test (Note sheet’s Show under, or its menu’s “Add a note”).',
      '- Home: the “Today’s journal” row under Today opens today’s journal.',
    ),
  },
  {
    // The Memorized picker (Majd, Nov 23 2026): Revisely Dev until it ships.
    title: 'Choosing what you memorized on the page',
    covers: ['MEM-8'],
    routes: ['Activity'],
    text: lines(
      '- Activity → + → “Memorized” has “On the page”, “Surah” and “Juz”. “Choose on the page” opens the mushaf where they left off: tap the ayah reached and it fills from the first ayah to go; “Whole page” and “Clear” act on the page, and “Done” returns. It doesn’t move the reader’s place. With VoiceOver or a page not downloaded, it’s a list of first words.',
    ),
  },
  {
    // The athan (Majd, Nov 22 2026): Revisely Dev on iPhone until a version has its sounds built in for Android.
    title: 'The athan as a prayer’s notification sound (iPhone)',
    covers: ['ATHAN-1', 'ATHAN-2', 'ATHAN-3', 'ATHAN-4'],
    routes: ['Settings', 'PrayerNotifications', 'AthanVoice'],
    text: lines(
      '- On iPhone, a prayer’s notification can play the athan: Settings → Prayer → “Prayer notifications” → a prayer that is on → “Sound” → “Athan”, then “Voice” to choose it for that prayer. Tapping a prayer’s name in Home’s prayer times opens it too. Settings → Prayer → “Athan voice” chooses one voice for every prayer set to the athan. Fajr uses the voice’s Fajr athan if it has one; a voice named for Fajr is for Fajr only.',
      '- An iPhone notification can play only the first 30 seconds of an athan. A reminder before the prayer keeps the standard tone. Silent mode and Focus still apply.',
      '- A voice downloads when chosen (play listens first); until then, the standard tone. Android doesn’t have the athan yet.',
      '- To hear the whole athan, tap the prayer’s notification within 15 minutes of it: the app opens and plays that voice’s whole athan from the start, with “Stop”. It needs a connection, and it stops if the app is left.',
    ),
  },
  {
    // REMIND-2 (Nov 21 2026), in Revisely Dev until its switch is on (lib/release/remindersWhileAway); its line then
    // moves to "Settings, section by section" (with the re-record).
    title: 'Revision reminders after a few days away',
    covers: ['REMIND-2', 'REMIND-5'],
    routes: ['Settings'],
    text: lines(
      '- The revision reminders: today’s and tomorrow’s, then one each morning for the rest of the week after the app was last open (naming where that day’s revision starts), then none until it is opened again. There is no setting for how many.',
      '- Settings → Testing → “Scheduled reminders” lists the reminders this phone will show and when; “Show the next one in 5 seconds” shows the next as a real notification.',
      '- Settings → Reminders → “Revision reminders” is off while the phone refuses Revisely’s notifications, and says so; turning it on then offers “Open Settings”.',
    ),
  },
  {
    // Mistake detection reached the store app with 1.0.5 (its lines are in GUIDE_SECTIONS). Strict stays Revisely Dev's
    // until it has a release of its own (Majd, Nov 17 2026).
    title: 'Only in Revisely Dev',
    covers: ['SESS-8', 'LANG-2', 'RECITE-7', 'RECITE-26', 'RECITE-27', 'RECITE-28', 'RECITE-29', 'RECITE-30', 'SET-5', 'ONBOARD-5'],
    routes: ['Settings'],
    text: lines(
      '- Settings → Testing → “Preview onboarding”: the first setup’s screens on a blank account, saving nothing.',
      '- Settings → Mushaf and Recite → “Mistakes to mark”: “Mistakes”, or “Strict (Beta)”, which also marks tajweed in violet: ghunnah, ikhfa, qalqalah, idgham (with and without ghunnah), iqlab, a natural madd dropped, “Madd munfasil” at 4 or 5 counts, a lazim madd held short, and “Madd ʿarid” once it’s set to a length. It doesn’t check “Madd muttasil”, munfasil at 2 counts or ikhfa of meem yet, so never say it checks every tajweed rule. It’s Beta: it can miss a slip or note a correct word; notes never count. The store app marks mistakes only.',
      '- Two tiers of marks. Mistakes: a wrong or skipped word, a hesitation (“Hesitated here”, on the word they didn’t know; after the end, “Extra word”), a wrong haraka or letter, each named on its card (“Wrong word”, “Wrong haraka”, “Wrong letter”, “Wrong shadda”) and in the summary, and counted in the score, never called a “slip”. Tajweed notes (Strict) are Beta: “(Beta)” after the name, never counted. “Not clear” is neither, never counted. Red for words, amber for harakat, letters and Not clear, violet for tajweed.',
      // The main guide's two lines on this go with the release's re-record of its replies.
      '- “Recite the mistakes again” and "Recite your N mistakes here" are gone: never offer them. To work on a mistake, recite the passage again.',
      '- A take needs at least one ayah recited (or about a mushaf line of a very long one). Less isn’t kept.',
      // The main guide's line on a take in a session goes with the release's re-record of its replies.
      '- In a session, going on to the next page while reciting marks the page they finished revised, as a swipe does (✓ or “Pages” takes it back); a jump to a mark’s page marks nothing. Once a page’s last ayah is said, the next page shows and waits for them.',
      '- The bar writes each word once they’ve said it, in the order said: a repeat or going back shows again, and nothing ahead of their voice.',
      '- “Test me” here is one spot test: a random verse, the page hidden but for it. How far, where from and “Show progress” are in Settings → Mushaf and Recite → Spot tests; it finishes a surah ending near. It ends with “Hasbuk”, or “Stopped early”.',
      '- Settings → Mushaf and Recite → “Keep my recitations as test data” (on by default) keeps each take and its result for Revisely’s tests; software checks them, nobody listens. Every account that recites has it. Settings → Testing → “Premium” turns Premium off to see Mark mistakes locked.',
      '- Settings → About → “Licences” shows the recitation model’s licence (the Quran Muaalem License) in full, offline too.',
      '- Settings → Testing → “Mistake detection model” says which model the checker runs (for example v7); a tap asks again.',
      '- Settings → Appearance → “Language”: “Phone’s language”, English or العربية (Arabic). It restarts Revisely (“Restart”, or “Not now”). In Arabic, Revo answers in Arabic too. Untranslated text shows in English. The store app is English only for now. In Arabic the mushaf turns as a printed one does.',
      '- Settings → Help and support → “Rate Revisely” opens the store’s review page. After a day’s revision with a streak of 7 days or more, the end card may show “Enjoying Revisely? Rate it”: at most 3 times, four months apart, not in an account’s first week, never after a tap or dismissal. Nothing is given for rating.',
    ),
  },
  {
    // Long takes (Nov 20 2026), in Revisely Dev until the mistake detection release brings them to the main guide (with
    // its re-record).
    title: 'Takes that end without their final check',
    covers: ['RECITE-11', 'RECITE-12'],
    routes: ['QuranReader', 'ActiveRevision', 'ActivityDay', 'ActivityAll'],
    text: lines(
      '- Stop always ends within a few seconds: nothing opens by itself; the bar shows the take’s result (the score and mistakes, or “Done”), and a tap on it opens the summary. If the server’s check of the end hasn’t come by then, or the connection was lost after the take had found where they were, the summary shows what the take found and says the end of the take wasn’t checked; the take is kept, unfinished, with its marks and its recording. If the check comes after all, the summary and the take update.',
      '- Leaving the reader or the session during a take, or while Stop waits, keeps the take too (unfinished); a take that never found where they were keeps nothing.',
      '- In “Recited” and “Recitations” an unfinished take’s line says "unfinished"; one whose audio is all there is (from before takes were kept this way) says "not checked" and shows no score. Unfinished takes never count in the score or in “Your progress”.',
    ),
  },
  {
    // RMEM-7 (Nov 22 2026; Majd, after the Tarteel analysis): Revisely Dev's until the next release brings it to the main
    // guide (with its re-record).
    title: 'A passage’s earlier takes, in the take’s summary',
    covers: ['RMEM-7'],
    routes: ['QuranReader', 'ActiveRevision'],
    text: lines(
      '- After a take with Mark mistakes, its summary lists up to 5 earlier takes of the same stretch, newest first, as "This passage: your last 3 takes" (a take counts when each shares at least half its ayat with the other). Each row says the day, its score by the page and its mistakes (tajweed notes and Not clear never count), its ayat when they differ, and whether the page was hidden. Unfinished and deleted takes aren’t listed.',
      '- A tap on a row shows that take on its page with its marks until Done, as Show on the page does. “Your progress here” under it still opens every take of the passage with the chart.',
      '- “Your progress here” and “Your progress” count only takes of the same stretch (by the same rule) in the trend, score and chart. “Your takes here” still lists every take covering half of the passage, each with its ayat.',
    ),
  },
  {
    // RMEM-8 (Nov 22 2026; Majd: "make that take card clickable and have it open that days summary popup sheet"):
    // Revisely Dev's until the next release brings it to the main guide (with its re-record).
    title: 'A take’s summary, opened again',
    covers: ['RMEM-8'],
    routes: ['QuranReader', 'ActivityDay', 'ActivityAll'],
    text: lines(
      '- A take shown on its page (from a day’s “Recited”, “Recitations”, “This passage” or “Your takes here”) has its card at the bottom, “Your take · …”, with ▶ and Done. A tap on the card opens that take’s summary again as it ended: when, score, each mistake (a tap shows its card), similar ayahs, words peeked, marks called Not a mistake with Put back, words cleared, “This passage” and “Your progress here”; “Its day in Activity” and ⋯ “Delete this take”. No Recite again.',
      '- Takes before Nov 22 2026 don’t show their peeked words or marks called Not a mistake (not kept then).',
    ),
  },
  {
    // Long recitations (Nov 22 2026), in Revisely Dev until the mistake detection release brings them to the main guide.
    title: 'Reciting for longer than 15 minutes',
    covers: ['RECITE-22'],
    routes: ['QuranReader', 'ActiveRevision'],
    text: lines(
      '- A recitation can go on as long as they like, in the reader or a whole session: the server checks 15 minutes at a time and Revisely joins the pieces by itself. Nothing stops or changes on screen, and every mistake marked stays.',
      '- Stop ends it as usual, and the summary covers the whole recitation: one score, one recording, and one take in “Recited” and “Your progress”. “Your recitation” plays for any mistake in it, during and after Stop, from the recitation’s recording; with “Save recordings when you recite” off (Settings, Recite) nothing keeps the earlier parts’ audio, so only mistakes in its last 15-minute part play.',
    ),
  },
  {
    // Majd's Nov 20 2026 asks, in Revisely Dev until the next release (Not clear's line too: the store app has it, and
    // the release's re-record brings it to the main guide).
    title: 'Mistakes on a hidden page, Not clear, the mistake sound, Your recitation, and how highlights look',
    covers: ['RECITE-13', 'RECITE-15', 'RECITE-16', 'RECITE-17', 'RECITE-18', 'RECITE-19', 'RECITE-20', 'RECITE-21', 'RECITE-24'],
    routes: ['QuranReader', 'ActiveRevision', 'Settings'],
    text: lines(
      '- With the page hidden (the eye) and no take running, a word with a mistake keeps its highlight on its place, the word still hidden: the take’s marks in their colour after it, and past mistakes lighter (with “Show past mistakes” on), so they know where they tend to slip. During a take nothing is drawn on a word still hidden, past mistakes included; each shows once its word does. A tap on a highlighted place opens that word’s card, as on a shown page (it shows the word).',
      '- Pause on the bar keeps the take open however long the pause; its summary only comes after Stop. During a take the score on the bar opens what it has found so far (Done goes back to the take); after it, the score opens the take’s summary again.',
      '- “Not clear” words stay amber on the page after the take too (and on a hidden page’s covers), remembered like a wrong haraka until the word is said clearly in 2 takes on 2 days; a take that heard it only as Not clear again counts as not clear. They still never count in a score.',
      '- Mark mistakes checks recitation in Hafs ʿan ʿĀṣim (its intro says so); other riwayat aren’t checked yet.',
      '- On a slow connection, when checking falls a few seconds behind, the bar says “Slow connection: checking is behind” in place of the words until it catches up.',
      '- Each new mistake plays a short sound and a tap (not for Not clear or tajweed notes, at most one every 0.7 s), in silent mode too; Settings → Mushaf and Recite → “Sound on a mistake” turns it off. While recording, the iPhone plays it from the earpiece.',
      '- After a take, its summary says the mistakes per page beside the count when it covered 2 pages or more ("3 mistakes · 1.5 a page"), and each wrong word or haraka shows “Expected” and what was recited, each with the words around it.',
      '- Activity → “Insights” → “Recitation” says the same for its range, under the score: the mistakes a page across their takes of 2 pages or more ("Takes of 2 pages or more: 1.2 mistakes a page"). You are told it for the last 4 weeks; takes of a page or less aren’t in it.',
      '- “Your recitation” on a mark’s card plays the phrase the mistake is in (pause mark to pause mark, any but ۙ), or a short ayah whole; never more than 15 seconds. A skipped word plays from the word before it.',
      '- When a take starts, the cursor shows where they seem to be within a second or two of their first word (the page shown only), and settles once the app is sure where they started; "Listening…" stays until then.',
      '- On a hidden page a word shows once it has been said in full or the next word has begun (a long madd waits for its end), never a word ahead. Nothing is drawn on the word being said; the newest word shown is in green ink, and a word with a mark keeps its highlight. The bar shows no more than the page.',
      '- A hidden page shows a faint line where words are hidden, the ayah markers whole; each word appears in place once shown.',
      '- Hiding the page during a take keeps everything they have already passed on show (the page before where they started, and what they recited) and hides only what comes next. When a take stops, what they recited stays shown (with anything shown by hand) until they hide the page again. Hiding it after a take hides everything; the take’s mistakes still show where they are and can be tapped.',
      '- Highlights on the page are soft pastel washes behind the word, not boxes: the mistakes’ red, amber and violet, past mistakes lighter. With the page shown, a flat grey band lies behind the ayah being recited and a firmer grey rectangle follows the word being recited, never ahead',
    ),
  },
  {
    title: 'Questions about the Qur’an',
    covers: ['REVO-44', 'REVO-45'],
    routes: [],
    text: [
      '- Qur’an questions: answered only from al-Tabari, Ibn Kathir, al-Qurtubi and al-Sa’di, the books’ words under “From the tafsir” (a tap shows the passage); if they don’t say, Revo says so. No rulings. Counted.',
      '- Asked from the R at a page’s foot or a held ayah’s “Ask Revo” (never in a session); Settings → Revo AI → “In the mushaf” hides both.',
    ].join('\n'),
  },
  {
    // Majd, Nov 21 2026: a Ramadan look to try, Revisely Dev only; Nov 26: Auto, sheets' lights.
    title: 'The Ramadan theme',
    covers: ['THEME-1', 'THEME-2', 'THEME-3', 'THEME-4', 'THEME-5', 'THEME-6', 'THEME-7', 'THEME-8'],
    routes: ['Settings', 'Dashboard'],
    text: lines(
      '- Settings → Appearance → “Ramadan theme”: Auto (two weeks before to three days after Eid), On or Off. Decoration only, never on a page, session or take.',
      '- Insights: Ramadan row and page; the end card says the day. Khatmah by Eid: pages left ÷ days left; openPage at the first page not yet.',
    ),
  },
  {
    // Nov 23 2026: the first step to Recite checking on the phone instead of the server (Majd: "get the model on phone").
    title: 'On-device model (Settings → Testing)',
    covers: ['ONDEV-1'],
    routes: ['Settings', 'OnDeviceBench'],
    text: lines(
      '- Settings → Testing → “On-device model” is the Revisely team’s bench: it times Recite’s model on this phone (per 4-second window; the mark is under 250 ms at p95), with memory and heat, and “Long run” adds battery.',
      '- “Stub” under the phone’s name means this build has no on-device engine. Results go to the team without their account or audio.',
      '- With Recite’s pack on the phone, the screen also shows a “Self-check” line: whether the models compute the expected numbers on this phone. It then tests a take on a recording (Strict where the phone can run it) for about a minute and a half, so stay on the screen; nothing is recorded from the microphone. Both go to the team once per pack and app update.',
    ),
  },
  {
    // Nov 23 2026: the model and tables on the phone, ahead of Recite running there (Majd: "get the model on phone").
    title: 'Recite on the phone (Settings → Downloads and storage)',
    covers: ['ONDEV-2', 'ONDEV-3'],
    routes: ['Settings'],
    text: lines(
      '- Settings → Downloads and storage → “Recite on the phone” downloads what lets Recite check on the phone (about 50 MB), encrypted and out of backups. A build with the engine uses it for takes Settings → Testing sends to this phone.',
      '- It starts when they open the reader, on Wi-Fi unless “Download over mobile data” is on. Its menu has Download now and Remove. Some accounts don’t have it yet; when it isn’t available the row says why, and Download now shows only if trying again can help.',
    ),
  },
  {
    // Nov 23 2026: one pipeline in two places (on-device-plan.md §12).
    title: 'Where Recite runs (Settings → Testing)',
    covers: ['ONDEV-4'],
    routes: ['Settings'],
    text: lines(
      '- “Recite runs on”: Automatic (the team’s setting, the server for now), This phone or The server. The line under it says where the next take runs and why.',
      '- A take the engine can’t run goes to the server by itself. Automatic needs a short speed check while idle; a take that falls behind slows the next ones.',
    ),
  },
  {
    // Majd, Nov 25 2026: "adding revo to edit my schedule page and making it so that revo can help the user make or edit their schedule".
    title: 'Drafting a schedule',
    covers: ['REVO-43'],
    routes: ['PlanEdit'],
    text: lines(
      '- Revo drafts only when the question says "Asked from Edit schedule". Otherwise none: openScreen planEditor, where Revo can draft one.',
      '- draftSchedule {mode "pages" or "juz", perDay (pages 1–40, juz 1–3), restDays (weekdays off, 0 Sun–6 Sat, [] none; pages only), reverse (false unless asked)}, detail what changes. The card is the draft; never say it changed.',
      '- “Check in Edit schedule” opens it filled in, unsaved; only Save keeps it.',
    ),
  },
  {
    // The Account page's new look (Majd approved the boards, Nov 26 2026): Revisely Dev until released.
    title: 'Account and badges',
    covers: ['ACCOUNT-4', 'ACCOUNT-5', 'ACCOUNT-6', 'ACCOUNT-7', 'ACCOUNT-8'],
    routes: ['Dashboard', 'Settings'],
    text: lines(
      '- Settings → your name: picture (photo or initial; tap to change) in Premium’s ring, latest badge, pages revised (each revision counts), longest streak, time in Revisely. Home’s picture opens it. “Name and email” has “Delete account”.',
      '- Badges by pages revised, two a tier: Bronze 10/50, Silver 100/250, Gold 500/1K, Platinum 2.5K/5K, Diamond 10K/25K, Emerald 50K/100K. The bar opens “Badges”. A new one shows once (end card or Account).',
    ),
  },
];

/**
 * Why a rule can stay out of the guide: each GUIDE_INTERNAL reason starts with one of these and a colon.
 * Nothing here is something a user sees and could ask about: such a rule goes in the guide (Dev-only ones in the Dev
 * guide), never here (guide.test.ts).
 */
export const GUIDE_INTERNAL_KINDS = [
  'timing', // when something loads, refreshes or waits
  'server', // what the server does or repairs on its own
  'layout', // how the screen is laid out, with nothing to do
  'owner tool', // the owner's scripts and consoles
  'signed out', // screens before sign-in: Revo is for signed-in users
  'superseded', // a feature Revo replaced
  'prompt', // how Revo itself is asked and told
] as const;

/** Rules with nothing for a user to ask Revo about, on purpose, and why (a kind from GUIDE_INTERNAL_KINDS first). */
export const GUIDE_INTERNAL: Readonly<Record<string, string>> = {
  'RECITE-10': 'timing: how a take keeps up with the server and resumes a connection gone quiet; nothing to do',
  'ACT-27': 'timing: Activity refreshes by itself and with a pull; nothing to ask Revo about',
  'NEW-4': 'timing: what waits for the walkthrough to end; nothing for Revo to explain',
  'ONBOARD-2': 'server: the server repairs a sign-up stopped half way; nothing to do',
  'LANG-1': 'layout: the layout follows the app’s language, not the phone’s; nothing for Revo to explain',
  'SHEET-1': 'layout: one sheet at a time, so the screen under them always takes taps again; nothing for Revo to explain',
  'SHEET-2': 'layout: a sheet with the keyboard up fits under the status bar, so its Cancel and Add stay on screen; nothing for Revo to explain',
  'TAB-1': 'layout: a sideways swipe never presses the row under the finger; nothing for Revo to explain',
  'ACT-32': 'layout: how the calendar’s preview words a day’s Revised figure; nothing for Revo to explain',
  'RECITE-25': 'layout: nothing a take shows covers the page; its bar, a shown take’s card and its Undo sit under it; nothing for Revo to explain',
  'LINK-1': 'layout: where a link opens (the app’s own browser, else the phone’s, else its address to copy); the links themselves are in the guide',
  'SYNC-4': 'timing: a new account loads with no relaunch; nothing to do',
  'SYNC-6': 'timing: a page keeps its last revised day, count and rating however long the history grows; nothing to do',
  'ACCOUNT-2': 'signed out: the sign-in screen keeps what was typed after a failed attempt',
  'AUTH-1': 'server: a passing Google outage at launch keeps the sign-in; nothing to do',
  'ACCOUNT-3': 'timing: how long Delete account waits for the server; the app says what happened itself',
  'AUTH-2': 'signed out: the sign-in screen says when the phone was signed out',
  'RESET-1': 'owner tool: the owner’s reset script',
  'ACT-9': 'timing: when a day’s items load',
  'ACT-13': 'timing: an add from the day’s + shows there at once, offline too (the + itself is in Activity’s section)',
  'COACH-1': 'superseded: the Ask coach’s limits (Revo supersedes it)',
  'COACH-2': 'superseded: what the Ask coach is sent',
  'COACH-3': 'superseded: the Ask coach’s model and key',
  'COACH-4': 'superseded: the Ask coach’s opt-in (Revo supersedes it)',
  'COACH-5': 'superseded: the Ask coach’s sheet',
  'REVO-4': 'server: the monthly cost cap',
  'REVO-6': 'server: Revo’s model, key and logs',
  'REVO-24': 'layout: the sheet’s layout with the keyboard',
  'REVO-26': 'prompt: how Revo’s context is built',
  'REVO-27': 'prompt: how Revo words its answers (its tone, in the prompt)',
};

/** The guide as Revo reads it. */
export const REVO_GUIDE = GUIDE_SECTIONS.map((s) => `### ${s.title}\n${s.text}`).join('\n\n');

/** The Dev guide as Revo reads it. */
export const DEV_GUIDE = DEV_GUIDE_SECTIONS.map((s) => `### ${s.title}\n${s.text}`).join('\n\n');

/**
 * The system block sent after the main prompt, only from Revisely Dev (prompt.ts; cached on its own). Every other
 * request stays exactly as it was, and with it the store's prompt cache and the recorded replies.
 */
export const DEV_GUIDE_SYSTEM = [
  'Revisely Dev:',
  '- They use Revisely Dev, the test app that installs beside Revisely and gets new features first. Everything in the guide holds there too; the Dev guide below adds what only Revisely Dev has. Answer how, where and why questions about it the same way as from the guide: the answer, then the path once, about 35 words.',
  '- What the Dev guide says needs a tester account is in their app only when the question says "Tester: yes". For anyone else, say it isn’t in their app yet.',
  '- Never invent a Dev feature, a button or a path either: what isn’t in the guide or the Dev guide, you aren’t sure exists.',
  '',
  '<dev-guide>',
  DEV_GUIDE,
  '</dev-guide>',
].join('\n');

/** What each screen of an `openScreen` action opens, for the prompt (REVO-31). */
export const SCREEN_HINTS: Readonly<Record<RevoScreen, string>> = {
  jumpTo: 'Home’s Jump to… sheet',
  planEditor: 'the plan editor, Edit schedule',
  memorized: 'the memorized pages, ready to mark',
  activity: 'Activity',
  insights: 'Activity, where Insights is the tab at the top',
  dailyLog: 'today in Activity',
  settings: 'Settings; add "section", the page it opens: revision (Revision), notifications (Reminders), prayer (Prayer), mushaf (Mushaf and Recite), revo (Revo AI), activity (Downloads and storage), appearance (Appearance) or testing (Testing)',
  prayerTimes: 'the Prayer sheet on Times',
  qibla: 'the Prayer sheet on Qibla',
  reader: 'the reader; add "surah" (1–114) or "juz" (1–30) to open at its start',
};

/** The openScreen action as the prompt describes it, from the list the server accepts. */
export const OPEN_SCREEN_ACTION = `{"kind": "openScreen", "title": string, "detail": string, "screen": string} takes them to a screen, where "screen" is one of: ${REVO_SCREENS.map((s) => `"${s}" (${SCREEN_HINTS[s]})`).join('; ')}`;

/** The part of Revo's system prompt that carries the guide (cached with the rest). */
export const GUIDE_PROMPT = [
  'How Revisely works:',
  '- The guide below says how the app behaves, where each screen and setting is, how to do common tasks, and what it can’t do. A question about how something works, where it is, how to do it or whether the app can do it is answered from the guide only.',
  '- Such an answer is the answer in one sentence, then the path written once (“Settings → Revision → Schedule”), at most two short steps: about 35 words in all. Don’t describe the steps and then list them again. It is still the one JSON object every reply is, with the steps in "text".',
  '- In such an answer say nothing about today’s pages, what is left today, weak pages or the streak unless the question is about them, and don’t suggest starting today’s revision. Its action is an openScreen to the screen the answer names, whenever that screen is in the openScreen list; otherwise no action.',
  '- Which screen: “Edit schedule”, “Create new plan” or “Daily amount” → planEditor; “Jump to…” or “Change” → jumpTo; Settings → a section → settings with that section; the reader, its player bar or “Audio Options” → reader; the Prayer sheet: prayer times → prayerTimes, the Qibla → qibla; the memorized pages → memorized; today’s day or adding a note → dailyLog; Activity → activity; Activity’s Insights → insights. Never write that you added a shortcut or will open something: the card shows it.',
  '- When the streak, missed days or missed pages come up, say how to catch up: tap “Add to today” on Home. A streak broken by two missed days can’t come back, but those days’ pages can still be added that way (the last three days): always say so.',
  '- Never invent a feature, a button, a setting or a path. When the guide says the app can’t do something (it is under “Not possible (yet)”, or the guide says no or not yet), say so plainly (“Not yet.” or “There’s no …”), then give the closest way the guide names. When that way changes more than they asked for (the whole plan, for one juz), say so in a few words. Say “I’m not sure that’s possible in Revisely” only for something the guide doesn’t mention at all, then offer the closest thing it has.',
  '- What the guide marks as for testers is in their app only when the question says "Tester: yes". For anyone else, never offer it as if it were there: say it isn’t in their app yet, then give the closest way that is.',
  '',
  '<guide>',
  REVO_GUIDE,
  '</guide>',
].join('\n');
