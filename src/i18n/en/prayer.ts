// lib/prayer and components/prayer: prayer times, their notifications and the Prayer sheet.
export const prayer = {
  /** The six times; the Arabic names beside them are content (lib/prayer/times TIME_LABELS). */
  names: { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' },
  methods: {
    MuslimWorldLeague: { label: 'Muslim World League', short: 'MWL' },
    Egyptian: { label: 'Egyptian', short: 'Egyptian' },
    Karachi: { label: 'Karachi', short: 'Karachi' },
    UmmAlQura: { label: 'Umm al-Qura (Makkah)', short: 'Umm al-Qura' },
    Dubai: { label: 'Dubai', short: 'Dubai' },
    MoonsightingCommittee: { label: 'Moonsighting Committee', short: 'Moonsighting' },
    NorthAmerica: { label: 'ISNA (North America)', short: 'ISNA' },
    Kuwait: { label: 'Kuwait', short: 'Kuwait' },
    Qatar: { label: 'Qatar', short: 'Qatar' },
    Singapore: { label: 'Singapore', short: 'Singapore' },
    Turkey: { label: 'Turkey', short: 'Turkey' },
    Tehran: { label: 'Tehran', short: 'Tehran' },
  },
  highLatitude: {
    recommended: 'Recommended',
    recommendedDetail: 'Middle of the night below 48°, a seventh of it above',
    middleofthenight: 'Middle of the night',
    seventhofthenight: 'Seventh of the night',
    twilightangle: 'Twilight angle',
  },
  /** Umm al-Qura months, for "17 Jumada al-Ula 1448". */
  hijri: {
    m1: 'Muharram',
    m2: 'Safar',
    m3: 'Rabi al-Awwal',
    m4: 'Rabi al-Thani',
    m5: 'Jumada al-Ula',
    m6: 'Jumada al-Akhirah',
    m7: 'Rajab',
    m8: "Sha'ban",
    m9: 'Ramadan',
    m10: 'Shawwal',
    m11: "Dhu al-Qa'dah",
    m12: 'Dhu al-Hijjah',
  },
  /** How long until a time: "in 12m", "in 2h", "in 1h 12m". */
  countdown: { now: 'now', minutes: 'in {{m}}m', hours: 'in {{h}}h', hoursMinutes: 'in {{h}}h {{m}}m' },
  keepGoing: { title: 'Prayer notifications', body: 'Open Revisely to keep your prayer notifications going.' },
  standardTone: 'Standard tone',
  next: {
    /** "Next prayer: Asr at 3:42 PM, in 1h 12m". */
    label: 'Next prayer: {{name}} at {{time}}, {{left}}',
    hint: 'Opens prayer times',
  },
  sheet: {
    title: 'Prayer',
    times: 'Times',
    qibla: 'Qibla',
    now: 'Now',
    calculation: 'Calculation',
    hanafi: 'Hanafi',
    standard: 'Standard',
    /** VoiceOver's name for a time's bell: "Fajr notification". */
    bell: '{{name}} notification',
    /** VoiceOver's name for a prayer's row, which opens its reminder and sound. */
    soundLabel: '{{name}}: reminder and sound',
    permission: {
      title: 'Allow location for prayer times',
      body: 'Revisely works out the times for where you are. Your location stays on this phone.',
      allow: 'Allow location',
    },
    denied: { title: 'Location is off for Revisely', body: 'Turn it on in Settings to see prayer times.' },
    noLocation: { title: "Couldn't find where you are", body: 'Check that Location Services is on, then try again.' },
    locating: 'Finding where you are…',
  },
  calculation: {
    title: 'Calculation',
    location: 'Location',
    yourLocation: 'Your location',
    notSet: 'Not set',
    onPhoneOnly: 'On this phone only',
    update: 'Update',
    method: 'Method',
    methodFooter: 'Also used for “Start day at fajr”.',
    highLatitudes: 'High latitudes',
    highLatitudesHelp: 'How Fajr and Isha are found where twilight lasts all night in summer.',
    asrTime: 'Asr time',
    asrFooter: 'Standard is Shafiʿi, Mālikī and Ḥanbalī. Hanafi puts Asr later.',
    /** With today's Hanafi Asr: "… Hanafi puts Asr later (4:12 PM today)." */
    asrFooterToday: 'Standard is Shafiʿi, Mālikī and Ḥanbalī. Hanafi puts Asr later ({{time}} today).',
    adjustments: 'Adjustments',
    adjustmentsFooter: 'Minutes added to or taken from each time, to match your mosque.',
    /** An adjustment: "0 min", "+5 min", "−3 min" (the sign is part of the value). */
    adjustValue: '{{value}} min',
    /** VoiceOver's name for an adjustment's stepper: "minutes for Fajr". */
    adjustLabel: 'minutes for {{name}}',
  },
  notifications: {
    title: 'Prayer notifications',
    /** The notification at the time: "It’s time for Asr · 3:42 PM". */
    atBody: 'It’s time for {{name}} · {{time}}',
    /** The notification before it (5 minutes or more): "Asr in 10 minutes". */
    soonTitle_one: '{{name}} in {{count}} minute',
    soonTitle_other: '{{name}} in {{count}} minutes',
    prayers: 'Prayers',
    scheduled_one: 'Scheduled on this phone for the next {{count}} day. Opening Revisely keeps them going.',
    scheduled_other: 'Scheduled on this phone for the next {{count}} days. Opening Revisely keeps them going.',
    off: 'Off',
    silent: 'Silent',
    silentDetail: 'A banner only',
    /** "Standard tone · 10 min before". */
    summaryBefore: '{{sound}} · {{minutes}} min before',
    minutes: '{{minutes}} min',
    reminderBefore: 'Reminder before',
    sound: 'Sound',
    playsSound: 'Plays the sound',
    /** VoiceOver's name for a prayer's row: "Fajr: Standard tone · 10 min before. Change". */
    rowLabel: '{{name}}: {{summary}}. Change',
    /** The athan as a prayer's sound (Revisely Dev, iPhone). */
    athan: 'Athan',
    athanDetail: 'At the prayer’s time. A reminder before it has the standard tone',
    /** A prayer's sound with its voice: "Athan · Makkah". */
    athanVoice: 'Athan · {{voice}}',
    voice: 'Voice',
    chooseVoice: 'Choose a voice',
  },
  /** Settings → Prayer → Athan voice (Revisely Dev, iPhone). */
  athan: {
    title: 'Athan voice',
    /** The picker opened from one prayer: "Athan for Fajr". */
    titleFor: 'Athan for {{name}}',
    none: 'None',
    loading: 'Loading voices…',
    loadFailed: "Couldn't load the voices. Check your connection and try again.",
    voices: 'Voices',
    footer: 'A notification plays the first 30 seconds.',
    downloading: 'Downloading {{percent}}%',
    stopLabel: 'Stop {{name}}',
    listenLabel: 'Listen to {{name}}',
    moreLabel: 'More about {{name}}',
    licence: 'Licence: {{licence}}',
    source: 'Where it’s from',
    stopDownloading: 'Stop downloading',
    /** The sheet while the whole athan plays, after a tap on its notification. */
    fullMessage: 'The whole athan',
    fullStop: 'Stop',
    remove: 'Remove download',
    removeDetail: 'Prayers set to it play the standard tone until it downloads again',
    notAClip: 'This voice can’t be used for notifications.',
    downloadStopped: 'The download stopped. Check your connection and try again.',
  },
  notify: {
    ask: {
      title: 'Turn on prayer notifications?',
      body: 'Revisely reminds you at the prayer times you choose. They’re scheduled on this phone.',
      allow: 'Allow notifications',
    },
    denied: { title: 'Notifications are off for Revisely', body: 'Turn them on in Settings to get prayer notifications.' },
  },
} as const;
