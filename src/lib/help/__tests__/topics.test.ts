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

import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { HELP, HELP_INLINE_ICONS, helpTextParts, MAX_TOPICS, topicsFor, type HelpScreen } from '../topics';

const ROOT = join(__dirname, '../../../..');
const REVIEWED = join(__dirname, '../reviewed.json');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Each rule's text: its bullet and the indented lines under it, whitespace folded (re-wrapping isn't a change). */
export function ruleTexts(spec: string): Map<string, string> {
  const rules = new Map<string, string>();
  let id: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (id) rules.set(id, lines.join(' ').replace(/\s+/g, ' ').trim());
    id = null;
    lines = [];
  };
  for (const line of spec.split('\n')) {
    const start = /^- \*\*([A-Z]+-\d+)\.\*\*/.exec(line);
    if (start) {
      flush();
      id = start[1];
      lines = [line];
    } else if (id && /^\s+\S/.test(line)) {
      lines.push(line);
    } else {
      flush();
    }
  }
  flush();
  return rules;
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

const rules = ruleTexts(read('BEHAVIOUR.md'));
const screens = Object.keys(HELP) as HelpScreen[];
const topics = screens.flatMap((s) => HELP[s].topics.map((t) => ({ screen: s, ...t })));

/** The app's source, comments and the help itself left out: a label must be text the app shows. */
function appSource(): string {
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === '__tests__' || p === 'src/lib/help' ? [] : walk(p);
      return /\.tsx?$/.test(e.name) ? [p] : [];
    });
  const uncommented = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  return walk('src').map((f) => uncommented(read(f))).join('\n');
}

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
  it(`shows at most ${MAX_TOPICS} topics a screen, with Smart Tracking on or off, the hidden page offered or not`, () => {
    for (const s of screens) {
      for (const smartTracking of [true, false]) {
        for (const recite of [true, false]) {
          const n = topicsFor(s, { smartTracking, recite }).length;
          expect(n).toBeLessThanOrEqual(MAX_TOPICS);
          expect(n).toBeGreaterThan(0);
        }
      }
    }
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
    const off = screens.flatMap((s) => topicsFor(s, { smartTracking: false, recite: true }));
    expect(off.filter((t) => words.test(t.text) || words.test(t.title)).map((t) => t.id)).toEqual([]);
  });
});
