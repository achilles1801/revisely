/**
 * Revo's guide stays true to the app (guide.ts): it covers every rule in BEHAVIOUR.md, names only
 * screens the app has and labels the app shows, and the screens Revo may open are the same list
 * on both sides. When one of these fails, change the guide in the same PR as the feature.
 */
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { DEV_GUIDE, DEV_GUIDE_SECTIONS, DEV_GUIDE_SYSTEM, GUIDE_INTERNAL, GUIDE_INTERNAL_KINDS, GUIDE_SECTIONS, REVO_GUIDE } from './guide';
import { barePageNumbers, replyWords } from './pageWords';
import { ARABIC_SYSTEM, REVO_SYSTEM_PROMPT, buildAskRequest, buildReviewRequest, contextText, ramadanText } from './prompt';
import { RECITATION_SYSTEM } from './recitation';
import { parseReply } from './reply';
import { REVO_SCREENS, REVO_SETTINGS_SECTIONS, RevoContext, RevoRecitation } from './types';
import { validateContext } from './validate';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const behaviour = read('BEHAVIOUR.md');
const rules = [...behaviour.matchAll(/^- \*\*([A-Z]+-\d+)\.\*\*/gm)].map((m) => m[1]);
/**
 * What only Revisely Dev has: the rules under a heading marked "(Revisely Dev)", and a rule elsewhere marked so right
 * after its id ("- **ACT-28.** (Revisely Dev) …"). When the feature reaches the store app, the mark goes, and the
 * rule moves to the main guide.
 */
const devRules = [
  ...behaviour
    .split(/^## /m)
    .filter((part) => /^[^\n]*\(Revisely Dev\)/.test(part))
    .flatMap((part) => [...part.matchAll(/^- \*\*([A-Z]+-\d+)\.\*\*/gm)].map((m) => m[1])),
  ...[...behaviour.matchAll(/^- \*\*([A-Z]+-\d+)\.\*\* \(Revisely Dev\b/gm)].map((m) => m[1]),
].filter((id, i, all) => all.indexOf(id) === i);
const mainCovered = GUIDE_SECTIONS.flatMap((s) => [...s.covers]);
const devCovered = DEV_GUIDE_SECTIONS.flatMap((s) => [...s.covers]);
const covered = [...mainCovered, ...devCovered];
const allSections = [...GUIDE_SECTIONS, ...DEV_GUIDE_SECTIONS];

/** The app's source, comments left out (a label must be text the app shows, not a note about it). */
function appSource(): string {
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === '__tests__' || e.name === '__fixtures__' ? [] : walk(p);
      return /\.(tsx?|json)$/.test(e.name) ? [p] : [];
    });
  const uncommented = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  return walk('src').map((f) => uncommented(read(f))).join('\n');
}

describe('Revo’s guide covers BEHAVIOUR.md', () => {
  it('reads the rules', () => {
    expect(rules.length).toBeGreaterThan(50);
  });

  it('every rule is in a section’s covers, or left out on purpose with a reason', () => {
    const missing = rules.filter((id) => !covered.includes(id) && !(id in GUIDE_INTERNAL));
    // A new rule: say how it works for users in guide.ts (and add its id to that section's covers),
    // or, if users can't ask about it, add it to GUIDE_INTERNAL with the reason.
    expect(missing).toEqual([]);
  });

  it('names only rules that exist, each once', () => {
    const all = [...covered, ...Object.keys(GUIDE_INTERNAL)];
    expect(all.filter((id) => !rules.includes(id))).toEqual([]);
    expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
  });
});

