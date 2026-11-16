// components/insights: browsing pages by strength, and Insights' pieces.
export const insights = {
  /** A juz row: "12 pages · average 3.4 · ⁨Juz name⁩" (the name isolated, as it's Arabic). */
  juzMeta_one: '{{count}} page · average {{average}} · \u2068{{name}}\u2069',
  juzMeta_other: '{{count}} pages · average {{average}} · \u2068{{name}}\u2069',
  /** How long since a page was revised: "today", "12d ago". */
  today: 'today',
  daysAgo: '{{days}}d ago',
  reason: {
    missedOnce: 'Missed once on the schedule',
    missed: 'Missed {{count}} scheduled revisions',
    veryWeak: 'You marked this as very weak',
    weak: 'You marked this as weak',
    recent: 'Recently memorized — keep it fresh',
    lastRevised: 'Last revised {{ago}}',
  },
  allJuz: 'All juz',
  allStrengths: 'All strengths',
  nothingMemorized: 'Nothing memorized yet',
  /** "No pages match these filters", "No surahs match these filters". */
  noMatchPages: 'No pages match these filters',
  noMatchSurahs: 'No surahs match these filters',
  pages: 'Pages',
  surahs: 'Surahs',
  juzFilterLabel: 'Juz: {{filter}}',
  strengthLabel: 'Strength: {{value}}',
  /** A page row: "Weak · Juz 12 · Al-Baqarah 142 · revised 3d ago". */
  pageRow: '{{rating}} · Juz {{juz}} · {{page}} · revised {{ago}}',
  surahRow_one: '{{count}} page memorized · average {{average}}',
  surahRow_other: '{{count}} pages memorized · average {{average}}',
  surahLabel: '{{name}}, {{count}} pages memorized, average strength {{average}}. Opens its weakest page',
  juzLabel: 'Juz {{juz}}, {{count}} pages, average strength {{average}}. Shows its pages',
  filterByJuz: 'Filter by juz',
  filterByStrength: 'Filter by strength',
  showLess: 'Show less',
  showAll: 'Show all ({{hidden}})',
} as const;
