#!/usr/bin/env node
/**
 * Does Revo draft a schedule when asked from Edit schedule (BEHAVIOUR.md REVO-43)? Real questions asked of the real
 * model with this checkout's prompt, guide and reply schema, as Revisely Dev asks them from Edit schedule (the
 * context's `app: 'dev'` and `place: 'schedule'`), against a made-up account (no user's data): Edit schedule's four
 * starters and free requests. Each answer is read as the server reads it (reply.ts) and passes when it carries the draft
 * the question calls for. One question from Home checks that only Edit schedule drafts.
 *
 *   cd functions && npm run build && ANTHROPIC_API_KEY=… node scripts/revo-draft-samples.js [--only <n,n,…>] [--raw <file.json>] [--dry]
 *
 * --raw writes each reply's text as the model sent it (for a scenario's stand-in). --dry builds every request without a
 * call. The key is read from the environment, sent only to api.anthropic.com, and never written or printed. About ten
 * requests to claude-sonnet-5-5, the system prompt cached after the first: about 15 cents.
 */
const fs = require('fs');
const path = require('path');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const ONLY = arg('--only', null)?.split(',').map(Number);
const RAW = arg('--raw', null);
const DRY = process.argv.includes('--dry');

const lib = path.join(__dirname, '..', 'lib');
if (!fs.existsSync(path.join(lib, 'revo/prompt.js'))) {
  console.error('Build the functions first: npm run build');
  process.exit(2);
}
const key = process.env.ANTHROPIC_API_KEY;
if (!key && !DRY) {
  console.error('Set ANTHROPIC_API_KEY (it is never printed or stored), or pass --dry to check the requests.');
  process.exit(2);
}

const { ANTHROPIC_URL, ANTHROPIC_VERSION } = require(path.join(lib, 'coach/call.js'));
const { buildAskRequest } = require(path.join(lib, 'revo/prompt.js'));
const { parseReply } = require(path.join(lib, 'revo/reply.js'));
const { validateContext } = require(path.join(lib, 'revo/validate.js'));
const { REVO_SCHEDULE_OUTPUT_CONFIG } = require(path.join(lib, 'revo/replySchema.js'));

