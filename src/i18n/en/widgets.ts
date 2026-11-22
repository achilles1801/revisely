// lib/widgets: the words the Home Screen and Lock Screen widgets show (iOS targets/widget, Android
// modules/android-widgets). The app writes them into the widgets' snapshot in its own language, so the widgets read
// the app's words rather than keep their own; the widgets' built-in English is the same text, for a snapshot from
// before this.
export const widgets = {
  /** The widget gallery's names and descriptions. */
  gallery: {
    todayName: 'Today',
    todayDescription: 'Today’s revision, whether it’s done, and your streak.',
    verseName: 'Verse of the day',
    verseDescription: 'A short verse each day, in Arabic.',
    qiblaName: 'Qibla',
    qiblaDescription: 'The Qibla’s direction from true north, from where you last opened Revisely.',
    prayerName: 'Prayer times',
    prayerDescription: 'The next prayer and today’s times.',
  },
  today: 'Today',
  revised: 'Revised',
  revisedToday: 'Revised today',
  doneForToday: 'Done for today',
  todayDone: 'Today’s revision is done',
  /** The medium widget once today is done: "Tomorrow · Al-Mujadila to At-Tahrim". */
  tomorrow: 'Tomorrow · {{title}}',
  continue: 'Continue',
  start: 'Start',
  /** Under the number of pages left, on the Lock Screen's circle. */
  left: 'left',
  openRevisely: 'Open Revisely',
  openToSeeToday: 'Open Revisely to see today’s revision.',
  openToSetUp: 'Open Revisely to set up your plan.',
  verseOfTheDay: 'Verse of the day',
  prayer: 'Prayer',
  prayerTimes: 'Prayer times',
  openToSeePrayer: 'Open Revisely to see prayer times.',
  prayerTimesOpen: 'Prayer times: open Revisely',
  /** A live countdown; the widget puts the system's own "1 hr, 12 min" where {{time}} is. */
  countdown: 'in {{time}}',
  /** VoiceOver: "Next prayer: Asr at 2:21 PM" (the widget puts the time in). */
  nextPrayerAt: 'Next prayer: {{name}} at {{time}}',
  /** "Qibla 58° NE". */
  qibla: 'Qibla {{label}}',
  /** "10,306 km to Makkah". */
  toMakkah: '{{distance}} to Makkah',
  qiblaLabel: 'Qibla {{label}}, {{distance}} to Makkah',
  qiblaOpen: 'Open Revisely to set your location.',
  qiblaOpenLabel: 'Qibla: open Revisely to set your location',
  /** North on the dial. */
  north: 'N',
  /** The Qibla's bearing and compass point: "58° NE". */
  bearing: '{{degrees}}° {{point}}',
  points: { n: 'N', ne: 'NE', e: 'E', se: 'SE', s: 'S', sw: 'SW', w: 'W', nw: 'NW' },
  /** The gallery's example: pages 582–586 as the app names them (no-break hyphens). */
  sampleTitle: 'An‑Naba to At‑Takwir',
  /** A day's pieces: "5 pages left", "5 pages revised", "3 left · 2 done", "2 of 5 done", "7-day streak". */
  pagesLeft: '{{pages}} left',
  pagesLeftToday: '{{pages}} left today',
  pagesRevised: '{{pages}} revised',
  leftCount: '{{n}} left',
  leftAndDone: '{{left}} left · {{done}} done',
  doneOf: '{{done}} of {{total}} done',
  streak: '{{n}}-day streak',
  /** The circle's streak under the check: "7d". */
  streakShort_one: '{{count}}d',
  streakShort_other: '{{count}}d',
} as const;
