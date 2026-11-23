// The test scenarios are built on the server (functions/src/testScenarios.ts),
// which can't import the app: the few app rules it needs are ported there. Each
// port is checked here against the app's own code, so a change to one without
// the other fails.
import fs from 'fs';
import path from 'path';
import {
  JUZ_RANGES,
  SCENARIO_IDS,
  addDays,
  buildScenario,
  calendarDay,
  juzKeyForPage as serverJuzKey,
  parseContext,
  plannedPages,
  readItemFor as serverReadItem,
  revisionDayAt,
  revisionItemsFor as serverRevisionItems,
  scenarioDocuments,
  wallMs,
} from '../../../functions/src/testScenarios';
import { SILENCE_M4A_BASE64 } from '../../../functions/src/silence';
import { PAGE_FIRST_WORD, SLIPS, SURAH_VERSES, TAKE_PAGES, VERSE_WORDS } from '../../../functions/src/scenarioQuran';
import { ayahOfWord, pageWords, wordText } from '../../../functions/src/scenarioTakes';
import { QuranWords, type QuranWordsData } from '../recite/quranWords';
import { fromStored } from '../reciteMemory/record';
import { pageAccuracy } from '../reciteLive/score';
import { countsAsMistake, isUnclear } from '../reciteLive/contract';
import { ayahCount } from '../ayahKeys';
import { getPagesScheduledForDate, juzKeyForPage } from '../algorithm';
import { getPagesForJuz } from '../quranData';
import { getFajrTimeFor, getRevisionDayForUser } from '../fajrBoundary';
import { revisionItemsFor } from '../revisionItems';
import { readItemFor } from '../readItems';
import { TEST_SCENARIOS, buildSeedContext } from '../testScenarios';
import type { User, UserPage } from '../../types';
import type { FirestoreSession } from '../../types/firestore';

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function user(fields: Partial<User>): User {
  return {
    id: 'u1',
    createdAt: '2026-01-01T12:00:00Z',
    smartTrackingEnabled: false,
    hasSeenSmartTrackingPreview: false,
    dailyPageCapacity: 5,
    scheduleMode: 'pages',
    dailyJuzCount: 1,
    reminderTime: '08:00',
    notificationsEnabled: true,
    currentMemorizationJuz: null,
    currentMemorizationPage: null,
    currentKhatamPage: 1,
    customPlan: null,
    savedPlans: [],
    streak: 0,
    lastRevisionDate: null,
    memorizedSurahs: [],
    ...fields,
  } as User;
}

const memorizedPages = (pages: number[]): UserPage[] =>
  pages.map((pageNumber) => ({ pageNumber, status: 'memorized' }) as UserPage);

const localDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

