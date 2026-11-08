// Revo's first line by where it was opened (REVO-38), on the small account facts.test.ts works out by
// hand: Juz 30's first ten pages, two a day from Sunday Nov 1, asked on Saturday Nov 7. Sunday's two
// pages were revised on the day in 20 minutes; Monday's second page was caught up on Wednesday;
// Tuesday was missed; Friday's first page was revised ahead on Thursday. Today is 584–585, not started.
import type { RevisionLog, User, UserPage } from '../../../types';
import { recomputePagesFromLogs } from '../../algorithm';
import { plainText } from '../../passages';
import { todaySnapshot } from '../../todaySnapshot';
import { buildRevoContext } from '../context';
import { prepare, type FactSources } from '../facts';
import { nextPlaceOpens, readPlaceOpens } from '../greeting';
import { placeFacts, revoOpener, type PlaceFacts } from '../openers';
import { placeKey, resetRevoPlaceForTests, revoPlaceOf, setRevoActivityView, setRevoDayExtras, type RevoPlace } from '../place';
import { REVO_BUTTON_ROUTES } from '../availability';
import type { RevoContext, RevoDayFacts } from '../types';

const user = {
  id: 'u1',
  createdAt: '2026-10-01T12:00:00',
  scheduleAnchorDate: '2026-11-01T12:00:00',
  dailyPageCapacity: 2,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  customPlan: null,
  fajrBoundaryEnabled: false,
  locationCoords: null,
} as unknown as User;

const log = (date: string, pagesRevised: number[], extra: Partial<RevisionLog> = {}): RevisionLog => ({
  id: date,
  date,
  assignedPages: pagesRevised,
  pagesRevised,
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: null,
  ...extra,
});

const logs: RevisionLog[] = [
  log('2026-11-01', [582, 583], { durationMinutes: 20, weaknessUpdates: [{ page: 583, rating: 2 }] }),
  log('2026-11-02', [584], { assignedPages: [584, 585], pagesSkipped: [585], durationMinutes: 10 }),
  log('2026-11-04', [588, 589, 585], { assignedPages: [588, 589], ahead: { '2026-11-02': [585] }, durationMinutes: 12.4 }),
  log('2026-11-05', [590, 591, 582], { assignedPages: [590, 591], ahead: { '2026-11-06': [582] } }),
  log('2026-11-06', [583], { assignedPages: [582, 583], durationMinutes: 6 }),
];

