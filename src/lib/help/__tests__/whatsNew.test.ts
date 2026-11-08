// "What's new" stays true (its cards are help text): the help's drift check for the cards, and their
// own rules. whatsNewReviewed.json holds, per card (and per row of the last card), a hash of each rule
// it describes as it was when the card was last read against it. A rule changes: read the card
// (src/lib/help/whatsNew.ts) against it, fix the words if they no longer hold, then
//
//   UPDATE_HELP_REVIEWED=1 npx jest src/lib/help
//
// A release switched on may not need a feature that is still for testers: the card would quietly drop
// out for everyone. Making the feature public changes its rule, which brings the card here for review.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { appSource, readRepo, ruleHash, ruleTexts } from '../../../../jest/behaviourRules';
import { HELP_INLINE_ICONS } from '../topics';
import {
  CURRENT_RELEASE,
  RELEASES,
  SEEN_ALL,
  cardsFor,
  hasSeen,
  needsOf,
  whatsNewParts,
  whatsNewPlainText,
  type WhatsNewRelease,
} from '../whatsNew';
import { needOpen } from '../../../components/whatsNew/needs';

const REVIEWED = join(__dirname, '../whatsNewReviewed.json');
const rules = ruleTexts(readRepo('BEHAVIOUR.md'));

/** Every piece of text with rules: each card with words, each row of a rows card. */
const pieces = RELEASES.flatMap((r) =>
  r.cards.flatMap((c) =>
    c.rows
      ? c.rows.map((row) => ({ id: `${r.id}/${c.id}.${row.id}`, text: row.text, title: row.title, covers: row.covers }))
      : [{ id: `${r.id}/${c.id}`, text: c.text ?? '', title: c.title, covers: c.covers }],
  ),
);

describe("What's new: its releases", () => {
  it('each release has an id the rules accept, once', () => {
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9.-]{1,20}$/);
    expect(ids).not.toContain(SEEN_ALL);
    expect(CURRENT_RELEASE).toBe(RELEASES[RELEASES.length - 1]);
  });

  it('a release is short: at most five cards, the last with at most four rows', () => {
    for (const r of RELEASES) {
      expect(r.cards.length).toBeGreaterThan(0);
      expect(r.cards.length).toBeLessThanOrEqual(5);
      for (const c of r.cards) if (c.rows) expect(c.rows.length).toBeLessThanOrEqual(4);
    }
  });

  it('a card has words and a picture or a moment, or rows', () => {
    for (const r of RELEASES) {
      for (const c of r.cards) {
        if (c.rows) expect(c.text).toBeUndefined();
        else {
          expect(c.text?.length).toBeGreaterThan(0);
          // One or the other: a moment is the whole screen.
          expect([c.picture, c.moment].filter(Boolean)).toHaveLength(1);
        }
      }
    }
  });
});

describe("What's new reads BEHAVIOUR.md", () => {
  it('every card and row describes a rule that exists', () => {
    expect(pieces.filter((p) => p.covers.length === 0).map((p) => p.id)).toEqual([]);
    expect(pieces.flatMap((p) => p.covers.filter((id) => !rules.has(id)).map((id) => `${p.id}: ${id}`))).toEqual([]);
  });
});

