// The Account page's new look (lib/release/accountDesign, ACCOUNT-4 to ACCOUNT-7): the header, the badges for pages
// revised (lib/badges) and the badge moment.
export const account = {
  /** Under the name and the Premium pill: "Revising since March 2026". */
  since: 'Revising since {{month}}',
  sinceToday: 'Revising since today',
  premium: 'Premium',
  /** Settings' account row, under the name: "1,240 pages revised". */
  pagesRevised_one: '{{n}} page revised',
  pagesRevised_other: '{{n}} pages revised',
  /** The account header, for VoiceOver: "Maryam, Premium, Gold II". */
  headerLabel: '{{who}}. Your account',
  figures: {
    pagesRevised_one: 'page revised',
    pagesRevised_other: 'pages revised',
    longest: 'longest streak',
    time: 'in Revisely',
    days_one: '{{count}} day',
    days_other: '{{count}} days',
  },
  /** The milestone bar under the header. */
  bar: {
    first_one: 'Revise {{count}} page for your first badge',
    first_other: 'Revise {{count}} pages for your first badge',
    next_one: '{{n}} more for {{badge}}',
    next_other: '{{n}} more for {{badge}}',
    all: 'Every badge won',
    newBadge: 'New badge · {{badge}}',
    /** For VoiceOver: "37 of 50 pages revised. Badges". */
    label: '{{revised}} of {{next}} pages revised. Badges',
  },
  badges: {
    title: 'Badges',
    /** "Gold I", "Gold II". */
    nameOne: '{{tier}} I',
    nameTwo: '{{tier}} II',
    /** A milestone of a thousand or more, on its badge: "2.5K". */
    thousands: '{{n}}K',
    tiers: {
      bronze: 'Bronze',
      silver: 'Silver',
      gold: 'Gold',
      platinum: 'Platinum',
      diamond: 'Diamond',
      emerald: 'Emerald',
    },
    pages_one: '{{n}} page',
    pages_other: '{{n}} pages',
    toGo_one: '{{n}} to go',
    toGo_other: '{{n}} to go',
    /** The session's end card, once (ACCOUNT-6). */
    newRow: 'New badge · {{badge}}',
    newRowSub_one: '{{n}} page revised',
    newRowSub_other: '{{n}} pages revised',
  },
  /** Settings → Account → Name and email. */
  details: {
    name: 'Name',
    signedInWith: 'Signed in with {{provider}}',
    google: 'Google',
    apple: 'Apple',
    password: 'your email and password',
  },
} as const;
