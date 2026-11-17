// The help's drift check: the help says what the app does.
//
// Each topic names the BEHAVIOUR.md rules it explains. reviewed.json holds, per topic, a hash of each
// of those rules' text as it was when the topic was last read against it. When a rule changes (or a
// topic starts covering a new one), this fails until someone reads the topic against the rule, fixes
// the words if they no longer hold, and records the review:
//
//   UPDATE_HELP_REVIEWED=1 npx jest src/lib/help
//
// It also checks that the {{labels}} a topic quotes are text the app shows, and the help's own rules:
// at most four topics a screen, no page numbers (NAME-1), nothing about ratings with Smart Tracking off.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { HELP, HELP_INLINE_ICONS, helpTextParts, linksFor, MAX_TOPICS, topicsFor, type HelpOpts, type HelpScreen } from '../topics';
import { appSource, readRepo, ruleHash as hash, ruleTexts } from '../../../../jest/behaviourRules';

const REVIEWED = join(__dirname, '../reviewed.json');
const read = readRepo;

const rules = ruleTexts(read('BEHAVIOUR.md'));
const screens = Object.keys(HELP) as HelpScreen[];
const topics = screens.flatMap((s) => HELP[s].topics.map((t) => ({ screen: s, ...t })));

describe('the help reads BEHAVIOUR.md', () => {
  it('finds the rules and their text', () => {
    expect(rules.size).toBeGreaterThan(100);
    expect(rules.get('SESS-6')).toMatch(/grace window/);
  });

  it('every topic covers a rule, or says why no rule covers it yet (and not both)', () => {
    expect(topics.filter((t) => t.covers.length === 0 && !t.unruled?.trim()).map((t) => t.id)).toEqual([]);
    expect(topics.filter((t) => t.covers.length > 0 && t.unruled).map((t) => t.id)).toEqual([]);
  });

  it('covers only rules that exist', () => {
    const unknown = topics.flatMap((t) => t.covers.filter((id) => !rules.has(id)).map((id) => `${t.id}: ${id}`));
    expect(unknown).toEqual([]);
  });
});

describe('the help is reviewed when a rule it explains changes', () => {
  const fresh: Record<string, Record<string, string>> = {};
  for (const t of topics) fresh[t.id] = Object.fromEntries(t.covers.map((id) => [id, hash(rules.get(id) ?? '')]));

  if (process.env.UPDATE_HELP_REVIEWED) {
    it('records the review (UPDATE_HELP_REVIEWED)', () => {
      writeFileSync(REVIEWED, JSON.stringify(fresh, null, 2) + '\n');
    });
    return;
  }

  const reviewed: Record<string, Record<string, string>> = existsSync(REVIEWED)
    ? JSON.parse(readFileSync(REVIEWED, 'utf8'))
    : {};

  it('every covered rule is as it was when its topic was last reviewed', () => {
    const stale: string[] = [];
    for (const t of topics) {
      for (const id of t.covers) {
        const was = reviewed[t.id]?.[id];
        if (was == null) stale.push(`${t.id} now covers ${id}: read the topic against it`);
        else if (was !== fresh[t.id][id]) stale.push(`${t.id}: ${id} changed since the topic was last reviewed`);
      }
    }
    // A rule changed: read the topic (src/lib/help/topics.ts) against it, fix the words if they no
    // longer hold, then record the review: UPDATE_HELP_REVIEWED=1 npx jest src/lib/help
    expect(stale).toEqual([]);
  });

  it('reviewed.json holds nothing for topics or rules the help no longer has', () => {
    const extra = Object.entries(reviewed).flatMap(([id, byRule]) =>
      id in fresh ? Object.keys(byRule).filter((r) => !(r in fresh[id])).map((r) => `${id}: ${r}`) : [id],
    );
    expect(extra).toEqual([]);
  });
});

describe('the help names what the app has', () => {
  it('every {{label}} is text the app shows, word for word', () => {
    const source = appSource().replace(/’/g, "'");
    const labels = [...new Set(topics.flatMap((t) => helpTextParts(t.text).flatMap((p) => (p.kind === 'label' ? [p.text] : []))))];
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((l) => !source.includes(l.replace(/’/g, "'")))).toEqual([]);
  });

  it('every [[icon]] is one the help knows', () => {
    const bad = topics.flatMap((t) => [...t.text.matchAll(/\[\[([a-z]+)\]\]/g)].filter((m) => !(m[1] in HELP_INLINE_ICONS)).map((m) => `${t.id}: ${m[1]}`));
    expect(bad).toEqual([]);
  });
});