describe("What's new is reviewed when a rule it describes changes", () => {
  const fresh: Record<string, Record<string, string>> = {};
  for (const p of pieces) fresh[p.id] = Object.fromEntries(p.covers.map((id) => [id, ruleHash(rules.get(id) ?? '')]));

  if (process.env.UPDATE_HELP_REVIEWED) {
    it('records the review (UPDATE_HELP_REVIEWED)', () => {
      writeFileSync(REVIEWED, JSON.stringify(fresh, null, 2) + '\n');
    });
    return;
  }

  const reviewed: Record<string, Record<string, string>> = existsSync(REVIEWED) ? JSON.parse(readFileSync(REVIEWED, 'utf8')) : {};

  it('every rule a card describes is as it was when the card was last reviewed', () => {
    const stale: string[] = [];
    for (const p of pieces) {
      for (const id of p.covers) {
        const was = reviewed[p.id]?.[id];
        if (was == null) stale.push(`${p.id} now describes ${id}: read the card against it`);
        else if (was !== fresh[p.id][id]) stale.push(`${p.id}: ${id} changed since the card was last reviewed`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('whatsNewReviewed.json holds nothing for cards or rules no longer there', () => {
    const extra = Object.entries(reviewed).flatMap(([id, byRule]) =>
      id in fresh ? Object.keys(byRule).filter((r) => !(r in fresh[id])).map((r) => `${id}: ${r}`) : [id],
    );
    expect(extra).toEqual([]);
  });
});

describe("What's new names what the app has, plainly", () => {
  it('every {{label}} is text the app shows, word for word', () => {
    const source = appSource().replace(/’/g, "'");
    const labels = [...new Set(pieces.flatMap((p) => whatsNewParts(p.text).flatMap((x) => (x.kind === 'label' ? [x.text] : []))))];
    expect(labels.filter((l) => !source.includes(l.replace(/’/g, "'")))).toEqual([]);
  });

  it('every [[glyph]] is one it can draw, and reads as words', () => {
    const bad = pieces.flatMap((p) =>
      [...p.text.matchAll(/\[\[([a-z]+)\]\]/g)].filter((m) => m[1] !== 'revo' && !(m[1] in HELP_INLINE_ICONS)).map((m) => `${p.id}: ${m[1]}`),
    );
    expect(bad).toEqual([]);
    for (const p of pieces) expect(whatsNewPlainText(p.text)).not.toMatch(/\[\[|\]\]|\{\{|\}\}|[-]/);
  });

  it('keeps each card to a few lines, names surahs and juz (no page numbers) and says nothing about strength', () => {
    for (const p of pieces) {
      expect(p.text.length).toBeLessThanOrEqual(170);
      expect(`${p.title} ${p.text}`).not.toMatch(/\bp\.\s*\d|\bpages? \d/i);
      // No card has a Smart Tracking variant, so none may speak of ratings (HELP-3's rule, for the cards too).
      expect(`${p.title} ${p.text}`).not.toMatch(/\b(rat(e|ed|ing|ings)|strength|strong|weak)\b/i);
    }
  });
});

describe('who has seen a release (NEW-1)', () => {
  const two: WhatsNewRelease[] = [
    { id: 'a', live: true, cards: [] },
    { id: 'b', live: true, cards: [] },
  ];
  it('no mark: an account from before the walkthroughs, so not seen', () => {
    expect(hasSeen(undefined)).toBe(false);
    expect(hasSeen(null)).toBe(false);
    expect(hasSeen('')).toBe(false);
  });
  it('this release, a later one this app does not know, or the seeds’ mark: seen', () => {
    expect(hasSeen(CURRENT_RELEASE.id)).toBe(true);
    expect(hasSeen('2099-01')).toBe(true);
    expect(hasSeen(SEEN_ALL)).toBe(true);
  });
  it('an earlier release: not seen; a later one: seen (the releases are in order)', () => {
    expect(hasSeen('a', two[1], two)).toBe(false);
    expect(hasSeen('b', two[1], two)).toBe(true);
    expect(hasSeen('b', two[0], two)).toBe(true);
    expect(hasSeen(undefined, two[0], two)).toBe(false);
  });
});

describe('the cards an account sees', () => {
  it('a card or row whose feature is closed to it is left out; a rows card with none left goes', () => {
    const all = cardsFor(CURRENT_RELEASE, () => true);
    expect(all.map((c) => c.id)).toEqual(CURRENT_RELEASE.cards.map((c) => c.id));
    const none = cardsFor(CURRENT_RELEASE, () => false);
    // Only what needs nothing is left: the last card, with its offline row.
    expect(none.map((c) => c.id)).toEqual(['more']);
    expect(none[0].rows?.map((r) => r.id)).toEqual(['offline']);
    const noRevo = cardsFor(CURRENT_RELEASE, (n) => n !== 'revo');
    expect(noRevo.map((c) => c.id)).not.toContain('revo');
  });

  it('a tester has every card; so does an account that isn’t one, with only Revo’s waiting on its own switch', () => {
    const tester = { previewTester: true };
    expect(cardsFor(CURRENT_RELEASE, (n) => needOpen(n, tester, 'testers'))).toHaveLength(CURRENT_RELEASE.cards.length);
    // previewTester unset and false: an App Store account.
    for (const account of [{}, { previewTester: false }]) {
      const all = cardsFor(CURRENT_RELEASE, (n) => needOpen(n, account, 'everyone'));
      expect(all.map((c) => c.id)).toEqual(CURRENT_RELEASE.cards.map((c) => c.id));
      expect(all.find((c) => c.rows)?.rows?.map((r) => r.id)).toEqual(CURRENT_RELEASE.cards.find((c) => c.rows)?.rows?.map((r) => r.id));
      // Revo still for testers (config/app.revo unset): every card but Revo's.
      const revoForTesters = cardsFor(CURRENT_RELEASE, (n) => needOpen(n, account, 'testers')).map((c) => c.id);
      expect(revoForTesters).toEqual(CURRENT_RELEASE.cards.filter((c) => c.needs !== 'revo').map((c) => c.id));
    }
  });

  it('a release switched on needs nothing that is still for testers only', () => {
    for (const r of RELEASES.filter((x) => x.live)) {
      const closed = needsOf(r).filter((n) => !needOpen(n, { previewTester: false }, 'everyone'));
      // Make the feature public in the same PR, or take its card out of the release.
      expect({ release: r.id, closed }).toEqual({ release: r.id, closed: [] });
    }
  });
});
