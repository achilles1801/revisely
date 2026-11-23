// components/mushaf (choosing the print, Settings → Mushaf), MushafPager and MushafScrubber.
export const mushaf = {
  title: 'Mushaf',
  onPhone: 'On this phone',
  pagesOnPhone: '{{pages}} of {{total}} pages on this phone',
  toDownload: '{{size}} to download',
  removeTitle: 'Remove {{name}}?',
  removeBody: 'This frees {{size}}. It downloads again if you choose it.',
  removeRow: 'Remove {{name}}',
  removeLabel: 'Remove {{name}} from this phone, {{size}}',
  /** components/MushafPager: a page of the mushaf. */
  pager: {
    page: 'Page {{page}}',
    hint: 'Shows or hides the controls',
    notDownloaded: "Page {{page}} isn't downloaded yet",
    couldNotLoad: "Couldn't load page {{page}}",
    backOnline: "It shows when you're back online.",
  },
  /** components/MushafScrubber: the page slider. */
  scrubber: {
    page: 'Page {{page}}',
    /** "Al-Baqarah · Juz 2". */
    where: '{{surahs}} · Juz {{juz}}',
    label: 'Page position',
    hint: 'Drag to jump to another page',
  },
  /** Settings → Downloads and storage → Offline mushaf (lib/mushafOfflineUi). */
  offline: {
    textAndTranslation: 'the text and translation',
    pagesOf: '{{pages}} of {{total}} pages',
    wifiOrData: 'Wi-Fi or mobile data',
    wifi: 'Wi-Fi',
    downloaded: 'Downloaded',
    allPages: 'All {{total}} pages and Saheeh International · {{size}}',
    downloading: 'Downloading · {{pages}}',
    downloadsOn: 'Downloads on {{over}} · {{what}}',
    download: 'Download',
    waitingWifi: 'Waiting for Wi-Fi · {{pages}}',
    continuesOnline: "Continues when you're online · {{pages}}",
    pagesOnPhone: '{{pages}} of {{total}} pages on this phone',
    notOnPhone: 'Not on this phone · {{size}}',
    noSpace: 'Not enough free space · {{pages}}',
    error: "Some of it didn't download · tries again soon",
    idle: 'Every page and Saheeh International, for reading offline',
    downloadNow: 'Download now',
    remove: 'Remove from this phone',
    removeTitle: 'Remove the offline mushaf?',
    removeBody: 'This frees {{size}}. Pages and translations you open still download as you read.',
    removeButton: 'Remove',
    dataTitle: 'Download over mobile data?',
    dataBody: 'About {{size}} left to download.',
  },
  /** The prints (lib/mushafEdition). */
  editions: {
    madani1405: 'Madani 1405',
    madani1441: 'Madani 1441',
    kingFahd: 'King Fahd Glorious Qur’an Printing Complex, Madinah',
    /** The picker's credit: "Pages: <publisher>" while every print has the same one. */
    creditPages: 'Pages: {{credit}}',
    creditNames: '{{names}}: {{credit}}',
  },
} as const;
