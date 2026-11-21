// "What's new": a short walkthrough after the update, for accounts set up on an app from before the
// release (Majd, Nov 8 2026: "only shows up once and they must go through it and complete it … just
// the main stuff"; "resume is fine"). Its cards are help text, so they live here beside topics.ts and
// the help's drift check covers them (__tests__/whatsNew.test.ts, whatsNewReviewed.json):
//   UPDATE_HELP_REVIEWED=1 npx jest src/lib/help
// Who sees it and when is BEHAVIOUR.md NEW-1 to NEW-4 (lib/whatsNew/due, components/whatsNew).
//
// A release's entry ships with `live: false` and is switched on, one line, in the PR that makes its
// features public: production gets JavaScript only through Promote, so App Store users get the cards
// in the same update as what they describe. Until then testers see them from Settings.
//
// {{Label}} is text the app shows (drawn in ink); [[icon]] a button's own glyph; [[revo]] Revo's disc.

import { helpPlainText, helpTextParts, type HelpIcon, type HelpTextPart } from './topics';

/**
 * A feature a card describes that may still be for testers only. A card (or a row of the last card)
 * whose feature isn't open to the account is left out (components/whatsNew/needs decides, with each
 * feature's own gate), and a live release may not need a feature that is still testers only.
 */
export type WhatsNewNeed = 'activity' | 'sittings' | 'revo' | 'help' | 'translations' | 'recite' | 'insights' | 'reciteRevo';

/** The pictures (components/whatsNew/pictures): a part of the screen the card is about. */
export type WhatsNewPicture = 'activity' | 'elsewhere' | 'ayah' | 'marks' | 'again' | 'gaps';

/**
 * A card that plays as a full-screen moment instead of a picture over words (components/whatsNew):
 * 'revo' is RevoMoment (lib/whatsNew/revoMoment), ending on Turn on Revo or Later.
 */
export type WhatsNewMoment = 'revo' | 'recite';

export interface WhatsNewRow {
  id: string;
  icon: HelpIcon;
  title: string;
  text: string;
  covers: readonly string[];
  needs?: WhatsNewNeed;
}

export interface WhatsNewCard {
  id: string;
  title: string;
  /** A card with a picture or a moment has words; the last card ("Also new") has rows instead. */
  text?: string;
  picture?: WhatsNewPicture;
  /** Plays full screen, its words on its last frame (past 1.6× text, the words alone, as any card). */
  moment?: WhatsNewMoment;
  rows?: readonly WhatsNewRow[];
  /** The BEHAVIOUR.md rules its words describe (a rows card: each row's own). */
  covers: readonly string[];
  needs?: WhatsNewNeed;
}

export interface WhatsNewRelease {
  /** Written to the account as `whatsNewSeen` (the rules allow a-z, 0-9, '.', '-'; 1 to 20). */
  id: string;
  /** Shown to accounts set up before it: switched on with the release. */
  live: boolean;
  cards: readonly WhatsNewCard[];
}

/**
 * Accounts that must never see a walkthrough (App Review's, the screenshots'): the seed scripts write
 * this as `whatsNewSeen` (functions/scripts/seed-reviewer.js, seed-screenshots.js).
 */
export const SEEN_ALL = 'all';

