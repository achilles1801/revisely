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
    permission: {
      title: 'Allow location for prayer times',
      body: 'Revisely works out the times for where you are. Your location stays on this phone.',
      allow: 'Allow location',
    },
    denied: { title: 'Location is off for Revisely', body: 'Turn it on in Settings to see prayer times.' },
    noLocation: { title: "Couldn't find where you are", body: 'Check that Location Services is on, then try again.' },
    locating: 'Finding where you are…',
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
