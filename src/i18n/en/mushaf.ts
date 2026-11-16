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
} as const;
