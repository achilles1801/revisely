/**
 * How Revisely works, for Revo: the source of truth it answers "how", "where" and "why" questions
 * from (the cached part of its system prompt, prompt.ts). Plain and compact, written for a model.
 *
 * Keep it true (guide.test.ts):
 * - every rule id in BEHAVIOUR.md is in a section's `covers`, or in GUIDE_INTERNAL with a reason;
 * - every route in a section's `routes` is a screen in src/navigation/MainNavigator.tsx;
 * - every label in curly quotes (“Edit schedule”) is text the app shows, word for word (src/).
 * Change it in the same PR as the feature. Verified against the code on Nov 7 2026.
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
      '- The tab bar has Home and Read (swipe sideways between them). Testers have no Insights tab: Insights is in Activity.',
      '- Home’s top bar, on the right: a compass (the Prayer sheet: prayer times and the Qibla), a pulse icon (Activity) and a gear (Settings). A running timer shows on the left.',
      '- Home’s Today post: where today starts (e.g. "Starts at Al-Mujadila ›", or "Starts at Al-Hadid, ayah 4 ›" mid-surah) and how much it is. Tapping that line (its ›) opens a menu with “Jump to…” and “Edit schedule”. Under it, one button: “Start revision”, “Continue revision” or “Review session”. Then "… of the Quran memorized ›" with a dot per juz; its › opens the memorized pages. Then “Recent sessions” (the last three) and “See all”.',
      '- Read tab: “Recent pages”, then every surah, grouped by juz. Tap one to open the reader.',
      '- The app names parts of the Qur’an by surah and juz, never by page numbers: "Starts at Al-Hadid, ayah 4", "Al-Baqarah 84–101", "Juz 28". Page numbers show only as a quiet detail after the words (the header of today’s › menu), inside the reader and the session (the printed page), and where pages are chosen by number (the Page tab of “Jump to…”).',
      '- Revo: the round button at the bottom right of Home and of Activity (Overview, Insights, a day, See all, Pages by strength). There is no Revo on the Read tab (its list or the reader) or in a revision session, and their help has no “Ask Revo”.',
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
      '- The plan goes round the memorized pages in a cycle, a set amount each revision day, then starts again. Each memorized page comes round once a cycle. Only memorized pages are scheduled.',
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
      '- Yesterday missed (not all its pages revised) with the days before it complete: the streak shows dimmed, with a ring for yesterday’s missed pages. Revising yesterday’s missed pages before today ends brings it back at once. Only yesterday’s pages count for this, not today’s. How: Home’s "Missed yesterday · …" or "Left yesterday · …" line → “Add to today” → revise them (they come first in today’s session and are credited to yesterday).',
      '- Today still needs its own pages: pages carried in from another day never count toward today.',
      '- This grace works any day a single day is missed. Two missed days in a row break the streak, and revising an older day later doesn’t bring it back. The missed pages of the last three days are still offered on Home (“Add to today”), so nothing is lost, and finishing today starts a new streak.',
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
    covers: ['AHEAD-1', 'AHEAD-2', 'AHEAD-3', 'AHEAD-4', 'AHEAD-5'],
    routes: ['ActiveRevision'],
    text: lines(
      '- Once today is done, Home shows a line like "Tomorrow starts at Al-Mulk"; tapping it opens the next day’s pages alone.',
      '- On the end card, “Keep going” goes on to the next revision day’s pages not done yet, then the day after, up to the end of the cycle. A day already done ahead is passed over.',
      '- A page revised ahead counts for the day it is planned on: that day then needs only the pages left, and is done when none are. Only pages actually revised (swiped or checked) count.',
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
    title: 'Memorizing by the ayah (testers)',
    covers: ['MEM-1', 'MEM-2', 'MEM-3', 'MEM-4', 'MEM-5', 'MEM-6', 'REC-1', 'REC-2'],
    routes: ['ActivityDay', 'QuranReader', 'PlanEdit'],
    text: lines(
      '- What is memorized is kept by the ayah. A page is memorized when every ayah on it is; a page with some of them is partly memorized (a thin bar in the memorized pages). Adding a page’s last ayah makes it memorized.',
      '- The % memorized and the juz dots count a partly memorized page by the share of the page its memorized ayahs fill (their length, not how many). A partly memorized page is revised like a memorized one, and Home names it by its ayahs (with only An-Nas memorized on the last page, "Starts at An-Nas").',
      '- Add ayahs: Activity → + → “Memorized” → “Ayahs” (From and To), “Whole pages” or “Surah”; “From your reading” offers what was read today. Deleting a Memorized entry takes off only its ayahs.',
      '- A sitting in the reader: start the timer there (and the mic, to record), recite, then end the timer. Ending it also stops the recording; one note says what was saved, e.g. "Saved to today: Al-Mulk, ayahs 1–26, 41 min", with “View”. Stopping only the recording leaves the timer running.',
      '- On that day in Activity the sitting is under Read, named by the pages it held (e.g. "Al-Mulk, ayahs 1–26"; “Timed in Read” when none are known). If they aren’t all memorized it offers “Add to memorized”: the Memorized sheet opens on Ayahs, inside the sitting’s pages. Afterwards it stands under Memorized and says what finishes the page (e.g. "Al-Mulk 21–26 finishes the page"); Undo puts everything back.',
      '- Memorized today, the block says when the pages first come up in the plan, with “Revise them tomorrow” and “Edit schedule”. A custom plan never adds new pages by itself: “Not in your custom plan yet” with “Add to your plan”, and in “Edit schedule” the list “Not in your plan” with “With tomorrow’s pages” or “As a day of its own, tomorrow” (then Save).',
    ),
  },
  {
    title: 'Activity and the daily log',
    covers: ['DAY-9', 'ACT-1', 'ACT-2', 'ACT-3', 'ACT-5', 'ACT-6', 'ACT-7', 'ACT-11', 'ACT-14', 'ACT-17', 'ACT-18', 'ACT-20', 'LOG-1', 'LOG-2', 'LOG-3', 'LOG-4'],
    routes: ['Activity', 'ActivityDay', 'ActivityAll', 'JournalEntry', 'ListenBack', 'QuranReader'],
    text: lines(
      '- Activity (Home’s pulse icon, or Settings → Activity → “Activity”): everything done, day by day, on the revision day it was done: sessions, pages revised ahead (listed on the day they were revised), timed readings and sittings, recordings, memorized ayahs and notes.',
      '- Testers: two tabs at the top, “Overview” and “Insights”. Overview is a calendar: the chip beside its title (“Month” or “Week”, with ⌄) switches between the two, and the choice is kept on the phone. ‹ › step back and on; “Today” appears when another month or week is showing and brings today back. Each day has a ring for how much of its pages was revised, and dots for memorized, read and a note.',
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
    covers: ['ACT-4', 'ACT-8', 'ACT-12', 'ACT-16', 'ACT-19', 'ACT-21', 'ACT-22', 'ACT-23', 'ACT-24'],
    routes: ['Activity', 'ActivityDay', 'PagesByStrength', 'QuranReader'],
    text: lines(
      '- Testers: Activity → “Insights”. One range for the whole tab, from the chip at the end of the Overview | Insights row ("30 days ⌄" at first): “7 days”, “30 days”, “3 months” or “All time” (since the account’s first day). It is kept on the phone; a range longer than the account counts from its first day.',
      '- “Coverage”: a tile per juz (“This week”, “This month”, “30+ days”, “Not memorized”) and the share of memorized pages revised in the range. Tap the figure for what wasn’t revised (e.g. "Not revised in 30 days"), a row per juz or run of pages. The "Juz 4, untouched the longest" row: tap it for that juz; “Plan it” puts it first tomorrow, for that day only, on every plan; on a custom plan, “Add to plan” under “First tomorrow” then opens tomorrow’s day of the plan with those pages added, kept every cycle once the plan is saved.',
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
    covers: ['AUDIO-1', 'AUDIO-2', 'TRANS-1', 'TRANS-2', 'TRANS-3', 'TRANS-4', 'TRANS-5', 'TRANS-6', 'TRANS-7', 'TRANS-8'],
    routes: ['ReadIndex', 'QuranReader'],
    text: lines(
      '- Read tab → a surah, or “Recent pages” → the reader. Tap the page for the controls; swipe to turn pages; the bar at the bottom moves through the mushaf.',
      '- Hold a verse: “Play”, “Translation”, “Copy”, “Share”. “Translation” shows the verse in Arabic and in the chosen translation, exactly as its publisher gives it, with its footnotes and its credit (who translated it, the version and where it comes from) under it; ‹ › move between verses.',
      '- Changing the translation: in the translation sheet, ⋯ at the top right → “Select translation”. Everyone has Saheeh International (offline once downloaded with the offline mushaf) and The Clear Quran (needs the internet, unless read before). Testers can choose from 76 translations in 56 languages, among them Urdu, Indonesian, Turkish, French, Spanish, German, Persian, Hindi, Chinese, Hausa, Swahili and Portuguese: the list shows “Selected”, “Favorites”, “Downloaded”, then every language; search a language, in English or its own name, or a translator. Urdu, Persian, Kurdish, Pashto and Uyghur read right to left. A translation is kept on the phone once read, and stays at its latest version.',
      '- Testers, favorites and offline translations: the star on a translation adds it to “Favorites” (kept on this phone); “Edit” moves favorites up or down, takes a star away, and deletes downloads. Each translation shows its size; its download button downloads it whole (it can be stopped, and carries on later), the bin removes it, and downloaded ones are listed under “Downloaded” and read offline. Offline, a translation that isn’t downloaded says so and offers one of that surah that is on the phone (the same language first, then Saheeh International). Saheeh International downloads with the offline mushaf.',
      '- The player bar: ▶ plays from this page; the reciter’s name picks the reciter; the options icon opens “Audio Options”: “Reciter”, “Playback speed” (0.25× to 2×), “From” and “To” (surah and ayah), “Play up to” (Page, Surah, Juz’ or Custom), “Repeat” (loop, or 1 to 10 times) and “Pause after each verse”. While playing: stop, speed, previous and next verse, pause.',
      '- Reciters: Al-Husary, Al-Minshawi, Abdul Basit, Alafasy, As-Sudais, Ash-Shuraim, Al-Muaiqly, Al-Ghamdi, Al-Ajamy, Ash-Shatri, Al-Hudhaify, Muhammad Ayyub, Al-Tablawi, Ad-Dossari. The reciter follows the account; speed, repeat, pause and Play up to are kept on the phone.',
      '- Recitation goes on after leaving the reader (a mini player above the tab bar: pause, ✕ to stop, › back to the reader), in the background and with the phone locked. It streams, so it needs the internet.',
    ),
  },
  {
    title: 'Searching the Qur’an (testers)',
    covers: ['SEARCH-1', 'SEARCH-2'],
    routes: ['ReadIndex', 'QuranSearch', 'QuranReader'],
    text: lines(
      '- Testers: the Read tab has “Search the Quran” under its title and, on an iPhone, a mic beside it. Recite a few words of an ayah, or type them in Arabic, and the ayat that hold them are listed: from the middle of an ayah too, even with a word misheard; a phrase in several ayat lists every one. Typing a surah (Yunus, or its Arabic name), an ayah (2:255, Yunus 16), a page (page 62) or a juz (juz 30) goes there. A result opens the reader at the ayah, highlighted.',
      '- Searching by voice needs the speech model, offered the first time (a one-time download); it listens on the phone, and the voice isn’t recorded or sent. On Android, typing only. For anyone else it isn’t in the app yet: the closest is the Read tab’s list of surahs, or “Jump to…” to start today there.',
    ),
  },
  {
    title: 'Recording, listening back and the timer',
    covers: ['AUDIO-4'],
    routes: ['ListenBack', 'ActivityDay'],
    text: lines(
      '- In the reader or a session, the mic records the recitation; pause or stop it there. A recording is saved under its day in Activity.',
      '- “Listen back” (on the end card, or a recording in Activity) plays it over the pages it was recorded on.',
      '- Settings → Activity → “Back up recordings” keeps a copy in the account (Wi-Fi only unless “Back up over mobile data”). Recordings on a phone are deleted only when the user deletes them there.',
      '- The timer is in the reader’s and the session’s bottom bar: a stopwatch, or a timer of a set length (tap the time to type minutes). Pause, end (saved as a timed reading in Activity) or discard. A running timer shows in Home’s top bar.',
    ),
  },
  {
    title: 'Offline and other phones',
    covers: ['SYNC-1', 'SYNC-2', 'SYNC-3', 'SYNC-5', 'ACCOUNT-1'],
    routes: ['Settings'],
    text: lines(
      '- Everything works offline from the copy on the phone: changes are saved on the phone and sent in order once back online, and Home shows “Offline”. Pages not downloaded or opened before need the internet, so download the offline mushaf (below) to read and revise anywhere. Another phone signed in to the account sees changes once sent. The same day revised on two phones offline keeps every page.',
      '- The first setup on a phone needs the internet, and so do Revo, recitation, The Clear Quran (unless read before) and a day of the daily log not opened before.',
      '- Offline mushaf: Settings → Mushaf → “Offline mushaf” → “Download now”: every page, the Arabic text and Saheeh International (up to about 250 MB). Wi-Fi only unless “Download over mobile data”; it downloads while the app is open and carries on where it stopped. “Remove from this phone” deletes it.',
      '- “Delete account” (the end of Settings, confirmed twice) deletes the account and everything in it; it needs the internet.',
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
    covers: [],
    routes: ['Settings'],
    text: lines(
      '- Account: display name. Activity: “Activity”, “Recordings”, “Back up recordings”, “Time in app”, “Memorized pages”. Home screen: “Next prayer”, “Friday Al-Kahf reminder”. Prayer: as above.',
      '- Revision: “Smart Tracking” (rate pages, Insights), “Keep daily amount”, and for testers on an iPhone “Speech model”.',
      '- Revo AI: Revo on or off, “Memory”, “Delete conversations”.',
      '- Mushaf: “Mushaf”, “Offline mushaf”, “Download over mobile data”. Notifications: “Enable notifications” (revision reminders: 8:00 AM, after Asr, and an hour before the day ends, while today isn’t done; there is no setting for their times). Appearance: “Theme” (Light or Dark) and “Accent” (Indigo, Crimson or Jade).',
      '- Support: “Share Revisely”, “Send feedback”, “Report a problem”, “Contact support”. About: “Privacy Policy”, “Terms of Service”, the version.',
      '- Testing (testers only): “Reset my data”, “Load test scenario”. Then “Sign out” and “Delete account”.',
      '- iPhone widgets (Home Screen and Lock Screen): Today, Verse of the day, Qibla and Prayer times, added like any widget. Android has none yet.',
    ),
  },
  {
    title: 'For testers',
    covers: ['RESET-2', 'RESET-3'],
    routes: ['Settings'],
    text: lines(
      '- Testers (TestFlight or Google Play testing, marked by the Revisely team) get Activity’s Overview, Insights and + menu, Settings → Testing, the hidden page in sessions (the eye button at the top, with the Madani 1405 mushaf: recite from memory; following the recitation word by word needs “Speech model” on an iPhone), and updates early.',
      '- “Reset my data” (type RESET): a backup is kept, then the account starts again as new, still signed in; not again within 10 minutes. “Load test scenario” replaces the data with a ready-made situation the same way.',
      '- Updates come by themselves: “A new update is ready” → “Update now” or “Later”.',
    ),
  },
  {
    title: 'Revo itself',
    covers: ['REVO-1', 'REVO-2', 'REVO-3', 'REVO-5', 'REVO-7', 'REVO-8', 'REVO-9', 'REVO-10', 'REVO-20', 'REVO-21', 'REVO-22', 'REVO-23', 'REVO-30', 'REVO-31', 'REVO-32', 'REVO-33', 'REVO-34', 'REVO-35', 'REVO-36', 'REVO-37', 'REVO-38'],
    routes: ['Settings', 'ActivityDay', 'PagesByStrength'],
    text: lines(
      '- Its first line is about where it was opened: from a day in Activity, that day (and the day goes with the question; × takes it off); from Overview, the month so far; from Insights, what stands out; from Weak spots or Pages by strength, the weak pages; from a juz’s “Ask”, that juz (it goes with the question too). From Home, today.',
      '- Off until turned on (its first open, or Settings → Revo AI). Each question sends the numbers the app shows (today, the week, the streak, pages and ratings); 20 new questions a revision day, back after Fajr or at midnight. The same first question again that day is free.',
      '- + opens “Add to chat”: search a surah, a juz, ayahs, a day or a page, or pick from Surahs, Juz, Days (a month: tap a day, then “Add day”) and Pages; up to six go with one question, and a day goes with its daily-log notes. Revo answers about them from their figures (how often revised, what was missed, weak spots, what’s next; a day’s plan, minutes and notes). History keeps the conversations; Memory keeps up to 30 short facts (delete one, clear them, or turn memory off). A Day in review comes once, from the evening, on a day something was done.',
      '- Revo can’t change anything itself: a suggestion happens only when tapped (“Add to my plan” puts pages first in tomorrow’s session; a card can also open a screen, such as Jump to… or a Settings section). It answers how-to questions from this guide. It needs the internet.',
      '- Its charts answer a touch: tap a bar, dot, tile or row (or slide along the bars) to see that day or passage, then “Open in Activity”, “Open in the reader” or “Revise first tomorrow” (only when tapped). A second tap or × puts it back; a table sorts by the heading tapped. The grey bar behind a day is its plan.',
      '- With Smart Tracking off (Settings → Revision), Revo and its charts say nothing about ratings or strength: they show when each part was last revised and how often.',
      '- Settings → Revo AI → off deletes its conversations and memory.',
    ),
  },
  {
    title: 'Not possible (yet), and the closest way',
    covers: [],
    routes: [],
    text: lines(
      '- Revising one juz backwards while the rest goes forward: there’s no such option, because “Reverse order” turns the whole plan backwards, not one juz. Closest: “Create new plan” → “Balanced” → “Reverse order” on → “Today starts at” → that juz → Apply → Save: today starts at the juz’s end and goes back page by page, and the days after carry on backwards into the juz before it. (“By Juz” with “Reverse order” puts the juz in reverse order, each juz’s pages in their usual order.)',
      '- A plan of whole surahs made for you: there is no surah mode (only pages, juz, or weakest). Closest: in “Edit schedule”, tap a day → “Add or remove content” → Surahs; or “Jump to…” → Surah.',
      '- Revising a passage as a session without touching the plan: no. Closest: “Jump to…” (moves today’s start), or read it in the reader with the timer, and (testers) log it with Activity → + → “Revised”.',
      '- Pausing the plan for a holiday: there’s no pause, and missed days don’t pile up: the plan follows the calendar, and their pages are offered for three days. Back from the trip, “Jump to…” picks up where you stopped. (Rest days come round every cycle, so they aren’t a pause.)',
      '- Getting a streak back after two missed days, catching up days older than three, or moving a session to another day: no.',
      '- Following the phone’s light or dark setting, choosing reminder times, translations in Bengali, Russian, Malay, Korean or Italian, tafsir, a tajweed mushaf, recitation offline, sharing progress with a teacher, exporting data, several active plans at once (one is active; others can be saved), Android widgets: not yet.',
    ),
  },
];

/** Rules with nothing for a user to ask Revo about, on purpose, and why. */
export const GUIDE_INTERNAL: Readonly<Record<string, string>> = {
  'HELP-1': 'the help buttons (testers); the guide gets them with its next re-record',
  'HELP-2': 'hiding the help buttons (testers); the guide gets it with its next re-record',
  'HELP-3': 'the help follows Smart Tracking (testers); the guide gets it with its next re-record',
  'ACT-25': 'Coverage’s “Not revised yet” (a fresh page is never 30+ days); the guide gets it with its next re-record',
  'ACT-26': 'Coverage’s Juz, Surah and Page views and the fill by share; the guide gets them with its next re-record',
  'AHEAD-6': 'pages revised ahead are revised that day for Coverage and recency (Revo’s facts already read them so); the guide gets it with its next re-record',
  'ACT-27': 'Activity refreshes by itself and with a pull; nothing to ask Revo about',
  'HELP-4': 'the help buttons are on by default (testers); the guide gets it with its next re-record',
  'NEW-1': 'the What\'s new walkthrough ships switched off; the guide gets it, with Settings → About → What\'s new, at the release\'s re-record',
  'NEW-2': 'the walkthrough itself; the guide gets it at the release\'s re-record',
  'NEW-3': 'the replay in Settings; the guide gets it at the release\'s re-record',
  'NEW-4': 'what waits for the walkthrough; nothing for Revo to explain',
  'REVO-39': 'Revo\'s moment before its opt-in, and Settings → Revo AI → What Revo can do (testers); the guide gets them at the release\'s re-record',
  'ONBOARD-2': 'the server repairs a sign-up stopped half way; nothing to do',
  'SYNC-4': 'a new account loads with no relaunch; nothing to do',
  'ACCOUNT-2': 'the sign-in screen keeps what was typed after a failed attempt; Revo is for signed-in users',
  'ACCOUNT-3': 'how long Delete account waits for the server; the app says what happened itself',
  'RESET-1': 'the owner’s reset script',
  'ACT-9': 'when a day’s items load',
  'ACT-13': 'an add from the day’s + shows there at once, offline too; nothing to ask (the + itself is in Activity’s section)',
  'COACH-1': 'the Ask coach’s limits (Revo supersedes it)',
  'COACH-2': 'what the Ask coach is sent',
  'COACH-3': 'the Ask coach’s model and key',
  'COACH-4': 'the Ask coach’s opt-in (Revo supersedes it)',
  'COACH-5': 'the Ask coach’s sheet',
  'REVO-4': 'the monthly cost cap',
  'REVO-6': 'Revo’s model, key and logs',
  'REVO-24': 'the sheet’s layout with the keyboard',
  'REVO-26': 'how Revo’s context is built',
  'REVO-27': 'how Revo words its answers (its tone, in the prompt)',
  // Not in the guide's sections yet: their words would change Revo's system prompt, so they come with the
  // next recording of Revo's replies (functions/scripts/record-anthropic.js).
  'REC-3': 'a sitting’s Add to revised on the Day (testers; Memorizing by the ayah’s section, next recording)',
  'MEM-7': 'the juz sheet’s look for a juz being learned (testers; Memorizing by the ayah’s section, next recording)',
};

/** The guide as Revo reads it. */
export const REVO_GUIDE = GUIDE_SECTIONS.map((s) => `### ${s.title}\n${s.text}`).join('\n\n');

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
