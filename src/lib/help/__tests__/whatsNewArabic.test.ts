// What's new in Arabic (whatsNew.ar.ts): an entry only for a card or row a release has, each translated from the
// English the app holds now (`from`), its {{labels}} the Arabic app's own text and its [[icons]] the English card's.
//
// When a card's English changes, the check below names it: redo its Arabic in src/lib/help/whatsNew.ar.ts (and its
// `from`, which the failure prints), or delete the entry, and the English shows until it is translated again.

import { createHash } from 'crypto';
import { ALL_RELEASES, cardsFor, whatsNewPlainText } from '../whatsNew';
import { WHATS_NEW_AR } from '../whatsNew.ar';
import { ar } from '../../../i18n/ar';
import { i18n } from '../../../i18n';

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const english = new Map<string, { title: string; text?: string }>();
for (const r of ALL_RELEASES) {
  for (const c of r.cards) {
    english.set(`${r.id}/${c.id}`, c);
    for (const row of c.rows ?? []) english.set(`${r.id}/${c.id}/${row.id}`, row);
  }
}
const labelsOf = (text: string) => [...text.matchAll(/\{\{(.+?)\}\}/g)].map((m) => m[1]);
const iconsOf = (text: string) => [...text.matchAll(/\[\[([a-z]+)\]\]/g)].map((m) => m[1]).sort();
const strings = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];

describe('What’s new in Arabic', () => {
  it('has entries only for cards and rows the releases have, words where the English has words', () => {
    expect(Object.keys(WHATS_NEW_AR).filter((k) => !english.has(k))).toEqual([]);
    const shape = Object.entries(WHATS_NEW_AR).filter(([k, a]) => (english.get(k)?.text == null) !== (a.text == null));
    expect(shape.map(([k]) => k)).toEqual([]);
  });

  it('was translated from the English the releases hold now', () => {
    const stale: string[] = [];
    for (const [k, a] of Object.entries(WHATS_NEW_AR)) {
      const e = english.get(k);
      const now = e && hash(e.text == null ? e.title : `${e.title}\n${e.text}`);
      if (now && a.from !== now) stale.push(`${k}: its English changed (from: '${now}')`);
    }
    // Redo the Arabic (and its `from`) in src/lib/help/whatsNew.ar.ts, or delete the entry.
    expect(stale).toEqual([]);
  });

  it('{{labels}} are the Arabic app’s own text, word for word, and [[icons]] the English card’s', () => {
    const shown = strings(ar);
    const missing = Object.entries(WHATS_NEW_AR).flatMap(([k, a]) =>
      labelsOf(a.text ?? '').filter((l) => !shown.includes(l)).map((l) => `${k}: ${l}`),
    );
    expect(missing).toEqual([]);
    const icons = Object.entries(WHATS_NEW_AR)
      .filter(([k, a]) => iconsOf(a.text ?? '').join() !== iconsOf(english.get(k)?.text ?? '').join())
      .map(([k]) => k);
    expect(icons).toEqual([]);
  });

  it('is written as the glossary asks: no tatweel, no chevrons, Arabic punctuation, Latin only in isolates', () => {
    const bad = Object.entries(WHATS_NEW_AR).flatMap(([k, a]) =>
      [a.title, a.text ?? ''].flatMap((s) => {
        const plain = s.replace(/\{\{.+?\}\}|\[\[[a-z]+\]\]/g, '').replace(/⁨[^⁩]*⁩/g, '');
        return [
          /ـ/.test(plain) && 'tatweel',
          /[›‹]/.test(plain) && 'chevron',
          /[,;?]/.test(plain) && 'Latin punctuation',
          /[A-Za-z]/.test(plain) && 'Latin outside an isolate',
        ]
          .filter(Boolean)
          .map((why) => `${k}: ${why}`);
      }),
    );
    expect(bad).toEqual([]);
  });

  it('shows in the app’s language: Arabic when the app is in Arabic, English otherwise', async () => {
    const release = ALL_RELEASES[0];
    const all = () => true;
    expect(cardsFor(release, all)[0].title).toBe(release.cards[0].title);
    await i18n.changeLanguage('ar');
    try {
      const cards = cardsFor(release, all);
      expect(cards.map((c) => c.id)).toEqual(release.cards.map((c) => c.id));
      expect(cards[0].title).toBe(WHATS_NEW_AR[`${release.id}/${release.cards[0].id}`].title);
      const more = cards.find((c) => c.rows);
      expect(more?.rows?.[0].title).toBe(WHATS_NEW_AR[`${release.id}/${more?.id}/${more?.rows?.[0].id}`].title);
      expect(whatsNewPlainText('[[revo]]')).toBe('شعار ⁨Revo⁩');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
