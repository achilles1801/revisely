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
    covers: ['NAME-1', 'REVO-25'],
    routes: ['Dashboard', 'ReadIndex', 'Activity', 'Settings'],
    text: lines(
      '- The tab bar has Home and Read (swipe sideways between them). Insights is in Activity.',
      '- Home’s top bar, on the right: a compass (the Prayer sheet: prayer times and the Qibla), a pulse icon (Activity) and a gear (Settings). A running timer shows on the left.',
      '- Home’s Today post: where today starts (e.g. "Starts at Al-Mujadila ›", or "Starts at Al-Hadid, ayah 4 ›" mid-surah) and how much it is. Tapping that line (its ›) opens a menu with “Jump to…” and “Edit schedule”. Under it, one button: “Start revision”, “Continue revision” or “Review session”. Then "… of the Quran memorized ›" with a dot per juz; its › opens the memorized pages. Then “Recent sessions” (the last three) and “See all”.',
      '- Read tab: “Search the Quran” under its title, “Recent pages”, then every surah, grouped by juz. Tap one to open the reader.',
      '- The app names parts of the Qur’an by surah and juz ("Al-Baqarah 84–101", "Juz 28"). Page numbers show only as a detail (the header of today’s › menu), in the reader and the session, and where pages are chosen by number (the Page tab of “Jump to…”).',
      '- Revo: the round button at the bottom right of Home and of Activity (Overview, Insights, a day, See all, Pages by strength). There is no Revo on the Read tab (its list or the reader) or in a revision session.',
    ),
  },
  {
    title: 'The revision day',
    covers: ['DAY-1', 'DAY-2', 'DAY-3', 'DAY-4', 'DAY-5', 'DAY-6', 'DAY-7', 'DAY-8'],
    routes: [],
    text: lines(
      '- “Today” is the revision day. It changes at midnight, or at Fajr with “Start day at fajr” on (Settings → Prayer): from midnight until Fajr it is still the day before, so revising at 1 AM counts for the evening before. Fajr is worked out for the saved location.',
      '- Tomorrow is always the next revision day. A session keeps the day it was opened on, even if Fajr or midnight passes while it is open. Coming back to the app shows the day it is now.',
      '- Every time zone works the same; a daylight-saving change never skips or repeats a day.',
    ),
  },
  {
    title: 'Plans',
    covers: ['SCHED-1', 'SCHED-2', 'SCHED-3', 'SCHED-4', 'SCHED-5', 'SCHED-6', 'SCHED-7', 'CARRY-5'],
    routes: ['PlanEdit', 'PlanDayEdit'],
    text: lines(
      '- The plan goes round the memorized pages in a cycle, a set amount each revision day, then starts again. Each memorized page comes round once a cycle.',
      '- Automatic (the default): a number of pages a day in mushaf order, or a number of juz a day (each day is the memorized pages of its juz). Set by “Daily amount”.',
      '- A custom plan: days built or edited by hand (or made with “Create new plan”); it loops from the day it was saved.',
      '- Reverse order: from the end of the memorized pages back to the start (An-Nas back to Al-Fatiha), covering the same pages.',
      '- The plan follows the calendar: each revision day’s pages are set by its date, whether or not anything is revised. Missed days don’t pile up or push the plan back: after missed days Home shows that day’s pages, and the missed pages are offered for three days (see Catching up). To pick up where you stopped instead, use “Jump to…”.',
      '- A new plan switches today at once; pages already revised today stay done. Saving an edit leaves today as it is, unless the edit changes today itself. A day never holds the same page twice.',
      'How to (all from Home → today’s › → “Edit schedule”, a screen called Schedule):',
      '- Change the daily amount: “Daily amount” → Pages or Juz → “Pages per day” or “Ajzaʼ per day” → Save.',
      '- Make a new plan: “Create new plan” → “Balanced” (pages, in even days), “By Juz” (whole juz each day) or “Weakest” (Smart Tracking only: weakest and most overdue pages first) → “Pages per day” or “Juz per day”, “Today starts at” (a surah, juz or page) and “Reverse order” → Apply → Save (top right).',
      '- Edit one day: tap it (today is “Today’s revision”) → “Add or remove content” (pick surahs or ajzaʼ) or “Make rest day” → back → Save. “Add rest day” adds a day; hold a day and drag to move it; swipe to delete it. A rest day is a day of the cycle with nothing to revise, so it comes round every cycle: it isn’t a pause.',
      '- “Save current plan…” keeps the plan under a name; tap a saved plan to load or delete it.',
      '- Back to automatic: “Use automatic schedule”.',
    ),
  },
  {
    title: 'A revision session',
    covers: ['SESS-1', 'SESS-3', 'SESS-4', 'SESS-5'],
    routes: ['ActiveRevision', 'ActivityAll'],
    text: lines(
      '- Home → “Start revision” (or “Continue revision”). The session shows today’s pages in the plan’s order, as mushaf pages.',
      '- Swiping on from a page marks it revised; the last page is marked by swiping onto the end card. The check button at the top marks or unmarks the page on screen.',
      '- ⋯ at the top: “Jump or mark in bulk” (by juz or all pages, “Mark all done”), and with Smart Tracking “Rate page strength” (“Very weak” to “Very strong”).',
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
      '- Pages not revised in the last three revision days are offered on Home once a day, above today’s button: "Left yesterday · Revise Al-Baqarah 84–101" (a day started and not finished), "Missed yesterday · …" (no session that day) or "Missed 3 days · Revise Al-Baqarah 30–134". Older days aren’t offered, and a page revised at any point in those days isn’t either.',
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
      '- How: Home → today’s › → “Jump to…” → Juz, Surah or Page → pick one → “Start today at …”.',
      '- Today’s session then holds today’s amount from the new start. Pages carried in and not yet revised are dropped, and no catch-up is offered for today; pages already revised today stay counted.',
      '- The simplest way to revise a particular juz or surah today, without making a new plan.',
    ),
  },
  {
    title: 'Memorized pages',
    covers: ['ACT-10', 'ONBOARD-1'],
    routes: ['Memorization'],
    text: lines(
      '- Only pages marked memorized are scheduled. Home → "… of the Quran memorized ›" opens them ready to mark (from Settings → Activity → “Memorized pages”, tap the pencil first) → tap pages to mark or unmark them (by “Surahs”, “Juz” or “Hizb”) → Save. It asks “When did you memorize these?”: Today logs them in Activity for today; Before logs nothing.',
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
      '- A sitting in the reader: start the timer there (and the mic, to record), recite, then end the timer. Ending it also stops the recording; one note says what was saved, e.g. "Saved to today: Al-Mulk, ayahs 1–26, 41 min", with “Undo” (takes back the sitting and the recording that ended with it, which then never uploads) and “View” (its day in Activity). Stopping only the recording leaves the timer running.',
      '- On that day in Activity the sitting is under Read, named by the pages it held (e.g. "Al-Mulk, ayahs 1–26"; “Timed in Read” when none are known). If they aren’t all memorized it offers “Add to memorized”: the Memorized sheet opens on Ayahs, inside the sitting’s pages. Afterwards it stands under Memorized and says what finishes the page (e.g. "Al-Mulk 21–26 finishes the page"); Undo puts everything back.',
      '- On today or yesterday, a sitting with nothing left to memorize on its pages, that held pages of that day’s revision not revised yet, offers “Add to revised” (e.g. "At-Taghabun is the 2 pages left of today’s revision"): it logs those pages for that day, as “Revised elsewhere” does.',
      '- The juz sheet shows a juz being learned: a partly memorized page is filled by its memorized share, a surah reads what is memorized and what is to go ("Ayahs 1–20 · 21–30 to go"), the sheet says what is learned so far ("Al-Mulk 1–20 so far"), and its button continues at the first ayah not memorized ("Continue at Al-Mulk 21").',
      '- Memorized today, the block says when the pages first come up in the plan, with “Revise them tomorrow” and “Edit schedule”. A custom plan never adds new pages by itself: “Not in your custom plan yet” with “Add to your plan”, and in “Edit schedule” the list “Not in your plan” with “With tomorrow’s pages” or “As a day of its own, tomorrow” (then Save).',
    ),
  },
  {
    title: 'Activity and the daily log',
    covers: ['DAY-9', 'ACT-1', 'ACT-2', 'ACT-3', 'ACT-5', 'ACT-6', 'ACT-7', 'ACT-11', 'ACT-14', 'ACT-17', 'ACT-18', 'ACT-20', 'LOG-1', 'LOG-2', 'LOG-3', 'LOG-4'],
    routes: ['Activity', 'ActivityDay', 'ActivityAll', 'JournalEntry', 'ListenBack', 'QuranReader'],
    text: lines(
      '- Activity (Home’s pulse icon, or Settings → Activity → “Activity”): everything done, day by day, on the revision day it was done: sessions, pages revised ahead (listed on the day they were revised), timed readings and sittings, recordings, memorized ayahs and notes.',
      '- Two tabs at the top, “Overview” and “Insights”. Overview is a calendar: the chip beside its title (“Month” or “Week”, with ⌄) switches between the two (kept on the phone). ‹ › step back and on; “Today” appears when another month or week is showing and brings today back. Each day has a ring for how much of its pages was revised, and dots for memorized, read and a note.',
      '- Tap a day: a preview under the calendar shows its date with “Open” and a row each for Revised, Memorized, Read and Notes. Tapping anywhere on the preview opens that day, at the block tapped.',
      '- A day: its Revised, Memorized, Read and Notes blocks and its recordings. The Revised block has a strip of the day’s pages (revised, skipped or not reached), its ends named by surah; tap a page to open it in the reader, and back returns to the day. Under the strip: the pages’ strength with Smart Tracking, or else what the strip shows (e.g. "18 revised · 2 skipped"). Tapping the Revised block’s header opens the juz most of its pages were in, in the juz sheet (see Insights).',
      '- The + adds, for today and yesterday: “Revised elsewhere” (that day’s pages not revised yet, all ticked; untick the ones not done; they count on Home and for the streak), “Memorized” and “Note”. An older day’s + adds a note only. Reading is logged by the reader itself.',
      '- Hold a block’s header for Edit or Delete (it asks first; deleting a Memorized entry takes those ayahs off the memorized).',
      '- The daily log (a day’s notes): open the day → “Write”, or Activity → + → “Note”. Each note stays on its own; edit or copy one from its menu; swipe one away to delete it (Undo for five seconds). A note can be shown under the day’s Revised, Memorized or Read item. A note written between midnight and Fajr belongs to the revision day.',
      '- “See all”: everything, searchable, with filters.',
    ),
  },
  {
    title: 'Insights and page strength',
    covers: ['ACT-4', 'ACT-8', 'ACT-12', 'ACT-16', 'ACT-19', 'ACT-21', 'ACT-22', 'ACT-23', 'ACT-24', 'ACT-25', 'ACT-26'],
    routes: ['Activity', 'ActivityDay', 'PagesByStrength', 'QuranReader'],
    text: lines(
      '- Activity → “Insights”. One range for the whole tab, from the chip at the end of the Overview | Insights row ("30 days ⌄" at first): “7 days”, “30 days”, “3 months” or “All time” (since the account’s first day). It is kept on the phone; a range longer than the account counts from its first day.',
      '- “Coverage”: the share of memorized pages revised in the range, and the memorized pages by “Juz”, “Surah” or “Page” (kept on the phone), each “This week”, “This month”, “30+ days” or “Not memorized”. A page memorized but not revised is “Not revised yet” for its first 30 days, never 30+ days. A juz or surah fills by the share of its pages revised. By Surah, tap a juz for its surahs (a surah opens its juz sheet); by Page, a cell opens the reader. Tap the figure for what wasn’t revised (e.g. "Not revised in 30 days"), a row per juz or run of pages. The "Juz 4, untouched the longest" row: “Plan it” puts that juz first tomorrow, for that day only; on a custom plan, “Add to plan” under “First tomorrow” adds its pages to tomorrow’s day of the plan, every cycle once saved.',
      '- The juz sheet (from a Coverage tile, the untouched row, or a day’s Revised block): the juz named by its surahs, when it was last revised and on how many days in the last 30, a strip of its pages and a row per surah. Tap a page, a row or “Open in the reader” to read it there; a juz left too long offers “Plan it for tomorrow first”.',
      '- “Consistency”: days with a revision or a read in the range, and the minutes by hour (press and slide along the hour bars to read each hour). A day’s circle opens that day; the figure opens Overview at its month. At 3 months: a weeks grid and, if there is one, the missed days’ pattern ("Every missed day was a Saturday").',
      '- “Memorization”: pages memorized each month; tap a month’s bar for that month’s memorizations, each opening its day. “Pace”: minutes per page, shown from ten timed items, against the same length before; tap its "From 24 timed revisions ›" line for each one.',
      '- Strength comes from ratings: 1–2 weak, 3 moderate, 4–5 strong (an unrated revised page counts as strong). Rating needs “Smart Tracking” (Settings → Revision), then ⋯ → “Rate page strength” in a session.',
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
      '- On an iPhone there is also a mic beside the field: recite a few words and the ayah is found the same way; tap it again to stop. The first time, it offers the speech model (a one-time download of 57 MB, started by a tap; Settings → Revision → “Speech model” shows or deletes it), and the iPhone asks for the microphone. It listens on the phone: the voice isn’t recorded or sent. Microphone refused: turn it on in the iPhone’s Settings → Revisely. On Android, type the words.',
    ),
  },
  {
    title: 'Help and What’s new',
    covers: ['HELP-1', 'HELP-2', 'HELP-3', 'HELP-4', 'NEW-1', 'NEW-2', 'NEW-3'],
    routes: ['Settings'],
    text: lines(
      '- Screens that need explaining have a ?: Home (the Today post’s header), the schedule editor (before Save), the reader (its header), a session (the last row of ⋯, “How a session works”), Activity (its top bar, for the tab on show) and a day (before +). It opens up to four short topics, then “Ask Revo” (not in the reader’s or a session’s help), “Hide help buttons” and Done.',
      '- The ? buttons are on unless hidden: “Hide help buttons” hides every one at once on this phone, and Settings → Support → “Help buttons” brings them back. With Smart Tracking off, help says nothing about ratings or strength.',
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
      '- Settings → Activity → “Back up recordings” keeps a copy in the account (Wi-Fi only unless “Back up over mobile data”). Recordings on a phone are deleted only when the user deletes them there.',
      '- The timer is in the reader’s and the session’s bottom bar: a stopwatch, or a timer of a set length (tap the time to type minutes). Pause, end (saved as a timed reading in Activity) or discard. A running timer shows in Home’s top bar.',
    ),
  },
  {
    title: 'Offline and other phones',
    covers: ['SYNC-1', 'SYNC-2', 'SYNC-3', 'SYNC-5', 'ACCOUNT-1', 'UPD-1'],
    routes: ['Settings'],
    text: lines(
      '- Everything works offline from the copy on the phone: changes are saved on the phone and sent in order once back online, and Home shows “Offline”. Pages not downloaded or opened before need the internet, so download the offline mushaf (below) to read and revise anywhere. Another phone signed in to the account sees changes once sent. The same day revised on two phones offline keeps every page.',
      '- The first setup on a phone needs the internet, and so do Revo, recitation, The Clear Quran (unless read before) and a day of the daily log not opened before.',
      '- Offline mushaf: Settings → Mushaf → “Offline mushaf” → “Download now”: every page, the Arabic text and Saheeh International (up to about 250 MB). Wi-Fi only unless “Download over mobile data”; it downloads while the app is open and carries on where it stopped. “Remove from this phone” deletes it.',
      '- “Delete account” (the end of Settings, confirmed twice) deletes the account and everything in it; it needs the internet.',
      '- Updates come by themselves: “A new update is ready” → “Update now” or “Later”.',
    ),
  },
  {
    title: 'Mushaf, prayer times and the Qibla',
    covers: [],
    routes: ['Settings', 'PrayerCalculation', 'PrayerNotifications'],
    text: lines(
      '- Settings → Mushaf → “Mushaf”: Madani 1405 (the default) or Madani 1441. Page numbers stay the same for plans.',
      '- Home’s compass opens the Prayer sheet: Times (today’s prayers, the next with a countdown) and Qibla (a compass to the Kaaba; it needs location, which stays on the phone).',
      '- Settings → Prayer: “Prayer times”, “Prayer notifications”, “Calculation” (method and madhab), “Qibla” and “Start day at fajr”. Settings → Home screen → “Next prayer” adds a line under Home’s header.',
      '- Settings → Home screen → “Friday Al-Kahf reminder”: a card on Home on Fridays.',
    ),
  },
  {
    title: 'Settings, section by section',
    covers: ['REVO-39'],
    routes: ['Settings'],
    text: lines(
      '- Account: display name. Activity: “Activity”, “Recordings”, “Back up recordings”, “Time in app”, “Memorized pages”. Home screen: “Next prayer”, “Friday Al-Kahf reminder”. Prayer: as above.',
      '- Revision: “Smart Tracking” (rate pages, Insights), “Keep daily amount”, and on an iPhone “Speech model” (searching by voice).',
      '- Revo AI: Revo on or off, “What Revo can do” (Revo’s short introduction, which also plays before Revo is first turned on; Skip ends it), “Memory”, “Delete conversations”.',
      '- Mushaf: “Mushaf”, “Offline mushaf”, “Download over mobile data”. Notifications: “Enable notifications” (revision reminders: 8:00 AM, after Asr, and an hour before the day ends, while today isn’t done; there is no setting for their times). Appearance: “Theme” (Light or Dark) and “Accent” (Indigo, Crimson or Jade).',
      '- Support: “Share Revisely”, “Send feedback”, “Report a problem”, “Contact support”, “Help buttons”. About: “What’s new”, “Privacy Policy”, “Terms of Service”, the version.',
      '- Testing (testers only): “Reset my data”, “Load test scenario”. Then “Sign out” and “Delete account”.',
      '- Widgets: Today, Verse of the day, Qibla and Prayer times, added like any widget: on an iPhone (Home Screen and Lock Screen) and, from version 1.0.4, on Android’s home screen.',
    ),
  },
  {
    title: 'For testers',
    covers: ['RESET-2', 'RESET-3', 'ACT-29'],
    routes: ['Settings', 'Activity'],
    text: lines(
      '- Testers (TestFlight or Google Play testing, marked by the Revisely team) get Settings → Testing and updates early. A session has no eye at the top any more (the old hidden page for testers is gone).',
      '- “Reset my data” (type RESET): a backup is kept, then the account starts again as new, still signed in; not again within 10 minutes. “Load test scenario” replaces the data with a ready-made situation the same way.',
      '- Testers can arrange Activity: “Edit sections” (the icon at the end of the Overview and Insights tabs) shows, hides and reorders the tab’s sections (hold one, then drag); “Show all, in the usual order” puts it back. Kept on this phone.',
    ),
  },
  {
    title: 'Revo itself',
    covers: ['REVO-1', 'REVO-2', 'REVO-3', 'REVO-5', 'REVO-7', 'REVO-8', 'REVO-9', 'REVO-10', 'REVO-20', 'REVO-21', 'REVO-22', 'REVO-23', 'REVO-30', 'REVO-31', 'REVO-32', 'REVO-33', 'REVO-34', 'REVO-35', 'REVO-36', 'REVO-37', 'REVO-38', 'REVO-40'],
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
      '- Following the phone’s light or dark setting, choosing reminder times, translations in Bengali, Russian, Malay, Korean or Italian, tafsir, a tajweed mushaf, recitation offline, sharing progress with a teacher, exporting data, several active plans at once (one is active; others can be saved), Android widgets: not yet.',
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
    title: 'Recite and Mark mistakes',
    covers: ['RECITE-1', 'RECITE-5', 'SEARCH-4', 'PREM-1'],
    routes: ['QuranReader', 'Settings'],
    text: lines(
      '- Who has it: Revisely Dev, a tester account ("Tester: yes"), an iPhone and the Madani 1405 mushaf (Settings → Mushaf → “Mushaf”). The reader’s bar, and a revision session’s, then has an eye and a mic in place of the record button. On Android or with the 1441 print it is the usual record button. It needs the internet: the checking runs on Revisely’s server.',
      '- The mic: tap it to start a take. Hold it to choose: “Record” (“Just record your recitation”) or “Recite” (“The page follows you”), and under Recite the “Mark mistakes” switch. Recite follows them on the page; with Mark mistakes on it also marks mistakes as they recite. Mark mistakes is part of Premium, free in Revisely Dev (Settings → Testing → “Premium”: off shows it locked).',
      '- Premium early access: while Premium is in early access, every account has it free, with no end date, and keeps it for good after Premium becomes paid; new accounts get it when they’re set up. Settings → Recite → “Premium” says so, and so does a Mark mistakes take’s summary. An account without it yet gets it from “Get Premium” in Mark mistakes’ intro; “Can’t afford it? Apply for support” isn’t shown meanwhile. There are no prices yet, and it isn’t a trial: nothing is charged.',
      '- A take starts anywhere: the bar says “Listening…” until it finds where they are, and nothing shows before that. It looks on the page, then in the whole Qur’an, and turns there once sure (VoiceOver says "Started at …"). Then a grey band on the line and a grey box on the word follow them, and the page turns with them. Turning the page by hand makes it look on that page. If it never finds the place, nothing is marked and Stop just ends it; with VoiceOver, one line says so ("Couldn’t follow that take. Try starting at the top of the page.").',
      '- The bar during a take: the words being said and the time, “Pause” and “Resume” (the mic goes off and the take stays open), Stop (then “Checking…”), and ✕ to close it. A tap on the page puts the header and the bar away, leaving the page and the take’s time by the page number; a tap brings them back. With VoiceOver the bar stays.',
      '- A voice search (“Search the Quran”, the mic) that finds just one place opens the reader there with the ayah highlighted, and nothing listening; Back returns to the search with its result. A typed search, or several results, only lists them.',
      '- Settings → Recite: “Mistakes to mark”: “Words & harakat” (wrong, skipped and added words, letter and haraka slips) or “Strict” (the same, and tajweed: madd lengths, qalqalah, ghunnah, ikhfa, idgham, iqlab), where “Madd munfasil”, “Madd muttasil” and “Madd ʿarid” set the lengths. “Save recordings when you recite” keeps the audio of a take with Mark mistakes on this phone, with the take: never among the recordings.',
      '- Since mid-November 2026, “Words & harakat” and Recite listen with a newer model: it marks recitation that was right less often, especially with noise in the background, and catches word slips (a skipped, changed or added word) about as before. Small haraka or letter slips are marked a little less often, and "You continued with …" shows for fewer slips. “Strict” is unchanged.',
      '- It is AI and can make mistakes (Settings → About → “Recitation check notice”). Software checks the recitation; nobody listens. Settings → Testing → “Keep my recitations as test data” keeps takes for Revisely’s tests.',
      '- Help: the reader’s ? (top right) leads to Recite’s own sheets, “How Recite works”, “During a take”, “Your past mistakes” and “Test me and voice search”; during a take it opens “How Recite works”. A session’s ⋯ → “How a session works” leads to the same sheets but Test me’s, and during a take to “How Recite works”. A day’s ? leads to “Your past mistakes”, and Insights’ to “More in Insights” (Gaps, Last revised, Recitation).',
    ),
  },
  {
    title: 'Marks and the take’s summary',
    covers: ['RECITE-2', 'RECITE-3', 'RECITE-4', 'RECITE-7'],
    routes: ['QuranReader'],
    text: lines(
      '- Mistakes are highlights behind the word, three colours: red for a wrong, skipped or extra word (an extra word marks the word before it); amber for a haraka or letter slip, and for “Not clear”; violet for a tajweed note (“Strict” only).',
      '- “Not clear”: a haraka or letter the checker couldn’t hear clearly enough to judge. It is never a mistake and never counts in the score. Going back a few words to restart an ayah is never marked.',
      '- Tap a marked word: its card names each mark (“Wrong word”, “Skipped word”, “Extra word”, “Harakat slip”, “Letter slip”, “Not clear” or the tajweed rule), with “Expected” and what was heard. “Not a mistake” takes a mark off (Undo for a few seconds). “Hear it” plays the reciter’s ayah (it pauses a take); “Your recitation” plays their own voice at that word, until the take is closed; “Similar phrases” lists “Ayahs that read almost the same”.',
      '- After Stop, with Mark mistakes on, “Your recitation” opens: the score by the page, then each mark (tap one to see it on the page). Going on with a similar ayah gets its own row ("You continued with Luqman 31:6, a similar ayah", or "You ended ayah 5 as ayah 3 ends"); a tap opens that ayah in the reader. "1 marked not a mistake" lists marks taken off, each with “Put back”.',
      '- Its buttons: “Recite the mistakes again” (one take over just the stretch with mistakes; it stops by itself at the end and says "Before: …"), “Recite again” and “Done”.',
    ),
  },
  {
    title: 'Recite in a revision session',
    covers: ['RECITE-9'],
    routes: ['ActiveRevision', 'QuranReader'],
    text: lines(
      '- A session has the reader’s mic and eye in the bar under the page (tap the page for the controls): the same takes, marks, hidden view, cards and summary, and "Recite your 3 mistakes here" on a page with words still marked. Test me is the reader’s only.',
      '- A take never marks a page revised: the page turns with them, but only swiping off a page or the ✓ at the top marks it, as always. The session’s pages, their order, the timer and the end card stay as they are.',
      '- A place outside the session’s pages (a similar ayah they went on with, “Show on the page” for a past take) opens in the reader over the session; Back comes back to it.',
    ),
  },
  {
    title: 'Reciting with the page hidden',
    covers: ['RECITE-6'],
    routes: ['QuranReader'],
    text: lines(
      '- The eye beside the mic (“Hide the page”) covers the words, to recite from memory; the verse markers stay whole. During a take the words appear in place as they are recited.',
      '- In the bar during a take: “Show the next word” (‹) uncovers one word, “Show the whole ayah” (‹‹) uncovers the ayah, and “Show the page” uncovers everything.',
      '- Words uncovered with ‹ or ‹‹ are peeked: they stay in quiet grey on the page during the take (a word with a mistake keeps its highlight) and never count in the score. The summary says "3 words peeked" and lists them by ayah (a tap shows one on the page); “Recite the mistakes again” takes in their ayahs, offered for peeks alone too.',
      '- When they say something other than the next word, its cover turns red, the word still hidden. It is a hint, never a mark, and never counts; it goes once the word is said or they go back.',
    ),
  },
  {
    title: 'Test me',
    covers: ['RECITE-8'],
    routes: ['QuranReader'],
    text: lines(
      '- Hold the mic → “Test me” (“A random place in what you’ve memorized”), part of Premium like Mark mistakes; with nothing memorized it says “Mark what you’ve memorized first”. Then: “Everything you’ve memorized”, or one juz of it.',
      '- Five places at random. At each the page turns there, hidden but for an ayah’s first two words: go on from there (or start that ayah again) through it and up to two more ayahs; it stops by itself. The bar says "1 of 5", then how it went ("Clean", "1 wrong word", "1 word peeked", "Stopped before the end", "Not continued"), with Next. ✕ ends the test.',
      '- At the end: "4 of 5 continued cleanly", each place with how it went (a tap shows it on the page), “Test me again” (new places, the same juz) and “Done”.',
    ),
  },
  {
    title: 'Takes kept, and past mistakes on the page',
    covers: ['RMEM-1', 'RMEM-2', 'RMEM-3', 'RMEM-4', 'RMEM-5', 'RMEM-6', 'RINS-3'],
    routes: ['QuranReader', 'ActivityDay', 'ActivityAll'],
    text: lines(
      '- Every take with Mark mistakes is kept on the account as text (its marks, less those taken off with “Not a mistake”, where it ran, its score and whether the page was hidden), so it follows them to another phone. Never audio: a take’s audio stays on the phone. A take with Recite alone (following, no marks), a failed take, or one whose start was never found keeps nothing.',
      '- A word missed stays marked until it is said right in 2 takes in a row, on 2 different revision days; wrong again starts the count over. “Words & harakat” never clears a tajweed note, and “Not clear” is never remembered.',
      '- Outside a take, those words stay marked on the page in a lighter red, amber or violet (one mark a word, its strongest). Not during a take (only that take’s marks show), not on a hidden page, and not with Settings → Recite → “Show past mistakes” off. Tap one for its card: the kind, its place, how often it went wrong, what was expected, its latest takes (“Right” or what was said, page hidden, ▶ their own voice while that take’s recording is on the phone), "Say it right on 2 different days to clear it.", “Hear it” and “Similar phrases”; “See all” lists every take. “Clear now” clears the word at once, with Undo; its history stays, and a later mistake marks it again.',
      '- With Premium, holding the mic on a page that still has such words adds "Recite your 3 mistakes here" ("Recite your 1 mistake here" for one), under the stretch it covers (e.g. An-Naml, ayahs 23–26): one take from the ayah before the first such word to the last one’s ayah, tajweed notes left out. It stops by itself at the end, and its summary says what those words were last time ("Before: …").',
      '- A take’s summary says what it cleared ("2 cleared from the page") and, once the passage has two takes or more, “Your progress here” with its trend ("Up from 95.1% on Mon 2 Nov · 6 takes"). That opens “Your progress”: the latest score, a chart of every take of the passage (one that covers at least half of it), “Still to fix here” (a tap shows the word on the page) and “Your takes here”, newest first (a tap opens one on the page).',
      '- A take is never a recording, a sitting or pages revised: no "Recording saved" note follows it, and its audio is never in a day’s Read, “See all”’s recordings or Settings’ recordings (Settings’ delete-all leaves it). Its summary is its end: ⋯ → “Delete this take” (after a confirm, the take, its marks and its audio go) and "In today’s Recited". Takes saved before as plain recordings move to their take once it is on the phone; Recite alone’s old audio stays a recording.',
      '- Activity: a day keeps its takes in one “Recited” row ("3 takes"), which opens them: each with ▶ its audio (while it is on the phone), the passage, a line (time, mistakes, words cleared, page hidden) and the score; a tap shows it on the page, and “All recitations” is “See all”’s “Recitations”, with “All takes”, “With mistakes” and “Page hidden”.',
      '- “Show on the page” opens the reader at the take’s page with only that take’s marks, and a bar: ▶ its audio (while it is on the phone), its time, score and mistakes, and Done. Tap a mark for its card; “Not a mistake” there updates the kept take.',
      '- A take that went on into a similar ayah says so under it in Activity ("You went on with Yusuf 90, a similar ayah"; "You ended Al-Falaq 3 as ayah 5 ends"). Holding the take opens its menu: “Show on the page”, while Revo is on “Ask Revo about this take” (Revo opens with the take attached), and “Delete this take”.',
    ),
  },
  {
    title: 'Recitation in Insights, and Revo',
    covers: ['RINS-1', 'RINS-2'],
    routes: ['Activity', 'QuranReader'],
    text: lines(
      '- Activity → “Insights” → “Recitation” (after Weak spots), over the range chip: the score by the page and how it moved ("Up from 96.9% 3 weeks ago"), with its weeks; “Keeps slipping”, the passages with words still marked (a tap opens the reader there; “Show fewer” after “See all”); “Similar ayahs” they went on with ("Al-Baqarah 48 → 123"); a line of the words cleared and the kinds, words first, “Not clear” never counted; and “Ask”, which opens Revo on it.',
      '- With Smart Tracking on, “Rated strong, but slips” names a passage rated strong that still slips, and Weak spots say how many words Recite still marks there. Off, nothing about strength: a passage says when it was last recited.',
      '- Revo knows what their takes show: the last 4 weeks’ takes and score, mistakes by kind, words still marked and cleared, the passages that keep slipping, the similar ayahs they went on with, and the latest take. It never hears the audio, and knows only what the checker marked.',
    ),
  },
  {
    title: 'Gaps (Insights)',
    covers: ['ACT-28', 'ACT-30'],
    routes: ['Activity', 'ActivityDay', 'LastRevised', 'QuranReader'],
    text: lines(
      '- Activity → “Insights” → “Gaps”, after Consistency: the days between revisions over the Insights range, by the revision day Activity files a page revised under (a session, revised ahead, or logged as revised elsewhere; reading and memorizing don’t count). Monday then Thursday is a 3-day gap; one missed day, a 2-day gap.',
      '- The figure: days since the last revision (a tap opens that day), red from 3; from 2 weeks in words with the date, never red ("Over 3 weeks since your last revision, on 24 Oct"); “Today” once revised today. Then a strip of the range (a dot per revision day, gaps of 3+ days red with their length; a tap opens the day), the longest gap (a tap marks it on Overview’s calendar, in its month or the week it starts) and the usual rhythm ("Every 2 days"). “Days” (top right) shows exact days, kept on the phone.',
      '- "Full revision pushed back 5 days": pages their current plan brings round later than it would have (missed in a gap, or slid back by a catch-up), with when they were due and when they will come; "Full revision on schedule" when none are late.',
      '- “When did I last revise…?” (end of Gaps; the full revision line opens it longest waiting first) opens “Last revised”. Three chips: the unit (“Surahs”, “Juz”, “Hizbs”, “Pages”; the one that suits them until they pick: juz on the juz plan or 200+ pages, pages inside one surah), the sort (“Recent first”, “Longest waiting first”, “Mushaf order”; both kept) and a filter (“Revised this week”, “2 weeks or more”, “Not revised yet”; All each visit). A group opens to its pages; a page opens the reader. “Not revised yet”: memorized under 30 days ago; “Never revised”: older.',
      '- Say long lengths in weeks or months as the app does, exact days when asked; welcome them back after a long gap, never scold. Recency only, with Smart Tracking on or off.',
      '- For gap questions, or when they last revised a surah, answer from the context’s Gaps and Last revised lines, then the path once.',
    ),
  },
  {
    title: 'Not possible in Revisely Dev (yet)',
    covers: [],
    routes: [],
    text: lines(
      '- Recite on Android, with the Madani 1441 print, or offline; a teacher hearing the takes: not yet.',
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
  'ACT-27': 'timing: Activity refreshes by itself and with a pull; nothing to ask Revo about',
  'NEW-4': 'timing: what waits for the walkthrough to end; nothing for Revo to explain',
  'ONBOARD-2': 'server: the server repairs a sign-up stopped half way; nothing to do',
  'LANG-1': 'layout: the layout follows the app’s language, not the phone’s; nothing for Revo to explain',
  'SHEET-1': 'layout: one sheet at a time, so the screen under them always takes taps again; nothing for Revo to explain',
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
  dailyLog: 'today’s daily log',
  settings: 'Settings; add "section": one of activity, homeScreen, prayer, revision, revo, mushaf, notifications, appearance, testing',
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
  '- Such an answer is the answer in one sentence, then the path written once (“Home → today’s › → Jump to…”), at most two short steps: about 35 words in all. Don’t describe the steps and then list them again. It is still the one JSON object every reply is, with the steps in "text".',
  '- In such an answer say nothing about today’s pages, what is left today, weak pages or the streak unless the question is about them, and don’t suggest starting today’s revision. Its action is an openScreen to the screen the answer names, whenever that screen is in the openScreen list; otherwise no action.',
  '- Which screen: “Edit schedule”, “Create new plan” or “Daily amount” → planEditor; “Jump to…” → jumpTo; Settings → a section → settings with that section; the reader, its player bar or “Audio Options” → reader; the compass: prayer times → prayerTimes, the Qibla → qibla; the memorized pages → memorized; the daily log → dailyLog; Activity → activity; Activity’s Insights → insights. Never write that you added a shortcut or will open something: the card shows it.',
  '- When the streak, missed days or missed pages come up, say how to catch up: tap “Add to today” on Home. A streak broken by two missed days can’t come back, but those days’ pages can still be added that way (the last three days): always say so.',
  '- Never invent a feature, a button, a setting or a path. When the guide says the app can’t do something (it is under “Not possible (yet)”, or the guide says no or not yet), say so plainly (“Not yet.” or “There’s no …”), then give the closest way the guide names. When that way changes more than they asked for (the whole plan, for one juz), say so in a few words. Say “I’m not sure that’s possible in Revisely” only for something the guide doesn’t mention at all, then offer the closest thing it has.',
  '- What the guide marks as for testers is in their app only when the question says "Tester: yes". For anyone else, never offer it as if it were there: say it isn’t in their app yet, then give the closest way that is.',
  '',
  '<guide>',
  REVO_GUIDE,
  '</guide>',
].join('\n');
