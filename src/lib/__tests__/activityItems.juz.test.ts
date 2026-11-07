// Juz-plan sessions that revised whole juz are named by the juz (lib/pageRanges describeRevised).
import { buildActivityItems, ownRevised, revisionItem } from '../activityItems';
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
    expect(item.detail).toBe('Pages 1–21 · 41 min · Juz 1');
    expect(item.title).toBe('Revised 21 pages');
    expect(item.search).toContain(' juz 1');
    expect(item.search).toContain(' al baqarah'); // the surahs can still be searched
  });

  it('two whole juz: "Juz 1–2"', () => {
    const pages = [...juz(1), ...juz(2)];
    expect(revisionItem(log({ assignedPages: pages, pagesRevised: pages }), { juzPlan: true }).detail).toContain(
      '· Juz 1–2',
    );
  });

  it('a page of the juz skipped: the surahs', () => {
    const revised = juz(1).slice(1);
    const item = revisionItem(log({ assignedPages: juz(1), pagesRevised: revised, pagesSkipped: [1] }), {
      juzPlan: true,
    });
    expect(item.detail).toContain('Al-Fatihah to Al-Baqarah');
    expect(item.detail).not.toContain('Juz');
  });

  it('pages revised ahead for a later day count toward that day, not the session’s own juz', () => {
    // Today's juz 1, plus juz 2 revised ahead for tomorrow: today's item says Juz 1, the ahead items Juz 2.
    const l = log({ assignedPages: juz(1), pagesRevised: [...juz(1), ...juz(2)], ahead: { '2026-11-05': juz(2) } });
    expect(ownRevised(l)).toEqual(juz(1));
    const items = buildActivityItems({ logs: [l] }, juzUser);
    expect(items.find((i) => i.key === 'revision-l1')?.detail).toContain('· Juz 1');
    expect(items.find((i) => i.key === 'ahead-from-l1-2026-11-05')?.detail).toBe('Pages 22–41 · Juz 2');
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
    expect(items[0].detail).toBe('Pages 1–21 · 41 min · Al-Fatihah to Al-Baqarah');
    expect(revisionItem(log({ assignedPages: juz(1), pagesRevised: juz(1) })).detail).toContain(
      'Al-Fatihah to Al-Baqarah',
    );
  });
});
