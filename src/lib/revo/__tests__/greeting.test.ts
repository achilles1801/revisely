import { plainText } from '../../passages';
import { greetingState, nextOpens, pagesLabel, revoChips, revoGreeting } from '../greeting';
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

describe('a day with nothing left to revise (REVO-20)', () => {
  it('[REVO-20] all 28 pages revised but the day not marked done: today is done, never "and  is next"', () => {
    const c = ctx({ plannedPages: 28, revisedPages: 28, nextPages: [], done: false });
    expect(said('Majd', c)).toBe('Salaam Majd. Today’s 28 pages are done. That’s a 12-day streak. Ask me anything about your revision.');
    expect(greetingState(c)).toBe('done');
    // Opened again: what's ahead, as on any done day.
    expect(plainText(revoGreeting('Majd', c, 1))).not.toMatch(/is next|\s{2}/);
  });

  it('[REVO-20] nothing revised here but nothing left either (done earlier): done, never "starting at" nothing', () => {
    const c = ctx({ plannedPages: 5, revisedPages: 0, doneEarlier: 5, nextPages: [], done: false });
    expect(said(null, c)).toBe('Salaam. Today’s 5 pages are done. That’s a 12-day streak. Ask me anything about your revision.');
  });
});

describe('Revo’s greeting opened again (REVO-35)', () => {
  const week = [
    { day: '2026-10-28', pages: 20, planned: 20, done: true },
    { day: '2026-10-29', pages: 0, planned: 20, done: false },
    { day: '2026-10-30', pages: 18, planned: 20, done: false },
    { day: '2026-10-31', pages: 20, planned: 20, done: true },
    { day: '2026-11-01', pages: 20, planned: 20, done: true },
    { day: '2026-11-02', pages: 20, planned: 20, done: true },
    { day: '2026-11-03', pages: 20, planned: 20, done: true },
  ];
  const doneCtx = ctx({ done: true, revisedPages: 20 }, { week, weakPages: [548, 549, 12] });
  const next = { lead: 'Tomorrow', first: 562, pages: 20 };
  const say = (open: number, c = doneCtx, extras: Parameters<typeof revoGreeting>[3] = { doneCount: 20, next }) => plainText(revoGreeting('Majd', c, open, extras));
  const chipsAt = (open: number, c = doneCtx, extras: Parameters<typeof revoChips>[2] = { doneCount: 20, next }) => revoChips(c, open, extras).map(plainText);

  it('[REVO-35] counts opens per day and state: the same again counts on, a change or a new day starts again', () => {
    let rec = nextOpens(null, '2026-11-03', 'todo:6');
    expect(rec).toEqual({ day: '2026-11-03', state: 'todo:6', n: 0 });
    rec = nextOpens(rec, '2026-11-03', 'todo:6');
    expect(rec.n).toBe(1);
    rec = nextOpens(rec, '2026-11-03', 'done');
    expect(rec.n).toBe(0);
    rec = nextOpens(rec, '2026-11-03', 'done');
    rec = nextOpens(rec, '2026-11-03', 'done');
    expect(rec.n).toBe(2);
    expect(nextOpens(rec, '2026-11-04', 'done').n).toBe(0);
    expect(greetingState(ctx({ revisedPages: 6, nextPages: [7, 8] }))).toBe('todo:6');
    expect(greetingState(doneCtx)).toBe('done');
    expect(greetingState(ctx({ plannedPages: 0 }))).toBe('none');
  });

  it('[REVO-35] today done: "done" on the first open only, then tomorrow, a weak part, the week and the memorized share in turn', () => {
    expect(say(0)).toBe('Salaam Majd. Today’s 20 pages are done. That’s a 12-day streak. Ask me anything about your revision.');
    const later = [1, 2, 3, 4, 5].map((n) => say(n));
    expect(later).toEqual([
      'Salaam Majd. Tomorrow starts at Al-Mulk, 20 pages.',
      'Salaam Majd. Al-Hashr 17 to Al-Mumtahanah 5 is rated weak. Want a short plan for it?',
      'Salaam Majd. This week you’ve revised 118 pages on 6 days.',
      'Salaam Majd. You’ve memorized 16.6% of the Quran.',
      'Salaam Majd. Tomorrow starts at Al-Mulk, 20 pages.',
    ]);
    for (const line of later) expect(line).not.toMatch(/done/);
    // Two opens in a row never say the same.
    for (let n = 1; n < 12; n++) expect(say(n)).not.toBe(say(n + 1));
  });

  it('[REVO-35] the suggestions follow what the greeting leads with', () => {
    expect(chipsAt(0)).toEqual(['Which parts are weakest?', 'How was my week?', 'What should I revise next?']);
    expect(chipsAt(1)).toEqual(['How do I revise ahead?', 'Which parts are weakest?', 'How was my week?']);
    expect(chipsAt(2)).toEqual(['Plan Al-Hashr to Al-Mumtahanah', 'Which parts are weakest?', 'How was my week?']);
    expect(chipsAt(3)).toEqual(['How was my week?', 'Which parts are weakest?', 'What should I revise next?']);
  });

  it('[REVO-35] [REVO-26] the done count is Home’s "Done · N", pages revised beyond the plan included', () => {
    expect(say(0, doneCtx, { doneCount: 26, next })).toBe('Salaam Majd. Today is done, with 26 pages revised. That’s a 12-day streak. Ask me anything about your revision.');
    // An app without the count says the plan's.
    expect(plainText(revoGreeting(null, doneCtx, 0))).toBe('Salaam. Today’s 20 pages are done. That’s a 12-day streak. Ask me anything about your revision.');
  });

  it('[REVO-35] with nothing ahead to say, a done day still doesn’t repeat "done"', () => {
    const bare = ctx({ done: true, revisedPages: 5, plannedPages: 5 }, { weakPages: [], week: [], totals: { ...doneCtx.totals, memorizedPages: 0, streakDays: 0 } });
    expect(plainText(revoGreeting(null, bare, 0))).toBe('Salaam. Today’s 5 pages are done. Ask me anything about your revision.');
    expect(plainText(revoGreeting(null, bare, 1))).toBe('Salaam. Ask me anything about your revision.');
  });

  it('[REVO-35] not done: today’s line every time (it is the moment); a second open with nothing changed changes what follows it', () => {
    const c = ctx({ revisedPages: 6, nextPages: [548, 549, 550], weakNext: [548, 549] }, { week });
    expect(say(0, c, {})).toBe('Salaam Majd. You’re 6 pages into today, and Al-Hashr 17 to Al-Mumtahanah 5 is next. It’s rated weak. Want a short plan for it?');
    expect([1, 2, 3].map((n) => say(n, c, {}))).toEqual([
      'Salaam Majd. You’re 6 pages into today, and Al-Hashr 17 to Al-Mumtahanah 5 is next. This week you’ve revised 118 pages on 6 days.',
      'Salaam Majd. You’re 6 pages into today, and Al-Hashr 17 to Al-Mumtahanah 5 is next. You’ve memorized 16.6% of the Quran.',
      'Salaam Majd. You’re 6 pages into today, and Al-Hashr 17 to Al-Mumtahanah 5 is next. You’re on a 12-day streak.',
    ]);
    // The weak part's plan stays the first suggestion while it is next.
    expect(chipsAt(1, c, {})).toEqual(['How was my week?', 'Plan Al-Hashr to Al-Mumtahanah', 'How is my pace?']);
  });

  it('[REVO-35] nothing planned: the same line once, then something from the account', () => {
    const none = ctx({ plannedPages: 0 }, { week });
    expect(say(0, none, {})).toBe('Salaam Majd. Nothing is planned for today. Ask me about your progress, your weak spots or your plan.');
    expect(say(1, none, {})).toBe('Salaam Majd. Al-Hashr 17 to Al-Mumtahanah 5 is rated weak. Want a short plan for it?');
    expect(say(2, none, {})).toBe('Salaam Majd. This week you’ve revised 118 pages on 6 days.');
  });
});

describe('Revo’s greeting without Smart Tracking (REVO-35)', () => {
  it('[REVO-35] says nothing about strength: no "rated weak" on any open, and no weak suggestion', () => {
    const notDone = ctx({ revisedPages: 6, nextPages: [548, 549, 550], weakNext: [548, 549] });
    const done = ctx({ done: true, revisedPages: 20 });
    const off = { strength: false, doneCount: 20, next: { lead: 'Tomorrow', first: 562, pages: 20 } };
    const lines = [0, 1, 2, 3, 4].flatMap((n) => [revoGreeting('Majd', notDone, n, off), revoGreeting('Majd', done, n, off)]).map(plainText);
    for (const line of lines) expect(line).not.toMatch(/weak/i);
    expect(plainText(revoGreeting('Majd', notDone, 0, off))).toBe(
      'Salaam Majd. You’re 6 pages into today, and Al-Hashr 17 to Al-Mumtahanah 5 is next. Ask me anything about your revision.',
    );
    const chips = [0, 1, 2, 3].flatMap((n) => [...revoChips(notDone, n, off), ...revoChips(done, n, off)]);
    expect(chips.filter((c) => /weak|^Plan /.test(c))).toEqual([]);
  });
});