describe('nothing a user can see is left out of the guide (Majd, Nov 16 2026)', () => {
  // "whatever app changes we make, revo should get that update too": a rule may stay out of the guide only for a
  // reason a user never meets. Before this, Revisely Dev's features sat in GUIDE_INTERNAL as "Dev only", and Revo in
  // Revisely Dev knew nothing of Recite.
  it('every reason for leaving a rule out starts with a kind a user never sees', () => {
    const kinds = new RegExp(`^(${GUIDE_INTERNAL_KINDS.join('|')}): \\S`);
    const unkinded = Object.entries(GUIDE_INTERNAL).filter(([, why]) => !kinds.test(why));
    // A rule a user can see and ask about: say how it works in guide.ts (GUIDE_SECTIONS, or DEV_GUIDE_SECTIONS when
    // only Revisely Dev has it). Only timing, the server's own work, layout, the owner's tools, screens before sign-in,
    // a superseded feature or Revo's own prompt may stay out, with that kind first.
    expect(unkinded).toEqual([]);
  });

  it('no rule is left out for being Revisely Dev only: those go in the Dev guide', () => {
    expect(Object.entries(GUIDE_INTERNAL).filter(([, why]) => /\bDev\b/.test(why))).toEqual([]);
  });

  it('reads the rules marked Revisely Dev: none since mistake detection reached the store app (1.0.5)', () => {
    // Recite, its memory, Insights' Recitation, Gaps and Premium's early access are every account's now, in the main guide.
    for (const id of ['RECITE-1', 'RINS-1', 'RMEM-1', 'RMEM-2', 'ACT-28', 'ACT-30', 'PREM-1']) expect(devRules).not.toContain(id);
    expect(Array.isArray(devRules)).toBe(true);
  });

  it('a rule only Revisely Dev has is in the Dev guide, never in the guide every account gets', () => {
    // Unless a user never meets it in Revo, as for every account's rules: sign-in B's screens (AUTH-3–5) come before
    // there is an account, as ACCOUNT-2's and AUTH-2's do. GUIDE_INTERNAL's own tests keep its reasons to those kinds.
    const signedOut = (id: string) => GUIDE_INTERNAL[id]?.startsWith('signed out: ');
    expect(devRules.filter((id) => !devCovered.includes(id) && !signedOut(id))).toEqual([]);
    expect(mainCovered.filter((id) => devRules.includes(id))).toEqual([]);
  });

  it('the Dev guide covers only rules marked Revisely Dev (a feature that reached the store moves to the main guide)', () => {
    expect(devCovered.filter((id) => !devRules.includes(id))).toEqual([]);
  });
});

describe('Revo’s guide names what the app has', () => {
  it('every screen a section sends the user to is in the navigation', () => {
    const nav = read('src/navigation/MainNavigator.tsx');
    const screens = new Set([...nav.matchAll(/\.Screen\s+name="([A-Za-z]+)"/g)].map((m) => m[1]));
    expect(screens.size).toBeGreaterThan(10);
    const routes = [...new Set(allSections.flatMap((s) => [...s.routes]))];
    expect(routes.filter((r) => !screens.has(r))).toEqual([]);
  });

  it('every label in curly quotes is text the app shows, word for word (“…” stands for a part left out)', () => {
    const source = appSource().replace(/’/g, "'");
    const labels = [...new Set([...`${REVO_GUIDE}\n${DEV_GUIDE}`.matchAll(/“([^”]+)”/g)].map((m) => m[1]))];
    expect(labels.length).toBeGreaterThan(50);
    // RECITE-7: gone from the app. The main guide still names it until the release's re-record of its replies (that
    // needs Majd's yes), and the Dev guide tells Revo it's gone. Take this out with that re-record.
    const untilReRecord = 'Recite the mistakes again';
    expect(REVO_GUIDE).toContain(`“${untilReRecord}”`);
    expect(DEV_GUIDE).toContain(`“${untilReRecord}” and "Recite your N mistakes here" are gone`);
    const absent = labels.filter((l) => l !== untilReRecord).filter((l) =>
      l
        .split('…')
        .map((part) => part.trim().replace(/’/g, "'"))
        .filter(Boolean)
        .some((part) => !source.includes(part)),
    );
    // A label the app no longer shows: the guide sends users to something that isn't there.
    expect(absent).toEqual([]);
  });

  it('stays compact: the prompt carries it on every question', () => {
    // About 4 characters a token: under ~8,750 tokens. Raised from 24,000 characters on Nov 8 2026 (the interactive
    // Activity, memorizing by the ayah), and from 30,000 on Nov 18 2026 for mistake detection reaching the store app
    // (1.0.5): its lines came over from the Dev guide condensed, about 5,000 characters from 14,000, and the Dev block
    // shrank by as much. On Sonnet 5.5 the 5,000 are about $0.00014 a question cached and $0.0035 on a cache miss. It
    // rides on every question in the cached system prompt. Trim before raising it again.
    expect(REVO_GUIDE.length).toBeLessThan(35_000);
    expect(REVO_GUIDE).not.toMatch(/\b[A-Z]+-\d+\b/);
  });

  it('the Dev guide stays compact too', () => {
    // It rides on every question from Revisely Dev (never the store app's), cached as a block of its own. Raised from
    // 12,000 characters on Nov 16 2026, at 11,766 (about 3.6 characters a token), to hold about 5 more Dev features
    // (a feature has taken 400 to 900 characters). At 16,000 (about 4,450 tokens) on Sonnet 5.5 the block costs about
    // $0.00045 a question when cached (cache read $0.10 per million tokens) and $0.011 on a cache miss (write $2.50 per
    // million); the 4,000 characters added are about $0.0001 and $0.003 of that. Trim repeats before raising it again.
    // Nov 27 2026: 16,500, for MEM-9 and MEM-10 (Memorized pages off Home), at 15,991 with nothing left to trim that wasn't
    // another feature's knowledge; about $0.00001 a question cached.
    expect(DEV_GUIDE.length).toBeLessThan(16_500);
    expect(DEV_GUIDE).not.toMatch(/\b[A-Z]+-\d+\b/);
  });
});

