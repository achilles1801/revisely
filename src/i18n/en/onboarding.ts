// screens/onboarding: welcome, the journey, memorized pages and the schedule.
export const onboarding = {
  welcome: {
    /** "Your Quran, remembered." with "remembered" in the accent, on a new line. */
    title: 'Your Quran,',
    accent: 'remembered',
    body: "A personal revision companion. Track what you've memorized, review at the right moment, and never lose a page.",
    begin: 'Begin',
  },
  journey: {
    title: 'Where are you in your journey?',
    inProgress: 'In Progress',
    inProgressDetail: 'I’ve memorized part of the Quran',
    complete: 'Complete',
    completeDetail: 'I’ve memorized the whole Quran',
  },
  continue: 'Continue',
  juz: {
    title: 'Select memorized portions',
    allMarked: 'All marked as memorized — adjust if needed.',
    mark: 'Mark your completed surahs and juz.',
    /** After the count, which is shown in the accent: "312 of 604 pages memorized". */
    ofPages: ' of 604 pages memorized',
    loading: 'Loading your pages…',
  },
  schedule: {
    noLocationTitle: 'Location not available',
    noLocationBody: "Without location we can't compute fajr. Defaulting to midnight — switch in Settings once you grant location.",
    titleMaintain: 'Set your maintenance schedule',
    title: 'Set your rhythm',
    cycle_one: 'Full revision cycle: ~{{count}} day',
    cycle_other: 'Full revision cycle: ~{{count}} days',
    changeLater: 'You can change any of these later in Settings.',
    howMuch: 'How much per day?',
    pages: 'Pages',
    /** The unit under the amount: "pages", "juz" (one), "ajzaʼ" (more). */
    unitPages: 'pages',
    unitJuz_one: 'juz',
    unitJuz_other: 'ajzaʼ',
    perDay: '{{amount}} {{unit}} a day',
    pagesADay: 'Pages a day',
    juzADay: 'Juz a day',
    reset: 'When does your day reset?',
    atFajr: 'At fajr',
    atMidnight: 'At midnight',
    locationNote: "We'll ask for your location to compute fajr accurately.",
    reminders: 'Daily reminders',
    remindersDetail: 'Get a nudge each day so revision stays consistent.',
    settingUp: 'Setting up…',
    start: 'Start',
  },
} as const;
