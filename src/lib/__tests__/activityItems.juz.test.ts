// Juz-plan sessions that revised whole juz are named by the juz (lib/passages describeSession, SESS-5);
// every item names its pages by surah and juz, never by page number.
import { buildActivityItems, ownRevised, revisionItem } from '../activityItems';
import { plainText } from '../passages';
import { getPagesForJuz } from '../quranData';
import type { RevisionLog, User } from '../../types';

const juz = (n: number) => getPagesForJuz(n);
const log = (extra: Partial<RevisionLog>): RevisionLog => ({
  id: 'l1',
  date: '2026-11-04',
  pagesRevised: [],
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: 41,
  ...extra,
});
const juzUser = { scheduleMode: 'juz' } as User;
const pagesUser = { scheduleMode: 'pages' } as User;

describe('Activity names a juz-plan session of whole juz by the juz', () => {
  it('a whole juz revised: "Juz 1" in place of the surahs', () => {
    const item = revisionItem(log({ assignedPages: juz(1), pagesRevised: juz(1) }), { juzPlan: true });
    expect(plainText(item.detail)).toBe('Juz 1 · 41 min');
    expect(item.title).toBe('Revised 21 pages');
    expect(item.search).toContain(' juz 1');
    expect(item.search).toContain(' al baqarah'); // the surahs can still be searched
    expect(item.search).toContain(' pages 1 21'); // and the page numbers, though not shown
  });

  it('two whole juz: "Juz 1–2"', () => {
    const pages = [...juz(1), ...juz(2)];
    expect(plainText(revisionItem(log({ assignedPages: pages, pagesRevised: pages }), { juzPlan: true }).detail)).toBe(
      'Juz 1–2 · 41 min',
    );
  });

  it('a page of the juz skipped: the surahs', () => {
    const revised = juz(1).slice(1);
    const item = revisionItem(log({ assignedPages: juz(1), pagesRevised: revised, pagesSkipped: [1] }), {
      juzPlan: true,
    });
    expect(plainText(item.detail)).toBe('Al-Fatihah to Al-Baqarah · 41 min');
    expect(item.detail).not.toContain('Juz');
  });

  it('pages revised ahead for a later day count toward that day, not the session’s own juz', () => {
    // Today's juz 1, plus juz 2 revised ahead for tomorrow: today's item says Juz 1, the ahead items Juz 2.
    const l = log({ assignedPages: juz(1), pagesRevised: [...juz(1), ...juz(2)], ahead: { '2026-11-05': juz(2) } });
    expect(ownRevised(l)).toEqual(juz(1));
    const items = buildActivityItems({ logs: [l] }, juzUser);
    expect(plainText(items.find((i) => i.key === 'revision-l1')!.detail)).toBe('Juz 1 · 41 min');
    expect(plainText(items.find((i) => i.key === 'ahead-from-l1-2026-11-05')!.detail)).toBe('Juz 2');
    // DAY-9: nothing on the later day itself (it hasn't started when they were revised).
    expect(items.find((i) => i.key === 'ahead-to-l1-2026-11-05')).toBeUndefined();
  });

  it('a day whose juz was partly credited ahead earlier: this session revised only the rest, so the surahs', () => {
    const rest = juz(2).slice(5);
    const item = buildActivityItems({ logs: [log({ assignedPages: juz(2), pagesRevised: rest })] }, juzUser)[0];
    expect(item.detail).not.toContain('Juz');
  });

  it('on the pages plan, a whole juz still reads as its surahs', () => {
    const items = buildActivityItems({ logs: [log({ assignedPages: juz(1), pagesRevised: juz(1) })] }, pagesUser);
    expect(plainText(items[0].detail)).toBe('Al-Fatihah to Al-Baqarah · 41 min');
    expect(plainText(revisionItem(log({ assignedPages: juz(1), pagesRevised: juz(1) })).detail)).toBe(
      'Al-Fatihah to Al-Baqarah · 41 min',
    );
  });

  it('never a page number: part of a surah by its ayahs, a reading and a recording by their surahs', () => {
    const part = revisionItem(log({ assignedPages: [22, 23, 24, 25, 26], pagesRevised: [22, 23, 24, 25, 26] }));
    expect(plainText(part.detail)).toBe('Al-Baqarah 142–176 · 41 min');
    const start = revisionItem(log({ assignedPages: [2, 3, 4], pagesRevised: [2, 3, 4], durationMinutes: 0 }));
    expect(plainText(start.detail)).toBe('Start of Al-Baqarah');
    const items = buildActivityItems(
      {
        logs: [],
        recordings: [{ id: 'r1', day: '2026-11-04', createdAt: 1, durationMs: 61000, kind: 'revision', pageMarks: [{ page: 560 }, { page: 561 }] }],
      },
      pagesUser,
    );
    expect(plainText(items[0].detail)).toBe('At-Tahrim · During revision');
    for (const i of [part, start, items[0]]) expect(i.detail).not.toMatch(/\bpages? \d|\bpp?\. \d/i);
  });
});