describe('the Dev guide goes only with questions from Revisely Dev', () => {
  const DAY = '2026-11-16';
  const context = (extra: Partial<RevoContext> = {}): RevoContext => ({
    totals: {
      memorizedPages: 20, revisedWithin7Days: 20, revisedWithin30Days: 20, daysWithSession30: 10, streakDays: 3, sessions30: 10,
      weakPages: 0, moderatePages: 0, strongPages: 20, weakRevisedLast7Days: 0, pagesPerDay7: 5, pagesPerDay30: 5, plannedPerDay: 5,
    },
    today: { plannedPages: 5, revisedPages: 0, minutes: 0, memorizedPages: 0, nextPages: [582, 583, 584, 585, 586], weakNext: [], done: false },
    weakPages: [],
    week: [{ day: DAY, pages: 0 }],
    localTime: '20:00',
    ...extra,
  });
  const recitation: RevoRecitation = {
    days: 28, takes: 1, daysRecited: 1, minutes: 3, words: 40, score: 1, earlierScore: null, weeks: [1], mistakes: 0,
    kinds: { wrong: 0, skipped: 0, added: 0, harakat: 0, letter: 0 }, unclear: 0, tajweed: null, stillMarked: 0, cleared: 0,
    slipping: [], similar: [], last: null,
  };
  const ask = (c: RevoContext) => buildAskRequest({ day: DAY, question: 'How do I recite with the page hidden?', context: c, attached: [], memory: [], history: [] });

  it('the store app’s questions are exactly as before: one system block', () => {
    expect(ask(context()).system).toEqual([{ type: 'text', text: REVO_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]);
  });

  it('Revisely Dev’s carry it after the main prompt, the main prompt unchanged', () => {
    const dev = ask(context({ app: 'dev' }));
    expect(dev.system.map((s) => s.text)).toEqual([REVO_SYSTEM_PROMPT, DEV_GUIDE_SYSTEM]);
    expect(dev.system[0]).toEqual(ask(context()).system[0]);
    expect(dev.system[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(DEV_GUIDE_SYSTEM).toContain(DEV_GUIDE);
  });

  it('with a recitation, the recitation rules come after it', () => {
    expect(ask(context({ app: 'dev', recitation })).system.map((s) => s.text)).toEqual([REVO_SYSTEM_PROMPT, DEV_GUIDE_SYSTEM, RECITATION_SYSTEM]);
  });

  it('a day in review never carries it', () => {
    expect(buildReviewRequest({ day: DAY, context: context({ app: 'dev' }), memory: [] }).system).toHaveLength(1);
  });

  it('the server takes app "dev" and nothing else there', () => {
    const plain = JSON.parse(JSON.stringify(context())) as Record<string, unknown>;
    expect(validateContext({ ...plain, app: 'dev' }).app).toBe('dev');
    expect(validateContext(plain).app).toBeUndefined();
    expect(() => validateContext({ ...plain, app: 'store' })).toThrow();
    expect(() => validateContext({ ...plain, app: true })).toThrow();
  });

  it('[THEME-8] the server takes Ramadan so far from Revisely Dev only, checked, and says it in words', () => {
    const plain = JSON.parse(JSON.stringify(context())) as Record<string, unknown>;
    const ramadan = { day: 12, length: 29, revisedDays: 12, covered: 268, nextPage: 131, nextWords: 'Al-An’am, 3rd page' };
    expect(validateContext({ ...plain, app: 'dev', ramadan }).ramadan).toEqual(ramadan);
    expect(() => validateContext({ ...plain, ramadan })).toThrow(); // not from the store app
    expect(() => validateContext({ ...plain, app: 'dev', ramadan: { ...ramadan, day: 31 } })).toThrow();
    expect(() => validateContext({ ...plain, app: 'dev', ramadan: { ...ramadan, revisedDays: 13 } })).toThrow();
    expect(() => validateContext({ ...plain, app: 'dev', ramadan: { ...ramadan, covered: 605 } })).toThrow();
    expect(() => validateContext({ ...plain, app: 'dev', ramadan: { ...ramadan, nextWords: undefined } })).toThrow();
    expect(() => validateContext({ ...plain, app: 'dev', ramadan: { ...ramadan, extra: 1 } })).toThrow();
    const { nextPage: _p, nextWords: _w, ...done } = ramadan;
    expect(validateContext({ ...plain, app: 'dev', ramadan: { ...done, covered: 604 } }).ramadan).toEqual({ ...done, covered: 604 });
    expect(ramadanText(ramadan)).toBe(
      'Ramadan: day 12 of 29, 18 days to Eid (counting today). Revised on 12 of the 12 days so far. 268 of the Qur’an’s 604 pages revised or read since 1 Ramadan; the first not yet is Al-An’am, 3rd page (page 131).',
    );
    expect(ramadanText({ ...done, covered: 604 })).toContain('every page has been, a khatmah this Ramadan');
    expect(contextText(DAY, context({ app: 'dev', ramadan }), [])).toContain('Ramadan: day 12 of 29');
    expect(contextText(DAY, context({ app: 'dev' }), [])).not.toContain('Ramadan:');
  });

  it('the app in Arabic asks for the answer in Arabic: its own block last, the rest unchanged; a day in review too', () => {
    const ar = ask(context({ app: 'dev', language: 'ar' }));
    expect(ar.system.map((s) => s.text)).toEqual([REVO_SYSTEM_PROMPT, DEV_GUIDE_SYSTEM, ARABIC_SYSTEM]);
    expect(ar.system[2].cache_control).toEqual({ type: 'ephemeral' });
    expect(ask(context({ app: 'dev', language: 'ar', recitation })).system.map((s) => s.text)).toEqual([REVO_SYSTEM_PROMPT, DEV_GUIDE_SYSTEM, RECITATION_SYSTEM, ARABIC_SYSTEM]);
    expect(buildReviewRequest({ day: DAY, context: context({ app: 'dev', language: 'ar' }), memory: [] }).system.map((s) => s.text)).toEqual([REVO_SYSTEM_PROMPT, ARABIC_SYSTEM]);
    // In English nothing changes.
    expect(ask(context({ app: 'dev' })).system.map((s) => s.text)).not.toContain(ARABIC_SYSTEM);
  });

  it('[REVO-43] the server keeps place "schedule" only from Revisely Dev, and the question then says it was asked from Edit schedule', () => {
    const plain = JSON.parse(JSON.stringify(context())) as Record<string, unknown>;
    expect(validateContext({ ...plain, app: 'dev', place: 'schedule' }).place).toBe('schedule');
    // From the store app, or a place it doesn't know: no place, and the question goes as before.
    expect(validateContext({ ...plain, place: 'schedule' }).place).toBeUndefined();
    expect(validateContext({ ...plain, app: 'dev', place: 'home' }).place).toBeUndefined();
    const said = (c: RevoContext) => ask(c).messages.at(-1)!.content;
    expect(said(context({ app: 'dev', place: 'schedule' }))).toContain('Asked from Edit schedule: a change or a new plan they ask for (each starter too) is a draftSchedule');
    expect(said(context({ app: 'dev' }))).not.toContain('Edit schedule');
  });

  it('the server takes language "ar" and nothing else there', () => {
    const plain = JSON.parse(JSON.stringify(context())) as Record<string, unknown>;
    expect(validateContext({ ...plain, language: 'ar' }).language).toBe('ar');
    expect(validateContext(plain).language).toBeUndefined();
    expect(() => validateContext({ ...plain, language: 'en' })).toThrow();
    expect(() => validateContext({ ...plain, language: 'fr' })).toThrow();
  });

  it('Gaps’ figures come from any app that has them, and reach the model as their lines (ACT-28, ACT-30)', () => {
    const plain = JSON.parse(JSON.stringify(context())) as Record<string, unknown>;
    const gaps = {
      lastRevisedDaysAgo: 6,
      longestGap: { days: 9, endedDaysAgo: 6 },
      usualStepDays: 1,
      longGaps: 2,
      fullRevision: { latePages: 18, pushedBackDays: 5, cycleDays: 5 },
      surahs: [{ name: 'Al-Kahf', daysAgo: 9 }],
    };
    // The store app has Gaps from the mistake detection release: no app "dev" needed, and no Dev guide sent.
    const store = validateContext({ ...plain, gaps });
    expect(store.gaps).toEqual(gaps);
    expect(ask(store).system.map((s) => s.text)).toEqual([REVO_SYSTEM_PROMPT]);
    const dev = validateContext({ ...plain, app: 'dev', gaps });
    expect(dev.gaps).toEqual(gaps);
    const request = JSON.stringify(ask(dev));
    expect(request).toContain('last revised 6 days ago; 2 gaps, the longest 9 days without revising (ended 6 days ago); usually every day.');
    expect(request).toContain('pushed back 5 days');
    expect(request).toContain('Al-Kahf 9 days ago');
    // They go with the question, not the system blocks (which stay cached as they were).
    expect(ask(dev).system.map((s) => s.text)).toEqual([REVO_SYSTEM_PROMPT, DEV_GUIDE_SYSTEM]);
  });
});

describe('the screens Revo may open (REVO-31)', () => {
  /** A `['a', 'b'] as const` list exported from the app's src/lib/revo/types.ts. */
  const appList = (name: string) => {
    const m = new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const`).exec(read('src/lib/revo/types.ts'));
    return m ? [...m[1].matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]) : null;
  };

  it('are the same list in the app and on the server', () => {
    expect(appList('REVO_SCREENS')).toEqual([...REVO_SCREENS]);
    expect(appList('REVO_SETTINGS_SECTIONS')).toEqual([...REVO_SETTINGS_SECTIONS]);
  });
});

describe('the scripts that ask the real model still build their requests', () => {
  // They run on the built functions (lib/); CI builds before testing (npm run build && npm test).
  // A change to the request (Nov 7: `attach` became `attached`) broke all three without a test failing.
  const lib = join(__dirname, '..', '..', 'lib', 'revo', 'prompt.js');
  // The tone script compares with an older prompt from git; CI's checkout is shallow, so it compares with HEAD here.
  it.each([['revo-guide-samples.js'], ['record-anthropic.js'], ['revo-tone-samples.js', '--before', 'HEAD'], ['revo-chart-samples.js']])('%s --dry', (script, ...args) => {
    if (!existsSync(lib)) throw new Error('Build the functions first: npm run build');
    execFileSync(process.execPath, [join(__dirname, '..', '..', 'scripts', script), '--dry', ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ANTHROPIC_API_KEY: '' } });
  });
});

describe('page numbers where Revo should name the surah (NAME-1)', () => {
  it('finds a page number on its own, and lets one after a surah’s name through', () => {
    expect(barePageNumbers('Next up starts at page 587, with one weak page among them')).toEqual(['page 587']);
    expect(barePageNumbers('Put page 589 first. Then pages 590–592, and p. 12.')).toEqual(['page 589', 'pages 590', 'p. 12']);
    expect(barePageNumbers('Al-Baqarah, p. 288 is the one. Al-Mujadila · p. 542 too, and Al-Hashr, ayahs 17–24, p. 548.')).toEqual([]);
    expect(barePageNumbers('20 pages a day, page by page, about 9 pages this week.')).toEqual([]);
  });

  it.each(['revo-ask', 'revo-review'])('the recorded %s reply names the Qur’an by surah and juz, never by page number', (name) => {
    // A recording made from a context with page numbers alone got "page 587" (Nov 7 2026): the
    // fixture in scripts/record-anthropic.js sends the app's own words for every page.
    const recording = JSON.parse(readFileSync(join(__dirname, '..', '..', 'test-recordings', 'anthropic', `${name}.json`), 'utf8'));
    const text = (recording.body.content as { type: string; text?: string }[]).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    const reply = parseReply(text, new Set(Array.from({ length: 604 }, (_, i) => i + 1)), { firstTurn: true });
    expect(reply).not.toBeNull();
    expect(barePageNumbers(replyWords(reply!))).toEqual([]);
  });
});