/** Oldest first; the last is the current release. Only the current one shows or replays. */
export const RELEASES: readonly WhatsNewRelease[] = [
  {
    id: '2026-11',
    live: true,
    cards: [
      {
        id: 'activity',
        title: 'Your days, in Activity',
        text:
          "A calendar of what you've done. Open a day to see what you revised, memorized and recorded. " +
          '{{Insights}} is its second tab.',
        picture: 'activity',
        covers: ['ACT-18', 'ACT-3', 'ACT-2'],
        needs: 'activity',
      },
      {
        id: 'elsewhere',
        title: 'Revised elsewhere?',
        text: 'With your teacher or at the masjid: open today in Activity and tap [[plus]]. It counts toward today and your streak.',
        picture: 'elsewhere',
        covers: ['ACT-5', 'ACT-15', 'ACT-17'],
        needs: 'activity',
      },
      {
        id: 'ayah',
        title: 'Memorize by the ayah',
        text:
          "Mark what you've memorized ayah by ayah. Time a sitting or record yourself in the reader, " +
          "and it's saved to that day.",
        picture: 'ayah',
        covers: ['MEM-1', 'MEM-2', 'MEM-5', 'REC-1', 'REC-2'],
        needs: 'sittings',
      },
      {
        id: 'revo',
        title: 'Meet Revo',
        text: 'Ask about your revision, or how anything in the app works.',
        moment: 'revo',
        covers: ['REVO-1', 'REVO-30'],
        needs: 'revo',
      },
      {
        id: 'more',
        title: 'Also new',
        covers: [],
        rows: [
          {
            id: 'help',
            icon: 'help-circle-outline',
            title: 'Help on screens',
            text: 'Tap [[help]] for a short guide to that screen.',
            covers: ['HELP-1'],
            needs: 'help',
          },
          {
            id: 'translations',
            icon: 'language-outline',
            title: 'More translations',
            text: 'Read the meaning in more languages.',
            covers: ['TRANS-1'],
            needs: 'translations',
          },
          {
            id: 'offline',
            icon: 'cloud-offline-outline',
            title: 'Works offline',
            text: 'The whole mushaf is on your phone, and revision saves without a connection.',
            covers: ['SYNC-1', 'SYNC-2'],
          },
        ],
      },
    ],
  },
  {
    // The mistake detection release (Majd, Nov 16 2026: "it should mainly mention mistake detection and probably the new
    // stuff in insights and whatever else i might've forgotten"). Switched on with the release PR, with its gates.
    id: '1.0.5',
    live: true,
    cards: [
      {
        id: 'recite',
        title: 'Recite, and see your mistakes',
        text:
          'Tap [[mic]] in the reader and recite from memory. The page follows you, and with {{Mark mistakes}} on, ' +
          'each mistake is highlighted as you go.',
        // A take plays by itself (components/whatsNew/ReciteMoment), the card's words at its end.
        moment: 'recite',
        covers: ['RECITE-1', 'RECITE-2'],
        needs: 'recite',
      },
      {
        id: 'marks',
        title: 'Every mistake, explained',
        text:
          'Tap a highlight to see what was expected, hear the ayah, and hear yourself there. ' +
          '{{Not clear}} never counts, and {{Not a mistake}} takes one off.',
        picture: 'marks',
        covers: ['RECITE-3', 'RECITE-4'],
        needs: 'recite',
      },
      {
        id: 'again',
        title: 'Until it sticks',
        text:
          '{{Recite the mistakes again}} goes over just those ayat. A mistake stays marked on the page until you say ' +
          'it right on two different days.',
        picture: 'again',
        covers: ['RECITE-7', 'RMEM-2', 'RMEM-3'],
        needs: 'recite',
      },
      {
        id: 'gaps',
        title: 'Gaps, in Insights',
        text: 'See each time you went 2 days or more without revising, and with {{Last revised}}, when you last revised each surah and juz.',
        picture: 'gaps',
        covers: ['ACT-28', 'ACT-30'],
        needs: 'insights',
      },
      {
        id: 'more',
        title: 'Also new',
        covers: [],
        rows: [
          {
            id: 'test',
            icon: 'shuffle-outline',
            title: 'Test me',
            text: 'Hold [[mic]] and pick {{Test me}}: five places at random in what you’ve memorized.',
            covers: ['RECITE-8'],
            needs: 'recite',
          },
          {
            // With Revo's row (Nov 18 2026), so Premium has a row of its own: the last card has four at most.
            id: 'recitation',
            icon: 'trending-up-outline',
            title: 'Your recitation in Insights',
            text: 'Your score over time, and the passages that keep slipping. Revo knows them too: ask it what keeps slipping, or about one take.',
            covers: ['RINS-2', 'RINS-1', 'RINS-3'],
            needs: 'recite',
          },
          {
            // Majd, Nov 18 2026: free for everyone who signs up during early access, kept for life (PREM-1).
            id: 'premium',
            icon: 'star-outline',
            title: 'Premium, in early access',
            text: '{{Mark mistakes}} and {{Test me}} are part of Premium: free for everyone during early access, and yours for life.',
            covers: ['PREM-1'],
            needs: 'recite',
          },
          {
            id: 'search',
            icon: 'search-outline',
            title: 'A new search',
            text: 'The field and the mic sit at the bottom, and each ayah found comes with its meaning.',
            covers: ['SEARCH-1'],
          },
        ],
      },
    ],

  },
];

