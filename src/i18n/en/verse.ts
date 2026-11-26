// components/verse: the held verse's menu, the translation sheet, its pickers and Audio Options.
export const verse = {
  /** The menu beside a held verse. */
  menu: {
    play: 'Play',
    /** Revo in the mushaf (Revisely Dev, REVO-45). */
    askRevo: 'Ask Revo',
    askRevoSubtitle: 'About this ayah, from the tafsir',
    translation: 'Translation',
    copy: 'Copy',
    share: 'Share',
    /** VoiceOver hears which verse: "Play Al-Baqarah 2:255". */
    playOf: 'Play {{verse}}',
    translationOf: 'Translation of {{verse}}',
    copyOf: 'Copy {{verse}}',
    shareOf: 'Share {{verse}}',
  },
  /** Where Play goes on to, under Play. */
  playTo: {
    page: 'to the end of the page',
    surah: 'to the end of the surah',
    juz: 'to the end of the juz',
    /** "to Al-Baqarah 2:141". */
    verse: 'to {{verse}}',
  },
  actions: {
    recordingBody: 'Pause the recording to play the recitation.',
    copied: 'Copied',
    copyFailed: 'Couldn’t copy. Check your connection.',
    shareFailed: 'Couldn’t share. Check your connection.',
    reciter: 'Reciter',
  },
  /** The translation sheet. */
  sheet: {
    closeTranslation: 'Close translation',
    smaller: 'Make the translation smaller',
    expand: 'Expand the translation',
    /** VoiceOver's actions on the grabber. */
    smallerAction: 'Make smaller',
    expandAction: 'Expand',
    ayah: 'Ayah {{n}}',
    previous: 'Previous verse',
    next: 'Next verse',
    selectTranslation: 'Select translation',
    selectTranslationLabel: 'Select translation, {{name}}',
    selectReciter: 'Select reciter',
    selectReciterLabel: 'Select reciter, {{name}}',
    notAvailable: 'Not available yet',
    clearQuranOffline: 'The Clear Quran® needs the internet',
    availableOffline: '{{name}} is available offline.',
    readBefore: "Verses you've read before show offline. Try again once you're online.",
    notDownloaded: "This translation isn't downloaded",
    downloadIt: 'Download it from Select translation to read it offline.',
    verseNotDownloaded: "This verse isn't downloaded yet. It shows when you're back online.",
    couldNotLoadTranslation: "Couldn't load translation",
    couldNotLoadVerse: "Couldn't load this verse. Check your connection.",
    show: 'Show {{name}}',
    /** A credit's link: "QuranEnc.com, opens the website". */
    opensWebsite: '{{name}}, opens the website',
  },
  /** Choosing a translation (every QuranEnc translation). */
  picker: {
    removeTitle: 'Remove {{name}}?',
    removeBody: 'This frees {{size}}. You can download it again.',
    title: 'Translations',
    doneEditing: 'Done editing',
    edit: 'Edit favorites and downloads',
    search: 'Language or translator',
    searchLabel: 'Search translations by language or translator',
    clearSearch: 'Clear the search',
    noFavorites: 'No favorites or downloads yet',
    noMatch: 'No translation matches “{{query}}”',
    removeFromPhone: 'Remove {{name}} from this phone, {{size}}',
    unfavorite: 'Remove {{name}} from favorites',
    favorite: 'Add {{name}} to favorites',
    moveUp: 'Move {{name}} up',
    moveDown: 'Move {{name}} down',
    stopDownload: 'Stop downloading {{name}}',
    download: 'Download {{name}}, {{size}}',
  },
  reciters: {
    styles: "Murattal: measured. Mujawwad: melodic, slower. Mu'allim: teaching, with a pause to repeat each verse.",
  },
  /** Audio Options. */
  audio: {
    title: 'Audio Options',
    reciter: 'Reciter',
    speed: 'Playback speed',
    speedLabel: 'playback speed',
    ayahs: 'Ayahs to play',
    ayahsFooter: 'Page, Surah and Juz’ set To for you, and are kept for next time. Choose To yourself and it’s Custom.',
    from: 'From',
    to: 'To',
    showsPicker: 'Shows a picker',
    playUpTo: 'Play up to',
    eachVerse: 'Each verse',
    eachVerseFooter: 'A pause about as long as the verse (1×) leaves time to recite it back from memory before the next one.',
    repeat: 'Repeat',
    loop: 'Loop ∞',
    pause: 'Pause after each verse',
    play: 'Play with these settings',
    surah: 'Surah',
    ayah: 'Ayah',
    ayahN: 'Ayah {{n}}',
  },
  /** Errors from The Clear Quran (lib/clearQuran). */
  tcq: {
    rateLimited: 'Too many requests right now. Try again in a minute.',
    dailyLimit: 'The Clear Quran has reached its limit for today. Try again tomorrow.',
    signIn: 'Sign in again, then try again.',
    notFound: "This verse isn't available.",
    unavailable: 'The Clear Quran is unavailable right now. Try again shortly.',
    network: 'Check your connection and try again.',
  },
  /** The Arabic's source, as Tanzil's terms ask (its link is tanzil.net). */
  arabicCredit: 'Arabic text: Tanzil Project',
  /** A shared verse's reference: "Āli-'Imrān, Ayah 5". */
  reference: '{{name}}, Ayah {{ayah}}',
  /** The translation picker's sections and download lines (lib/translationPicker). */
  sections: {
    favorites: 'Favorites',
    downloaded: 'Downloaded',
    selected: 'Selected',
  },
  downloads: {
    withMushaf: 'On this phone, with the offline mushaf',
    downloadsWithMushaf: 'Downloads with the offline mushaf',
    downloading: 'Downloading… {{percent}}%',
    onPhone: 'On this phone · {{size}}',
    failed: 'Couldn’t download all of it · {{suras}} of {{total}} suras on this phone',
    partial: '{{suras}} of {{total}} suras on this phone · {{size}}',
  },
  /** How a reciter recites (lib/recitation). */
  styles: {
    murattal: 'Murattal',
    murattalSub: 'Measured, at a steady pace',
    mujawwad: 'Mujawwad',
    mujawwadSub: 'Melodic, slower, with longer pauses',
    muallim: "Mu'allim",
    muallimSub: 'Teaching: each verse with a pause to repeat',
  },
  /** Audio Options' Play up to, Repeat and Pause. */
  playUpTo: {
    page: 'Page',
    surah: 'Surah',
    juz: 'Juz’',
    custom: 'Custom',
  },
  loop: 'Loop',
  off: 'Off',
} as const;
