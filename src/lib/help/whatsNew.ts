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
export type WhatsNewNeed = 'activity' | 'sittings' | 'revo' | 'help' | 'translations';

/** The pictures (components/whatsNew/pictures): a part of the screen the card is about. */
export type WhatsNewPicture = 'activity' | 'elsewhere' | 'ayah';

/**
 * A card that plays as a full-screen moment instead of a picture over words (components/whatsNew):
 * 'revo' is RevoMoment (lib/whatsNew/revoMoment), ending on Turn on Revo or Later.
 */
export type WhatsNewMoment = 'revo';

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
];

export const CURRENT_RELEASE: WhatsNewRelease = RELEASES[RELEASES.length - 1];

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