const DAY = '2026-11-25'; // a Wednesday
const shift = (n) => {
  const [y, m, d] = DAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// 108 pages (Al-Baqarah to the middle of Al-Ma'idah), 10 a day: every page comes round every 11 days, as in the scenario.
const account = {
  totals: {
    memorizedPages: 108, revisedWithin7Days: 64, revisedWithin30Days: 108, daysWithSession30: 24, streakDays: 5, sessions30: 24,
    weakPages: 0, moderatePages: 0, strongPages: 0, weakRevisedLast7Days: 0, pagesPerDay7: 9.1, pagesPerDay30: 8.4, plannedPerDay: 10,
  },
  today: { plannedPages: 10, revisedPages: 0, carriedPages: 0, doneEarlier: 0, otherPages: 0, minutes: 0, memorizedPages: 0, nextPages: range(41, 50), weakNext: [], done: false },
  weakPages: [],
  week: [...range(-6, -1).map((k) => ({ day: shift(k), pages: k === -2 ? 0 : 10, planned: 10, done: k !== -2 })), { day: DAY, pages: 0, planned: 10, done: false }],
  streak: { days: 0, atRisk: null },
  passages: { today: 'Al-Baqarah 253 to Al-i-Imran 91 · Juz 3–4', startsAt: 'Al-Baqarah, ayah 253', next: 'Al-Baqarah 253 to Al-i-Imran 91 · Juz 3–4', nextAt: 'Al-Baqarah, ayah 253' },
  pageNames: {},
  localTime: '10:00',
  app: 'dev',
};
const onSchedule = { ...account, place: 'schedule' };

/** A draft with these numbers (null: any). */
const draft = (want = {}) => ({ want });
const SAMPLES = [
  { q: 'Make it lighter', ctx: onSchedule, expect: draft({ mode: 'pages', fewer: true }) },
  { q: 'Finish a round sooner', ctx: onSchedule, expect: draft({ mode: 'pages', more: true }) },
  { q: 'Rest one day a week', ctx: onSchedule, expect: draft({ restDays: 1 }) },
  { q: 'Start a new plan', ctx: onSchedule, expect: draft() },
  { q: 'I can only do 6 pages, and Fridays are busy', ctx: onSchedule, expect: draft({ perDay: 6, restDays: [5] }) },
  { q: 'Can I take weekends off?', ctx: onSchedule, expect: draft({ restDays: [0, 6] }) },
  { q: 'A juz a day instead', ctx: onSchedule, expect: draft({ mode: 'juz', perDay: 1 }) },
  { q: 'Make it lighter', ctx: account, expect: { noDraft: true }, note: 'from Home: no draft' },
];

/** Whether the answer's draft is what the question called for; the reasons it isn't. */
function judge(sample, parts) {
  const a = parts?.action;
  if (sample.expect.noDraft) return a?.kind === 'draftSchedule' ? ['drafted from Home'] : [];
  if (a?.kind !== 'draftSchedule') return [`no draft (action: ${a?.kind ?? 'none'})`];
  const w = sample.expect.want;
  const out = [];
  if (w.mode && a.mode !== w.mode) out.push(`mode ${a.mode}`);
  if (w.perDay && a.perDay !== w.perDay) out.push(`perDay ${a.perDay}`);
  if (w.fewer && !(a.mode === 'pages' && a.perDay < 10)) out.push(`not lighter (${a.perDay} ${a.mode})`);
  if (w.more && !(a.mode === 'juz' || a.perDay > 10)) out.push(`not sooner (${a.perDay} ${a.mode})`);
  if (typeof w.restDays === 'number' && (a.restDays ?? []).length !== w.restDays) out.push(`rest days ${JSON.stringify(a.restDays ?? [])}`);
  if (Array.isArray(w.restDays) && JSON.stringify(a.restDays ?? []) !== JSON.stringify(w.restDays)) out.push(`rest days ${JSON.stringify(a.restDays ?? [])}`);
  return out;
}

(async () => {
  const raw = [];
  let failed = 0;
  let cost = 0;
  for (const [i, s] of SAMPLES.entries()) {
    const n = i + 1;
    if (ONLY && !ONLY.includes(n)) continue;
    const context = validateContext(s.ctx);
    const request = buildAskRequest({ day: DAY, question: s.q, context, attached: [], memory: [], history: [], chat: null, smartTracking: false, tester: true });
    const schedule = request.output_config === REVO_SCHEDULE_OUTPUT_CONFIG;
    if (schedule !== (s.ctx.place === 'schedule')) throw new Error(`${n}: the wrong reply schema`);
    if (DRY) {
      console.log(`${n}. ${s.q} (${schedule ? 'schedule schema' : 'store schema'})`);
      continue;
    }
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify(request),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.log(`${n}. ${s.q}: the API answered ${res.status}: ${body?.error?.message ?? ''}`);
      failed++;
      continue;
    }
    const u = body.usage ?? {};
    cost += ((u.input_tokens ?? 0) * 3 + (u.cache_creation_input_tokens ?? 0) * 3.75 + (u.cache_read_input_tokens ?? 0) * 0.3 + (u.output_tokens ?? 0) * 15) / 1e6;
    const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    raw.push({ n, question: s.q, place: s.ctx.place ?? 'home', text });
    const parts = parseReply(text, new Set(range(41, 50)), { firstTurn: true, smartTracking: false, drafts: s.ctx.place === 'schedule' });
    const problems = judge(s, parts);
    if (problems.length > 0) failed++;
    const a = parts?.action;
    const shown = a?.kind === 'draftSchedule' ? `draft ${a.perDay} ${a.mode}${a.restDays ? `, rest ${JSON.stringify(a.restDays)}` : ''}${a.reverse ? ', reverse' : ''} · “${a.detail}”` : (a?.kind ?? 'no action');
    console.log(`${n}. ${s.q}${s.note ? ` (${s.note})` : ''}: ${problems.length === 0 ? 'PASS' : `FAIL (${problems.join('; ')})`}\n   “${parts?.text ?? ''}”\n   ${shown}`);
  }
  if (RAW && !DRY) fs.writeFileSync(RAW, `${JSON.stringify(raw, null, 2)}\n`);
  if (!DRY) console.log(`\n${failed === 0 ? 'All passed' : `${failed} failed`}. About $${cost.toFixed(3)}.`);
  process.exit(failed === 0 ? 0 : 1);
})();