export const CURRENT_RELEASE: WhatsNewRelease = RELEASES[RELEASES.length - 1];

/**
 * The next release, still dark: not in RELEASES yet, so the current release stays what store users, TestFlight testers,
 * E2E and the scenarios see and what onboarding marks. Revisely Dev's testers see it in Settings → About → What's new
 * and in the run at launch (releaseFor). The release PR appends it to RELEASES with `live: true`, opening its
 * features' gates in the same change, and sets this back to null.
 */
export const NEXT_RELEASE: WhatsNewRelease | null = null;

/** Every release with cards, the next one included (the drift check reads them all). */
export const ALL_RELEASES: readonly WhatsNewRelease[] = NEXT_RELEASE ? [...RELEASES, NEXT_RELEASE] : RELEASES;

/** The release a screen in `mode` shows: the next one for a tester's replay or run in Revisely Dev, else the current. */
export function releaseFor(mode: 'required' | 'forced' | 'replay', dev: boolean): WhatsNewRelease {
  return mode !== 'required' && dev && NEXT_RELEASE ? NEXT_RELEASE : CURRENT_RELEASE;
}

/**
 * Whether an account has seen `release` (NEW-1): it finished it, or a later one, or set up after it
 * (onboarding writes the release it ran on). No mark is an account from before the walkthroughs. A
 * mark this app doesn't know is a later release's (a newer app on another phone), so seen too.
 */
export function hasSeen(
  mark: string | null | undefined,
  release: WhatsNewRelease = CURRENT_RELEASE,
  releases: readonly WhatsNewRelease[] = RELEASES,
): boolean {
  if (typeof mark !== 'string' || mark === '') return false;
  if (mark === SEEN_ALL || mark === release.id) return true;
  const at = releases.findIndex((r) => r.id === mark);
  const current = releases.findIndex((r) => r.id === release.id);
  return at === -1 || at > current;
}

/** The cards an account sees: those whose feature is open to it, and the last card's rows likewise. */
export function cardsFor(release: WhatsNewRelease, open: (need: WhatsNewNeed) => boolean): WhatsNewCard[] {
  const out: WhatsNewCard[] = [];
  for (const card of release.cards) {
    if (card.needs && !open(card.needs)) continue;
    if (card.rows) {
      const rows = card.rows.filter((r) => !r.needs || open(r.needs));
      if (rows.length > 0) out.push({ ...card, rows });
    } else out.push(card);
  }
  return out;
}

/** Every need a release's cards and rows name. */
export function needsOf(release: WhatsNewRelease): WhatsNewNeed[] {
  const all = release.cards.flatMap((c) => [c.needs, ...(c.rows ?? []).map((r) => r.needs)]);
  return [...new Set(all.filter((n): n is WhatsNewNeed => !!n))];
}

export type WhatsNewPart = HelpTextPart | { kind: 'revo' };

/** A card's words in parts: text, {{labels}}, [[icons]] and Revo's disc. */
export function whatsNewParts(text: string): WhatsNewPart[] {
  const out: WhatsNewPart[] = [];
  text.split('[[revo]]').forEach((piece, i) => {
    if (i > 0) out.push({ kind: 'revo' });
    if (piece) out.push(...helpTextParts(piece));
  });
  return out;
}

/** A card's words as read aloud (VoiceOver), never a glyph's private character. */
export function whatsNewPlainText(text: string): string {
  return helpPlainText(text.replace(/\[\[revo\]\]/g, 'Revo’s R'));
}
