// lib/reminders: the revision reminders' words. {{place}} is a surah ("Al-Mulk") or a juz ("Juz 12").
// They're scheduled on the phone with their text, so a language change reaches them when they're
// scheduled again.
export const reminders = {
  todaysRevision: "Today's revision",
  goodMorning: 'Good morning',
  goodMorningName: 'Good morning, {{name}}',
  /** Pages from the surahs: "Today's revision: Al-Mulk to Al-Qalam." */
  todayIs: "Today's revision: {{range}}.",
  rangeOnly: '{{range}}.',
  startsWith: 'Today starts with {{place}}.',
  juzWhenReady: "Today's revision is Juz {{juz}}, whenever you're ready.",
  pickUpWith: "You've made a good start. Pick up with {{place}}.",
  pickUpNearEnd: "You've made a good start. Pick up near the end of {{place}}.",
  pickUpIn: "You've made a good start. Pick up in {{place}}.",
  startingWith: 'Starting with {{place}}',
  calmMinutes: "A few calm minutes for today's revision?",
  isNext: '{{place}} is next',
  mostDone: 'Most of today is done. A few calm minutes before your next task?',
  goodStart: 'A good start already. Perfect time for a little more.',
  backTo: 'Back to {{place}}',
  nearEnd: "You're near the end of it. Perfect time for a page or two.",
  hourUntilFajr: 'An hour until Fajr',
  overnight: "If you're up, {{place}} is where you left off. What's left can be added to tomorrow.",
  hourLeft: 'An hour left today',
  justLeft: "Just {{place}} left. You're nearly there.",
  evenAPage: 'Even a page or two of {{place}} counts.',
  stillOpen: '{{place}} is still open. A few calm minutes would do it.',
  almostDone: 'Almost done with {{place}}. A few calm minutes would do it.',
  /**
   * The one reminder of a day after tomorrow, for someone who hasn't opened the app since (REMIND-2). Four
   * wordings in turn, each naming where that day's revision is; never "missed", "behind" or a streak.
   */
  away: {
    /** "Al-Mulk today" / "Juz 29 today". */
    placeToday: '{{place}} today',
    keepClose: 'A few calm minutes are enough to keep it close.',
    ready: 'Your revision is ready',
    /** "Al-Mulk to Al-Qalam, whenever you have a few minutes." */
    whenever: '{{range}}, whenever you have a few minutes.',
    juzWhenever: 'Juz {{juz}}, whenever you have a few minutes.',
  },
  done: {
    juz: '{{today}} is done',
    tomorrowJuz: "That's today's revision. Tomorrow is {{tomorrow}}.",
    thatsToday: "That's today's revision.",
    title: "Today's revision is done",
    allRevised: '{{range}}, all revised. MashaAllah.',
    forToday: 'Done for today',
    tomorrowStarts: 'Tomorrow starts with {{place}}. Rest well.',
    restWell: 'Rest well.',
    streak: '{{days}} days in a row',
    alhamdulillah: "Today's revision is done. Alhamdulillah.",
  },
  /** Android's notification channels (lib/notifications). */
  channels: {
    reminders: 'Reminders',
    remindersSub: 'Your revision reminders and the reading timer.',
    remindersSilent: 'Reminders (silent)',
    remindersSilentSub: 'Revision reminders set to go quietly: overnight, and the congratulation.',
    prayer: 'Prayer times',
    prayerSub: 'A prayer’s time, or a reminder before it, with the standard tone.',
    prayerSilent: 'Prayer times (silent)',
    prayerSilentSub: 'Prayer notifications set to Silent.',
    recitation: 'Recitation',
    recitationSub: 'Play and pause a recitation from the notification and the lock screen.',
  },
  review: {
    title: 'Time to review',
    body: 'Juz {{juz}} is due for review',
  },
} as const;