const memorized: UserPage[] = Array.from({ length: 10 }, (_, i) => ({
  pageNumber: 582 + i,
  status: 'memorized',
  dateMemorized: i < 2 ? '2026-11-07T09:00:00' : '2026-09-01T09:00:00',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));
const pages = recomputePagesFromLogs(memorized, logs);
const TODAY = '2026-11-07';
const now = Date.parse('2026-11-07T10:00:00');
const snapshot = todaySnapshot({ user, pages, logs, day: TODAY, assignment: [584, 585], history: null, now });
const src: FactSources = { user, pages, logs, history: null, snapshot, now };
const ctx = buildRevoContext({ user, pages, logs, snapshot });

/** What Revo says opened from `place`, the `open`th time (0: the first), and its suggestions. */
function opened(place: RevoPlace, { open = 0, strength = true, context = ctx }: { open?: number; strength?: boolean; context?: RevoContext } = {}) {
  const facts = placeFacts(place, prepare(src), context, strength);
  const o = revoOpener('Majd', context, facts, open, { strength });
  return { text: plainText(o.text), chips: o.chips.map(plainText) };
}

const TODAY_NEXT = 'Today, An-Nazi\'at 16 to \'Abasa is next.';
/** Words no line may hold: a name left out, a page number alone. */
const BROKEN = /\s{2}|\bundefined\b|\bNaN\b|\bnull\b|\bpages? \d|\bp\. ?\d/;
const STRENGTH = /\b(weak|strong|strength|rated|rating)\b/i;

describe('Revo opened from a day in Activity (REVO-38)', () => {
  it('[REVO-38] a past day done on the day: its pages by surah, its minutes, its notes; then today’s next part', () => {
    const notes = { journal: [{ date: '2026-11-01', entries: [{ id: 'a', kind: 'note', text: 'Slow but steady' }, { id: 'b', kind: 'note', text: 'Revised after Fajr' }] }] };
    const { text, chips } = opened({ kind: 'day', day: '2026-11-01', extras: notes as never });
    expect(text).toBe(`Salaam Majd. On Sunday you revised both pages, An-Naba to An-Nazi'at 15, in 20 minutes, and wrote 2 notes. ${TODAY_NEXT}`);
    expect(chips).toEqual(['How did Sunday go?', 'How was my week?', 'Which days do I miss?']);
  });

  it('[REVO-38] a day whose pages were caught up later, or revised ahead, says so', () => {
    expect(opened({ kind: 'day', day: '2026-11-02' }).text).toBe(
      `Salaam Majd. On Monday, both pages, An-Nazi'at 16 to 'Abasa, were revised, 1 caught up later. ${TODAY_NEXT}`,
    );
    expect(opened({ kind: 'day', day: '2026-11-06' }).text).toBe(
      `Salaam Majd. Yesterday, both pages, An-Naba to An-Nazi'at 15, were revised, 1 revised ahead. ${TODAY_NEXT}`,
    );
  });

  it('[REVO-38] a missed day: its pages weren’t revised; catching up is offered only while it can be (three days)', () => {
    const missed = opened({ kind: 'day', day: '2026-11-03' });
    expect(missed.text).toBe(`Salaam Majd. Tuesday’s 2 pages, At-Takwir to Al-Mutaffifin 6, weren’t revised. ${TODAY_NEXT}`);
    expect(missed.chips).toEqual(['Which days do I miss?', 'How is my pace?', 'How was my week?']);
    // Two days ago, on a 28-page plan: catching up is still a question.
    const facts: RevoDayFacts = {
      daysAgo: 2,
      plan: { pages: 28, carried: 0, onDay: 0, ahead: 0, late: 0, notDone: 28, done: false },
      revised: { pages: 0, forLater: 0, forEarlier: 0 },
      minutes: null,
      readMinutes: null,
      memorized: { pages: 0 },
      ratings: { weak: 0, moderate: 0, strong: 0, weakPages: [] },
      recordings: null,
      notes: [],
    };
    const recent: PlaceFacts = { kind: 'day', day: '2026-11-05', today: TODAY, facts, plan: Array.from({ length: 28 }, (_, i) => 2 + i), revised: [] };
    const o = revoOpener(null, ctx, recent);
    expect(plainText(o.text)).toBe(`Salaam. Thursday’s 28 pages, Al-Baqarah, ayahs 1–190, weren’t revised. ${TODAY_NEXT}`);
    expect(o.chips.map(plainText)[0]).toBe('Can I still catch up Thursday?');
  });

  it('[REVO-38] a day ahead: how many pages and where they start; no today line, nothing said as done', () => {
    const { text, chips } = opened({ kind: 'day', day: '2026-11-08' });
    expect(text).toBe('Salaam Majd. Tomorrow is 2 pages, starting at At-Takwir.');
    expect(chips).toEqual(['Can I revise ahead?', 'How is my pace?']);
  });

  it('[REVO-38] a day long ago with nothing on it is named by its date', () => {
    expect(opened({ kind: 'day', day: '2026-10-20' }).text).toMatch(/^Salaam Majd\. Nothing was revised on Tuesday, October 20\. /);
  });

  it('[REVO-38] today’s own day opens on Home’s line, and counts its opens with Home', () => {
    expect(placeFacts({ kind: 'day', day: TODAY }, prepare(src), ctx, true)).toBeNull();
    expect(opened({ kind: 'day', day: TODAY }).text).toBe(opened({ kind: 'home' }).text);
    expect(placeKey({ kind: 'day', day: TODAY }, TODAY)).toBe('home');
    expect(placeKey({ kind: 'day', day: '2026-11-01' }, TODAY)).toBe('day:2026-11-01');
  });
});

describe('Revo opened from Activity’s Overview and Insights (REVO-38)', () => {
  it('[REVO-38] the Overview: the month so far, then today’s next part while today isn’t done', () => {
    const { text, chips } = opened({ kind: 'overview' });
    expect(text).toBe(`Salaam Majd. This month you’ve revised on 5 of 7 days, 10 pages in all. ${TODAY_NEXT}`);
    expect(chips).toEqual(['Which days do I miss?', 'How was my week?', 'How is my pace?']);
    const done = { ...ctx, today: { ...ctx.today, done: true } };
    expect(opened({ kind: 'overview' }, { context: done }).text).toBe('Salaam Majd. This month you’ve revised on 5 of 7 days, 10 pages in all.');
  });

  it('[REVO-38] Insights with Smart Tracking: the weak part left longest and when it was revised; opened again, coverage, then pace', () => {
    const first = opened({ kind: 'insights' });
    expect(first.text).toBe("Salaam Majd. An-Naba 31 to An-Nazi'at 15 is rated weak and was last revised yesterday. Want a short plan for it?");
    expect(first.chips).toEqual(["Plan An-Naba to An-Nazi'at", 'Which parts are weakest?', 'How is my pace?']);
    expect(opened({ kind: 'insights' }, { open: 1 }).text).toBe('Salaam Majd. In the last 30 days you’ve revised 80% of what you’ve memorized.');
    expect(opened({ kind: 'insights' }, { open: 2 }).text).toBe('Salaam Majd. Over the last 30 days you’ve revised less than a page a day, against a plan of 2.');
    expect(opened({ kind: 'insights' }, { open: 3 }).text).toBe(first.text);
  });

  it('[REVO-38] [REVO-36] Insights without Smart Tracking: the juz longest without coming round, nothing about strength', () => {
    expect(opened({ kind: 'insights' }, { strength: false }).text).toBe('Salaam Majd. Every juz you’ve memorized was revised in the last 7 days.');
    const stale: PlaceFacts = { kind: 'insights', weak: null, stalest: { juz: 4, daysAgo: 41, juzCount: 3 } };
    const o = revoOpener('Majd', ctx, stale, 0, { strength: false });
    expect(plainText(o.text)).toBe('Salaam Majd. Juz 4 hasn’t come round in 41 days, the longest of your juz.');
    expect(o.chips.map(plainText)).toEqual(['When does Juz 4 come round next?', 'Show my juz by last revised', 'How is my pace?']);
    for (let open = 0; open < 4; open++) {
      for (const place of [{ kind: 'insights' }, { kind: 'weakSpots' }, { kind: 'strength' }, { kind: 'juz', juz: 30 }] as RevoPlace[]) {
        const said = opened(place, { open, strength: false });
        expect(said.text).not.toMatch(STRENGTH);
        for (const c of said.chips) expect(c).not.toMatch(STRENGTH);
      }
    }
  });

  it('[REVO-38] Weak spots’ Ask Revo and Pages by strength: how many pages are weak, and where', () => {
    expect(opened({ kind: 'weakSpots' }).text).toBe('Salaam Majd. You have 1 weak page, in An-Naba. Ask about it, or I can plan it.');
    expect(opened({ kind: 'strength' }).text).toBe('Salaam Majd. 1 page is rated weak, in An-Naba.');
    const many: PlaceFacts = { kind: 'weak', from: 'strength', count: 6, mostIn: 'Al-Hashr', longest: [547, 548] };
    expect(plainText(revoOpener('Majd', ctx, many).text)).toBe('Salaam Majd. 6 pages are rated weak, most in Al-Hashr. The one left longest is Al-Hashr, ayahs 10–24.');
  });
});

describe('Revo opened from a juz sheet (REVO-38)', () => {
  it('[REVO-38] how much is memorized, how often it was revised in 30 days and when; its weak pages with Smart Tracking', () => {
    const { text, chips } = opened({ kind: 'juz', juz: 30 });
    expect(text).toBe('Salaam Majd. You’ve memorized 10 of Juz 30’s 23 pages, revised 5 times in the last 30 days, last yesterday. 1 of its pages is rated weak.');
    expect(chips).toEqual(['How is Juz 30 doing?', 'When does Juz 30 come round next?', 'Plan Juz 30’s weak pages']);
    expect(opened({ kind: 'juz', juz: 30 }, { strength: false }).text).toBe(
      'Salaam Majd. You’ve memorized 10 of Juz 30’s 23 pages, revised 5 times in the last 30 days, last yesterday.',
    );
    expect(opened({ kind: 'juz', juz: 29 }).text).toBe('Salaam Majd. You haven’t memorized any of Juz 29 yet.');
  });
});

describe('opened again from the same place (REVO-35, REVO-38)', () => {
  it('[REVO-38] the line’s second sentence takes turns; the line about the place stays', () => {
    const lines = [0, 1, 2, 3].map((open) => opened({ kind: 'juz', juz: 30 }, { open }).text);
    const lead = 'Salaam Majd. You’ve memorized 10 of Juz 30’s 23 pages, revised 5 times in the last 30 days, last yesterday.';
    for (const l of lines) expect(l.startsWith(lead)).toBe(true);
    expect(lines[1]).toBe(`${lead} It comes round next tomorrow, 2 pages.`);
    expect(lines[2]).toBe(`${lead} This week you’ve revised 10 pages on 5 days.`);
    expect(new Set(lines.slice(0, 3)).size).toBe(3);
    expect(opened({ kind: 'overview' }, { open: 1 }).text).toBe('Salaam Majd. This month you’ve revised on 5 of 7 days, 10 pages in all. This week you’ve revised 10 pages on 5 days.');
  });

  it('[REVO-38] each place counts its own opens: another place, day or juz starts afresh, and coming back counts on', () => {
    let rec = nextPlaceOpens(null, TODAY, 'home', 'todo:0');
    expect(rec.places.home.n).toBe(0);
    rec = nextPlaceOpens(rec, TODAY, 'overview', 'todo:0');
    expect(rec.places.overview.n).toBe(0);
    rec = nextPlaceOpens(rec, TODAY, 'home', 'todo:0');
    expect(rec.places.home.n).toBe(1); // "done" once a day: Home's count wasn't reset by the Overview
    rec = nextPlaceOpens(rec, TODAY, 'juz:30', 'todo:0');
    rec = nextPlaceOpens(rec, TODAY, 'juz:29', 'todo:0');
    expect(rec.places['juz:29'].n).toBe(0);
    rec = nextPlaceOpens(rec, TODAY, 'juz:30', 'todo:0');
    expect(rec.places['juz:30'].n).toBe(1);
    // Today changed: that place starts again; a new day starts every place again.
    expect(nextPlaceOpens(rec, TODAY, 'home', 'todo:2').places.home.n).toBe(0);
    expect(nextPlaceOpens(rec, '2026-11-08', 'juz:30', 'todo:0').places).toEqual({ 'juz:30': { state: 'todo:0', n: 0 } });
  });

  it('[REVO-38] a count stored before places is read back as Home’s; one that can’t be read starts again', () => {
    expect(readPlaceOpens({ day: TODAY, state: 'done', n: 2 })).toEqual({ day: TODAY, places: { home: { state: 'done', n: 2 } } });
    expect(readPlaceOpens({ day: TODAY, places: { home: { state: 'done', n: 1 }, bad: { n: 'x' } } })).toEqual({ day: TODAY, places: { home: { state: 'done', n: 1 } } });
    expect(readPlaceOpens(null)).toBeNull();
    expect(readPlaceOpens({ state: 'done' })).toBeNull();
  });

  it('[REVO-38] no line names an empty passage or a page number alone, from any place, on any open', () => {
    const places: RevoPlace[] = [
      { kind: 'home' },
      ...['2026-10-20', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-06', '2026-11-08', '2026-11-20'].map((day) => ({ kind: 'day' as const, day })),
      { kind: 'overview' },
      { kind: 'insights' },
      { kind: 'weakSpots' },
      { kind: 'strength' },
      { kind: 'juz', juz: 1 },
      { kind: 'juz', juz: 30 },
    ];
    for (const strength of [true, false]) {
      for (const place of places) {
        for (let open = 0; open < 4; open++) {
          const { text, chips } = opened(place, { open, strength });
          expect(text).not.toMatch(BROKEN);
          for (const c of chips) expect(c).not.toMatch(BROKEN);
          expect(chips.length).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});

describe('where Revo is opened from (REVO-38) and where its button shows (REVO-25)', () => {
  afterEach(resetRevoPlaceForTests);

  it('[REVO-38] the screen in front: Activity’s tab on show, the day in its route, Pages by strength; anywhere else, Home', () => {
    expect(revoPlaceOf({ name: 'Activity' })).toEqual({ kind: 'overview' });
    setRevoActivityView('insights');
    expect(revoPlaceOf({ name: 'Activity' })).toEqual({ kind: 'insights' });
    expect(revoPlaceOf({ name: 'ActivityDay', params: { date: '2026-11-01' } })).toEqual({ kind: 'day', day: '2026-11-01' });
    setRevoDayExtras('2026-11-01', { journal: [], readings: [] });
    expect(revoPlaceOf({ name: 'ActivityDay', params: { date: '2026-11-01' } })).toEqual({ kind: 'day', day: '2026-11-01', extras: { journal: [], readings: [] } });
    // What another day's screen loaded never goes with this one.
    expect(revoPlaceOf({ name: 'ActivityDay', params: { date: '2026-11-02' } })).toEqual({ kind: 'day', day: '2026-11-02' });
    setRevoDayExtras('2026-11-01', null);
    expect(revoPlaceOf({ name: 'ActivityDay', params: { date: '2026-11-01' } })).toEqual({ kind: 'day', day: '2026-11-01' });
    expect(revoPlaceOf({ name: 'ActivityDay', params: { date: 'soon' } })).toEqual({ kind: 'home' });
    expect(revoPlaceOf({ name: 'PagesByStrength' })).toEqual({ kind: 'strength' });
    for (const name of ['Dashboard', 'ActivityAll', 'Settings']) expect(revoPlaceOf({ name })).toEqual({ kind: 'home' });
    expect(revoPlaceOf(null)).toEqual({ kind: 'home' });
  });

  it('[REVO-25] the button shows on Home and Activity’s screens, never on the Read tab, in a session, an editor or Settings', () => {
    expect([...REVO_BUTTON_ROUTES].sort()).toEqual(['Activity', 'ActivityAll', 'ActivityDay', 'Dashboard', 'PagesByStrength']);
    for (const name of ['ReadIndex', 'QuranReader', 'ActiveRevision', 'PlanEdit', 'PlanDayEdit', 'Memorization', 'Settings', 'JournalEntry']) {
      expect(REVO_BUTTON_ROUTES.has(name)).toBe(false);
    }
  });
});
