// components/reciteMemory and lib/reciteMemory: Recite's memory of each word, the takes kept, the progress page.
export const reciteMemory = {
  /** When a take was: "Today, 7:51 PM", "Yesterday, 9:30 PM". */
  todayAt: 'Today, {{time}}',
  yesterdayAt: 'Yesterday, {{time}}',
  /** "Fri 13 Nov, 7:51 PM". */
  dateAt: '{{date}}, {{time}}',
  /** A word's history: "wrong in your 1 take", "wrong in 3 of 6 takes". */
  wrongInOnly: 'wrong in your 1 take',
  wrongIn_one: 'wrong in {{wrong}} of {{count}} take',
  wrongIn_other: 'wrong in {{wrong}} of {{count}} takes',
  right: 'Right',
  wrong: 'Wrong',
  wrongSkipped: 'Wrong · skipped',
  wrongAdded: 'Wrong · added',
  wrongSaid: 'Wrong · said',
  /** A tajweed try: "Wrong · held about 2 counts". */
  wrongNote: 'Wrong · {{note}}',
  tajweed: 'tajweed',
  clearedByYou: 'Cleared by you.',
  clearedTwoDays: 'Cleared: said right on 2 different days.',
  sayRightOn_one: 'Say it right on {{count}} different day to clear it.',
  sayRightOn_other: 'Say it right on {{count}} different days to clear it.',
  rightToday: 'Right today. Right again on another day clears it.',
  rightOnce: 'Right once. Right again on another day clears it.',
  /** The progress line: "Up from 95.1% on Mon 2 Nov · 6 takes". */
  earlierToday: 'earlier today',
  yesterday: 'yesterday',
  onDate: 'on {{date}}',
  sameAs: 'The same as {{on}}',
  upFrom: 'Up from {{from}} {{on}}',
  downFrom: 'Down from {{from}} {{on}}',
  progress_one: '{{lead}} · {{count}} take',
  progress_other: '{{lead}} · {{count}} takes',
  chart: {
    today: 'Today',
    label_one: 'Accuracy over {{count}} take',
    label_other: 'Accuracy over {{count}} takes',
  },
  passage: {
    ayahN: 'Ayah\u00a0{{n}}',
    ayahs: 'Ayahs {{from}}–{{to}}',
    title: 'Your progress',
    first: 'Your first take here',
    toFix: 'Still to fix here',
    takes: 'Your takes here',
    pageHidden: 'Page hidden',
    takeLabel: '{{when}}, {{score}}, {{mistakes}}. Show it on the page',
  },
  recited: {
    title: 'Recited',
    all: 'All recitations',
  },
  /** A past mistake on the page, for VoiceOver: "Past mistake: Wrong word, وَأُوهِيَتْ". */
  pastLabel: 'Past mistake: {{title}}, {{word}}',
  pastLabelAfter: 'Past mistake: {{title}}, after {{word}}',
  pastHint: 'Shows your takes of this word',
  shown: {
    pause: 'Pause your take',
    play: 'Play your take',
    label: 'Your take, {{when}}',
    title: 'Your take · {{when}}',
    hidden: 'recited with the page hidden',
  },
  rows: {
    /** A take's line: "7:51 PM · 1 mistake · 2 cleared · page hidden". */
    cleared_one: '{{count}} cleared',
    cleared_other: '{{count}} cleared',
    pageHidden: 'page hidden',
    notChecked: 'not checked',
    unfinished: '{{mistakes}}, unfinished',
    unclear_one: '{{count}} not clear',
    unclear_other: '{{count}} not clear',
    hint: 'Shows it on the page, with its marks',
    listenBack: 'Listen back: {{passage}}',
    /** All activity's take row, for VoiceOver. */
    allLabel: '{{passage}}, {{when}}, {{score}}, {{mistakes}}',
    allLabelUnchecked: '{{passage}}, {{when}}, not checked',
  },
  card: {
    yours: 'Your recitation, {{when}}',
    clearNow: 'Clear now',
    takes: 'Your takes',
    seeAllLabel: 'See all your takes here',
    seeAll: 'See all',
  },
} as const;