describe('the help stays short and plain', () => {
  // Every account's kind: Smart Tracking, Recite, Revisely Dev and arranging sections, each on or off.
  const accounts: HelpOpts[] = [];
  for (const smartTracking of [true, false])
    for (const liveRecite of [true, false])
      for (const devApp of [true, false])
        for (const sections of [true, false]) accounts.push({ smartTracking, liveRecite, devApp, sections });

  it(`shows at most ${MAX_TOPICS} topics a sheet, for every kind of account; a screen's own sheet is never empty`, () => {
    for (const s of screens) {
      for (const opts of accounts) {
        const n = topicsFor(s, opts).length;
        expect(n).toBeLessThanOrEqual(MAX_TOPICS);
        // A sheet reached from another's links (or Recite's, while a take is open) may have nothing: its row doesn't show.
        if (!HELP[s].linked) expect(n).toBeGreaterThan(0);
      }
    }
  });

  it('a sheet leads only to sheets that exist and have something for the account', () => {
    for (const s of screens) {
      for (const to of HELP[s].more ?? []) expect(screens).toContain(to);
      for (const opts of accounts) for (const to of linksFor(s, opts)) expect(topicsFor(to, opts).length).toBeGreaterThan(0);
    }
    // Every linked sheet is reached from somewhere.
    const reached = new Set(screens.flatMap((s) => HELP[s].more ?? []));
    expect(screens.filter((s) => HELP[s].linked && !reached.has(s))).toEqual([]);
  });

  it('the reader’s ? reaches every Recite sheet without a take open, only with Recite (Revisely Dev, Nov 16 2026)', () => {
    const recite: HelpScreen[] = ['recite', 'reciteTake', 'reciteMemory', 'reciteTest'];
    expect(linksFor('reader', { smartTracking: true, liveRecite: true })).toEqual(recite);
    expect(linksFor('reader', { smartTracking: true, liveRecite: false })).toEqual([]);
    for (const s of recite) {
      expect(topicsFor(s, { smartTracking: true, liveRecite: false })).toEqual([]);
      expect(HELP[s].topics.every((t) => t.when === 'liveRecite')).toBe(true);
      // Each Recite sheet leads to the others.
      expect(linksFor(s, { smartTracking: true, liveRecite: true })).toEqual(recite.filter((r) => r !== s));
    }
    // A session's ⋯ help (Nov 17 2026): every Recite sheet but Test me's, which a session doesn't have.
    expect(linksFor('session', { smartTracking: true, liveRecite: true })).toEqual(['recite', 'reciteTake', 'reciteMemory']);
    expect(linksFor('session', { smartTracking: true, liveRecite: false })).toEqual([]);
    // A day's Recited block: from the day's help.
    expect(linksFor('day', { smartTracking: true, liveRecite: true })).toEqual(['reciteMemory']);
    expect(linksFor('day', { smartTracking: true, liveRecite: false })).toEqual([]);
  });

  it('Insights’ second sheet tells of Gaps, Last revised, Recitation and sections only where they are', () => {
    const more = (opts: Partial<HelpOpts>) => topicsFor('insightsMore', { smartTracking: true, ...opts }).map((t) => t.id);
    expect(more({})).toEqual([]);
    expect(linksFor('insights', { smartTracking: true })).toEqual([]);
    expect(more({ devApp: true })).toEqual(['insightsMore.gaps', 'insightsMore.lastRevised']);
    expect(more({ liveRecite: true })).toEqual(['insightsMore.recitation']);
    expect(more({ sections: true })).toEqual(['insightsMore.sections']);
    expect(linksFor('insights', { smartTracking: true, sections: true })).toEqual(['insightsMore']);
    expect(topicsFor('activity', { smartTracking: true, sections: true }).map((t) => t.id)).toContain('activity.sections');
    expect(topicsFor('activity', { smartTracking: true }).map((t) => t.id)).not.toContain('activity.sections');
  });

  it('the reader tells of Recite only with it (Revisely Dev), in place of its recording topic', () => {
    const ids = (liveRecite: boolean) => topicsFor('reader', { smartTracking: true, liveRecite }).map((t) => t.id);
    expect(ids(false)).toContain('reader.sitting');
    expect(ids(false)).not.toContain('reader.recite');
    expect(ids(true)).toContain('reader.recite');
    expect(ids(true)).not.toContain('reader.sitting');
  });

  it('Recite’s help says what Revisely Dev’s Recite does, and nothing it no longer does (Nov 15–16 2026)', () => {
    const recite: HelpScreen[] = ['recite', 'reciteTake', 'reciteMemory', 'reciteTest'];
    const text = recite.flatMap((s) => HELP[s].topics.map((t) => t.text)).join(' ');
    for (const said of [
      'anywhere', 'elsewhere in the Qur’an', 'Red', 'Amber', 'Violet', '{{Not clear}}', '{{Hear it}}', '{{Your recitation}}',
      '{{Not a mistake}}', '{{Put back}}', '{{Recite the mistakes again}}', '[[eye]]', '{{Delete this take}}', 'similar ayah',
      // Nov 16: the page put away, peeked words, past mistakes, a passage's progress, Activity's takes, Test me, voice search.
      'header and the bar away', 'grey', '{{Clear now}}', '{{Your progress}}', '{{Recited}}', '{{Show on the page}}',
      'Recite your 3 mistakes here', '{{Test me}}', '{{Test me again}}', 'Search by voice',
    ]) {
      expect(text).toContain(said);
    }
    // The old names and marks: the Check button, circles, a red ×.
    expect(text).not.toMatch(/\bCheck\b|circle|×/);
  });

  it('topic ids are unique and start with their screen', () => {
    const ids = topics.map((t) => t.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(topics.filter((t) => !t.id.startsWith(`${t.screen}.`)).map((t) => t.id)).toEqual([]);
  });

  it('keeps each topic short: about two sentences', () => {
    expect(topics.filter((t) => t.text.length > 170).map((t) => t.id)).toEqual([]);
  });

  it('names surahs and juz, never page numbers (NAME-1)', () => {
    expect(topics.filter((t) => /\bp{1,2}\.\s?\d|\bpages? \d/i.test(t.text)).map((t) => t.id)).toEqual([]);
  });

  it('says nothing about ratings or strength with Smart Tracking off', () => {
    const words = /\b(rat(e|ed|es|ing|ings)|weak|weaker|weakest|moderate|strong|strength)\b/i;
    const off = screens.flatMap((s) => topicsFor(s, { smartTracking: false, liveRecite: true }));
    expect(off.filter((t) => words.test(t.text) || words.test(t.title)).map((t) => t.id)).toEqual([]);
  });
});
