// The help in Arabic (topics.ar.ts): an entry only for a topic or sheet the help has, each translated from the English
// the app holds now (`from`), its {{labels}} the Arabic app's own text and its [[icons]] the English topic's.
//
// When a topic's English changes, the check below names it: redo its Arabic in src/lib/help/topics.ar.ts (and its
// `from`, which the failure prints), or delete the entry, and the English shows until it is translated again.

import { createHash } from 'crypto';
import { HELP, helpPlainText, helpTitle, topicsFor, type HelpScreen } from '../topics';
import { HELP_TITLES_AR, HELP_TOPICS_AR } from '../topics.ar';
import { ar } from '../../../i18n/ar';
import { i18n } from '../../../i18n';

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const topics = Object.values(HELP).flatMap((e) => e.topics);
const byId = new Map(topics.map((t) => [t.id, t]));
const labelsOf = (text: string) => [...text.matchAll(/\{\{(.+?)\}\}/g)].map((m) => m[1]);
const iconsOf = (text: string) => [...text.matchAll(/\[\[([a-z]+)\]\]/g)].map((m) => m[1]).sort();
const strings = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];

/** Labels whose Arabic UI text hasn't arrived yet (none: Activity's Arabic brought the last three). */
const LABELS_PENDING = new Set<string>([]);

describe('the help in Arabic', () => {
  it('has entries only for topics and sheets the help has', () => {
    expect(Object.keys(HELP_TOPICS_AR).filter((id) => !byId.has(id))).toEqual([]);
    expect(Object.keys(HELP_TITLES_AR).filter((s) => !(s in HELP))).toEqual([]);
    expect(Object.entries(HELP_TOPICS_AR).filter(([, a]) => !a.text).map(([id]) => id)).toEqual([]);
  });

  it('was translated from the English the help holds now', () => {
    const stale: string[] = [];
    for (const [id, a] of Object.entries(HELP_TOPICS_AR)) {
      const t = byId.get(id);
      const now = t && hash(`${t.title}\n${t.text}`);
      if (now && a.from !== now) stale.push(`${id}: its English changed (from: '${now}')`);
    }
    for (const [screen, a] of Object.entries(HELP_TITLES_AR)) {
      const now = hash(HELP[screen as HelpScreen].title);
      if (a && a.from !== now) stale.push(`sheet ${screen}: its title changed (from: '${now}')`);
    }
    // Redo the Arabic (and its `from`) in src/lib/help/topics.ar.ts, or delete the entry.
    expect(stale).toEqual([]);
  });

  it('{{labels}} are the Arabic app’s own text, word for word, and [[icons]] the English topic’s', () => {
    const shown = strings(ar);
    const missing = Object.entries(HELP_TOPICS_AR).flatMap(([id, a]) =>
      labelsOf(a.text ?? '')
        .filter((l) => !LABELS_PENDING.has(l) && !shown.includes(l))
        .map((l) => `${id}: ${l}`),
    );
    expect(missing).toEqual([]);
    // Once the Arabic has them, a pending label leaves the list.
    expect([...LABELS_PENDING].filter((l) => shown.includes(l))).toEqual([]);
    const icons = Object.entries(HELP_TOPICS_AR)
      .filter(([id, a]) => iconsOf(a.text ?? '').join() !== iconsOf(byId.get(id)?.text ?? '').join())
      .map(([id]) => id);
    expect(icons).toEqual([]);
  });

  it('is written as the glossary asks: no tatweel, no chevrons, Arabic punctuation', () => {
    const bad = Object.entries(HELP_TOPICS_AR).flatMap(([id, a]) =>
      [a.title, a.text ?? ''].flatMap((s) => {
        const plain = s.replace(/\{\{.+?\}\}|\[\[[a-z]+\]\]/g, '');
        return [/ـ/.test(plain) && 'tatweel', /[›‹]/.test(plain) && 'chevron', /[,;?]/.test(plain) && 'Latin punctuation']
          .filter(Boolean)
          .map((why) => `${id}: ${why}`);
      }),
    );
    expect(bad).toEqual([]);
  });

  it('shows in the app’s language: Arabic when the app is in Arabic, English otherwise', async () => {
    expect(helpTitle('home')).toBe(HELP.home.title);
    expect(topicsFor('home', { smartTracking: true })[0].title).toBe(HELP.home.topics[0].title);
    await i18n.changeLanguage('ar');
    try {
      expect(helpTitle('home')).toBe(HELP_TITLES_AR.home?.title);
      const home = topicsFor('home', { smartTracking: true });
      // Every topic but the beginner path's (an account on today's path never sees it).
      expect(home.map((t) => t.id)).toEqual(HELP.home.topics.filter((t) => t.when !== 'beginner').map((t) => t.id));
      expect(home[0].text).toBe(HELP_TOPICS_AR['home.today'].text);
      // VoiceOver says the icons in Arabic.
      expect(helpPlainText('[[mic]] {{متابعة التلاوة}}')).toBe('الميكروفون متابعة التلاوة');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
