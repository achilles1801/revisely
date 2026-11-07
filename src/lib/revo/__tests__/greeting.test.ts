import { plainText } from '../../passages';
import { pagesLabel, revoChips, revoGreeting } from '../greeting';
import type { RevoContext } from '../types';

const ctx = (today: Partial<RevoContext['today']>, extra: Partial<RevoContext> = {}): RevoContext => ({
  passages: {},
  pageNames: {},
  totals: {
    memorizedPages: 100,
    revisedWithin7Days: 40,
    revisedWithin30Days: 90,
    daysWithSession30: 26,
    streakDays: 12,
    sessions30: 28,
    weakPages: 6,
    moderatePages: 20,
    strongPages: 74,
    weakRevisedLast7Days: 2,
    pagesPerDay7: 18.6,
    pagesPerDay30: 17.2,
    plannedPerDay: 20,
  },
  today: { plannedPages: 20, revisedPages: 0, carriedPages: 0, doneEarlier: 0, otherPages: 0, minutes: 0, memorizedPages: 0, nextPages: [], weakNext: [], done: false, ...today },
  weakPages: [548, 549],
  week: [],
  streak: { days: 12, atRisk: null },
  localTime: '21:41',
  ...extra,
}) as RevoContext;
/** The greeting as plain text (the screen's no-break hyphens and spaces as ordinary ones). */
const said = (name: string | null, c: RevoContext) => plainText(revoGreeting(name, c));
const chips = (c: RevoContext) => revoChips(c).map(plainText);

describe('pagesLabel', () => {
  it('joins runs of pages', () => {
    expect(pagesLabel([548])).toBe('p. 548');
    expect(pagesLabel([549, 548])).toBe('p. 548–549');
    expect(pagesLabel([12, 40, 41, 42])).toBe('p. 12, 40–42');
    expect(pagesLabel([])).toBe('');
  });
});

describe('Revo’s greeting (REVO-20)', () => {
  it('[REVO-20] part way through, with weak pages next: by surah, never page numbers', () => {
    const c = ctx({ revisedPages: 6, nextPages: [548, 549, 550], weakNext: [548, 549] });
    expect(said('Maryam', c)).toBe(
      'Salaam Maryam. You’re 6 pages into today, and Al-Hashr 17 to Al-Mumtahanah 5 is next. It’s rated weak. Want a short plan for it?',
    );
    expect(chips(c)).toEqual(['Plan Al-Hashr to Al-Mumtahanah', 'How was my week?', 'How is my pace?']);
  });

  it('[REVO-20] not started: where today starts, by surah; the weak part named', () => {
    const c = ctx({ nextPages: [301, 302], weakNext: [302] });
    expect(said('Maryam', c)).toBe(
      'Salaam Maryam. Today is 20 pages, starting at Al-Kahf, ayah 62. Al-Kahf, ayahs 75–83 is rated weak. Want a short plan for it?',
    );
  });

  it('[REVO-20] done, nothing planned, no name', () => {
    expect(said('Maryam', ctx({ done: true, revisedPages: 20 }))).toBe(
      'Salaam Maryam. Today’s 20 pages are done. That’s a 12-day streak. Ask me anything about your revision.',
    );
    expect(said(null, ctx({ plannedPages: 0 }))).toBe(
      'Salaam. Nothing is planned for today. Ask me about your progress, your weak spots or your plan.',
    );
    expect(chips(ctx({ done: true }))).toEqual(['Which parts are weakest?', 'How was my week?', 'What should I revise next?']);
  });
});