describe('the server’s ports of the app’s rules', () => {
  it('the juz plan’s juz of every page (juzKeyForPage), and each juz’s pages', () => {
    for (let p = 1; p <= 604; p++) expect(serverJuzKey(p)).toBe(juzKeyForPage(p));
    JUZ_RANGES.forEach(([first, last], i) => {
      const pages = getPagesForJuz(i + 1);
      expect([first, last]).toEqual([pages[0], pages[pages.length - 1]]);
    });
  });

  it('the pages, juz and custom plans give each day the same pages as the app’s scheduler', () => {
    const anchorDay = '2026-10-20';
    const scheduleAnchorDate = new Date(wallMs(anchorDay, 12, 0, zone)).toISOString();
    const juz30 = Array.from({ length: 23 }, (_, i) => 582 + i);
    const all = Array.from({ length: 604 }, (_, i) => i + 1);
    const customDays = [[604, 603, 602, 601], [601, 600, 599, 598], [598, 597, 596, 595]];
    const cases = [
      { server: { mode: 'pages' as const, perDay: 3, anchorDay }, app: user({ dailyPageCapacity: 3, scheduleAnchorDate }), pages: juz30 },
      { server: { mode: 'juz' as const, perDay: 1, anchorDay }, app: user({ scheduleMode: 'juz', dailyJuzCount: 1, scheduleAnchorDate }), pages: all },
      { server: { mode: 'juz' as const, perDay: 2, anchorDay }, app: user({ scheduleMode: 'juz', dailyJuzCount: 2, scheduleAnchorDate }), pages: all },
      {
        server: { mode: 'custom' as const, days: customDays, startDay: anchorDay, direction: 'reverse' as const },
        app: user({ scheduleAnchorDate, customPlan: { days: customDays, cycleStartDate: anchorDay, direction: 'reverse' } }),
        pages: juz30,
      },
    ];
    for (const c of cases) {
      for (let k = 0; k < 70; k++) {
        const day = addDays(anchorDay, k);
        expect(plannedPages(c.server, c.pages, day)).toEqual(
          getPagesScheduledForDate(c.app, localDate(day), memorizedPages(c.pages)),
        );
      }
    }
  });

  it('the revision day of a moment, with the Fajr boundary on (getRevisionDayForUser)', () => {
    const prayer = user({
      fajrBoundaryEnabled: true,
      fajrCalculationMethod: 'MuslimWorldLeague',
      locationCoords: { latitude: 30, longitude: Math.max(-165, Math.min(165, -new Date(2026, 10, 5, 12).getTimezoneOffset() / 4)) },
    });
    const fajrOf = (day: string) => getFajrTimeFor(new Date(wallMs(day, 12, 0, zone)), prayer)?.getTime() ?? null;
    for (let k = -3; k <= 3; k++) {
      const day = addDays('2026-11-05', k);
      const fajr = fajrOf(day)!;
      for (const ms of [wallMs(day, 0, 30, zone), fajr - 60_000, fajr, fajr + 60_000, wallMs(day, 23, 30, zone)]) {
        expect(revisionDayAt(ms, zone, fajrOf)).toBe(getRevisionDayForUser(prayer, new Date(ms)));
      }
    }
  });

  it('a session’s Revised items and a reading’s Read item, as the app writes them', () => {
    const at = Date.parse('2026-11-04T18:00:00Z');
    const seeded = {
      id: '2026-11-04',
      date: '2026-11-04',
      state: 'COMPLETED' as const,
      createdAt: at,
      updatedAt: at + 600_000,
      completedAt: at + 600_000,
      durationMinutes: 10.4,
      assignedPages: [582, 583, 584],
      totalAssignedPages: 3,
      pagesRevised: [582, 583, 584, 585, 586],
      pagesSkipped: [],
      weaknessUpdates: [{ pageNumber: 583, previousRating: 4, newRating: 2, changedAt: at + 60_000 }],
      ahead: { '2026-11-05': [585, 586] },
      completionPercentage: 100,
    };
    const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as FirestoreSession['createdAt'];
    const app = revisionItemsFor(
      {
        ...seeded,
        createdAt: ts(seeded.createdAt),
        updatedAt: ts(seeded.updatedAt),
        completedAt: ts(seeded.completedAt),
        weaknessUpdates: seeded.weaknessUpdates.map((w) => ({ ...w, changedAt: ts(w.changedAt) })),
      } as unknown as FirestoreSession,
      'u1',
    );
    expect(serverRevisionItems(seeded, 'u1')).toEqual(app);

    const reading = {
      id: 'r1',
      date: '2026-11-04',
      startedAt: at,
      endedAt: at + 754_000,
      durationSeconds: 754,
      mode: 'stopwatch' as const,
      targetSeconds: null,
      pages: [582, 583],
      pagesVisited: [582, 583],
      createdAt: at,
      updatedAt: at,
    };
    expect(serverReadItem(reading, 'u1')).toEqual(readItemFor('r1', 'u1', reading));
  });

  it('the scenario list is the server’s, in the same order', () => {
    expect(TEST_SCENARIOS.map((s) => s.id)).toEqual([...SCENARIO_IDS]);
  });

  it('the recordings’ audio is the app’s second of silence', () => {
    const file = fs.readFileSync(path.join(__dirname, '../../../assets/audio/silence.m4a'));
    expect(Buffer.from(SILENCE_M4A_BASE64, 'base64').equals(file)).toBe(true);
  });
});

describe('the words the scenarios recite (functions/src/scenarioQuran.ts, scripts/scenario-quran.js)', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/quranWords.dat'), 'utf8')) as QuranWordsData;
  const words = new QuranWords(data);

  it('each verse’s words, each page’s first word and each surah’s verses are the app’s (src/data/quranWords.dat)', () => {
    expect([...VERSE_WORDS]).toEqual(data.counts);
    for (let p = 1; p <= 604; p++) expect(PAGE_FIRST_WORD[p - 1]).toBe(words.pageRange(p)[0]);
    expect(PAGE_FIRST_WORD[604]).toBe(words.count);
    expect(SURAH_VERSES.map((_, i) => ayahCount(i + 1))).toEqual([...SURAH_VERSES]);
    for (const w of [0, 547, 843, 30000, 75479, words.count - 1]) {
      const ref = words.ref(w)!;
      expect(ayahOfWord(w)).toEqual([ref.sura, ref.ayah]);
      expect(pageWords(ref.page)[0]).toBeLessThanOrEqual(w);
    }
  });

  it('the verses’ text and the slips into similar ayat say what the app’s words say', () => {
    for (const p of TAKE_PAGES) {
      const [first, end] = words.pageRange(p);
      for (let w = first; w < end; w++) expect(wordText(w)).toBe(words.uthmani(w));
    }
    for (const slip of SLIPS) {
      expect(words.uthmani(slip.w)).toBe(slip.expected);
      expect([words.ref(slip.w)!.sura, words.ref(slip.w)!.ayah]).toEqual(slip.ayah);
      expect([words.ref(slip.into.w)!.sura, words.ref(slip.into.w)!.ayah]).toEqual(slip.into.ayah);
      if (slip.heard) expect(words.uthmani(slip.into.w)).toBe(slip.heard);
    }
  });

  it('every take and cleared word a scenario writes reads back in the app (lib/reciteMemory/record) as written', () => {
    const zone = 'America/Chicago';
    const now = wallMs('2026-11-17', 12, 0, zone);
    for (const scenario of SCENARIO_IDS) {
      const plan = buildScenario(scenario, { zone, now, fajr: null }, 'u1');
      const docs = scenarioDocuments(plan, (ms) => ms, null).filter((d) => d.path.startsWith('reciteTakes/'));
      expect(docs).toHaveLength(plan.takes.length + plan.clears.length);
      for (const { path: at, data: doc } of docs) {
        const record = fromStored(at.split('/')[1], doc)!;
        expect(record).not.toBeNull();
        if (record.kind !== 'take') continue;
        const take = plan.takes.find((t) => t.id === record.id)!;
        expect(record.marks).toHaveLength(take.marks.length);
        expect(record.from).toBe(take.from);
        // The score as the take's summary counts it, by the page (lib/reciteLive/score).
        expect(record.accuracy).toBeCloseTo(pageAccuracy(words, record.mistakes, record.from, record.to), 3);
        for (const m of record.marks) {
          expect(words.ref(m.w)).toMatchObject({ sura: m.ayah[0], ayah: m.ayah[1] });
          if (m.slip && m.at) expect(words.uthmani(m.w).slice(m.at[0], m.at[1])).toBe(m.slip.expected);
        }
        // The page's own count of what goes in the score.
        expect(record.mistakes).toBe(record.marks.filter((m) => countsAsMistake(m) && !isUnclear(m)).length);
      }
    }
  });
});

describe('what the phone sends', () => {
  it('its zone and clock; for the Fajr scenario this phone’s Fajr times, which the server accepts', () => {
    const now = new Date(2026, 10, 5, 12, 0);
    const plain = buildSeedContext('beginner', null, now);
    expect(plain).toEqual({ zone, now: now.getTime() });
    expect(parseContext(plain, now.getTime(), 'beginner')).toMatchObject({ zone, now: now.getTime(), fajr: null });

    const ctx = buildSeedContext('fajr-edge', null, now);
    const parsed = parseContext(ctx, now.getTime(), 'fajr-edge');
    expect(Object.keys(parsed.fajr!.days)).toHaveLength(5);
    // The server's revision day for each Fajr-scenario moment is the app's.
    const plan = buildScenario('fajr-edge', parsed, 'u1');
    const prayer = user({
      fajrBoundaryEnabled: true,
      locationCoords: parsed.fajr!.coords,
      fajrCalculationMethod: parsed.fajr!.method,
    });
    expect(plan.today).toBe(getRevisionDayForUser(prayer, now));
    for (const s of plan.sessions) expect(s.date).toBe(getRevisionDayForUser(prayer, new Date(s.createdAt)));
    for (const n of plan.notes) expect(n.day).toBe(getRevisionDayForUser(prayer, new Date(n.at)));
    // The 00:30 session: a calendar day later than its revision day.
    const late = plan.sessions.find((s) => calendarDay(s.createdAt, zone) !== s.date)!;
    expect(late).toBeDefined();
  });
});
