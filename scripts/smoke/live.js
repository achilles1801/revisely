#!/usr/bin/env node
// The live smoke check (.github/workflows/live-smoke.yml, TESTING.md): the one test that talks to
// production, once a day, as a phone would.
//   1. Signs in as the dedicated smoke account (Firebase Auth, email and password).
//   2. Gets an App Check token for it (a debug token registered for the smoke check, exchanged
//      with App Check's REST API, as the debug provider does on a simulator).
//   3. Turns Revo on for the account (revoSetOptions; idempotent, no model call), asks revoAsk one
//      tiny question (one real model call, counted in Revo's monthly cap), then clears the
//      account's Revo history (revoClear), so nothing piles up.
//   4. Fetches one block of The Clear Quran through the worker (revisely.app/api).
// Anything but a valid answer at every step fails it, with the step and what came back (never a
// token, a key or the account's id). With --report, a failure opens (or comments on) an issue
// labelled live-smoke mentioning the owner, and a pass closes it.
//
//   node scripts/smoke/live.js [--report]
//
// Environment (repository secrets; live-smoke.yml): SMOKE_EMAIL, SMOKE_PASSWORD,
// SMOKE_FIREBASE_API_KEY (the app's Firebase web API key), SMOKE_APPCHECK_APP_ID (the Firebase app
// the debug token is registered under), SMOKE_APPCHECK_DEBUG_TOKEN. Optional: SMOKE_PROJECT
// (revision-buddy-3a398), SMOKE_FUNCTIONS (https://us-central1-<project>.cloudfunctions.net),
// SMOKE_WORKER (https://revisely.app). With --report: GITHUB_TOKEN, GITHUB_REPOSITORY, RUN_URL,
// MENTION.

const LABEL = 'live-smoke';
const TITLE = 'Live smoke check failing';
const env = process.env;
const PROJECT = env.SMOKE_PROJECT || 'revision-buddy-3a398';
const FUNCTIONS = (env.SMOKE_FUNCTIONS || `https://us-central1-${PROJECT}.cloudfunctions.net`).replace(/\/+$/, '');
const WORKER = (env.SMOKE_WORKER || 'https://revisely.app').replace(/\/+$/, '');
const TIMEOUT_MS = 60_000;

class StepError extends Error {
  constructor(step, message) {
    super(`${step}: ${message}`);
    this.step = step;
  }
}

/** What came back, short and with anything token-like taken out. */
function excerpt(text) {
  return String(text)
    .replace(/eyJ[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]+){0,2}/g, '[token]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}

async function request(step, url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new StepError(step, `no answer (${err.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000} s` : err.message})`);
  }
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // reported below
  }
  return { status: res.status, body, text };
}

async function signIn() {
  const { status, body, text } = await request(
    'sign-in',
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(env.SMOKE_FIREBASE_API_KEY)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SMOKE_EMAIL, password: env.SMOKE_PASSWORD, returnSecureToken: true }) },
  );
  if (status !== 200 || typeof body?.idToken !== 'string') throw new StepError('sign-in', `HTTP ${status} ${excerpt(body?.error?.message ?? text)}`);
  return body.idToken;
}

async function appCheckToken() {
  const app = encodeURIComponent(env.SMOKE_APPCHECK_APP_ID);
  const { status, body, text } = await request(
    'app-check',
    `https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT}/apps/${app}:exchangeDebugToken?key=${encodeURIComponent(env.SMOKE_FIREBASE_API_KEY)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debugToken: env.SMOKE_APPCHECK_DEBUG_TOKEN }) },
  );
  if (status !== 200 || typeof body?.token !== 'string') throw new StepError('app-check', `HTTP ${status} ${excerpt(body?.error?.message ?? text)}`);
  return body.token;
}

/** A callable, as the app's callFunction sends it; returns `result`. */
async function callable(name, data, auth) {
  const { status, body, text } = await request(name, `${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.idToken}`, 'X-Firebase-AppCheck': auth.appCheck },
    body: JSON.stringify({ data }),
  });
  if (status !== 200) throw new StepError(name, `HTTP ${status} ${body?.error?.status ?? ''} ${excerpt(body?.error?.message ?? text)}`.trim());
  if (!body || typeof body !== 'object' || !('result' in body)) throw new StepError(name, `not a callable answer: ${excerpt(text)}`);
  return body.result;
}

const isStr = (v) => typeof v === 'string' && v.trim() !== '';

/** A revoAsk answer the app would show (src/lib/revo/backend askResultOf), else why not. */
function checkAnswer(r, question) {
  const problems = [];
  if (!r || typeof r !== 'object') return ['no result'];
  if (!isStr(r.chatId)) problems.push('no chatId');
  if (r.question?.role !== 'user' || r.question?.text !== question) problems.push('the question is not the one asked');
  if (r.reply?.role !== 'revo') problems.push('no reply from Revo');
  if (!isStr(r.reply?.text)) problems.push('the reply has no text');
  if (typeof r.reply?.at !== 'number') problems.push('the reply has no time');
  if (typeof r.remainingToday !== 'number') problems.push('no remainingToday');
  return problems;
}

/** A context as the app builds it (lib/revo/context), for an account with nothing to show. */
function smokeContext(day) {
  return {
    totals: {
      memorizedPages: 0,
      revisedWithin7Days: 0,
      revisedWithin30Days: 0,
      daysWithSession30: 0,
      streakDays: 0,
      sessions30: 0,
      weakPages: 0,
      moderatePages: 0,
      strongPages: 0,
      weakRevisedLast7Days: 0,
      pagesPerDay7: 0,
      pagesPerDay30: 0,
      plannedPerDay: 0,
    },
    today: { plannedPages: 0, revisedPages: 0, minutes: 0, memorizedPages: 0, nextPages: [], weakNext: [], done: false },
    weakPages: [],
    week: [{ day, pages: 0 }],
    localTime: null,
  };
}

async function run() {
  const missing = ['SMOKE_EMAIL', 'SMOKE_PASSWORD', 'SMOKE_FIREBASE_API_KEY', 'SMOKE_APPCHECK_APP_ID', 'SMOKE_APPCHECK_DEBUG_TOKEN'].filter((k) => !env[k]);
  if (missing.length) return { skipped: `not set up yet: ${missing.join(', ')}` };
  const started = Date.now();
  const auth = { idToken: await signIn(), appCheck: await appCheckToken() };
  const day = new Date().toISOString().slice(0, 10);

  const settings = await callable('revoSetOptions', { optIn: true, memoryOn: false }, auth);
  if (settings?.optIn !== true) throw new StepError('revoSetOptions', `Revo is not on: ${excerpt(JSON.stringify(settings))}`);

  const question = 'Smoke check: in one short sentence, what is my plan for today?';
  const answer = await callable('revoAsk', { chatId: null, day, question, context: smokeContext(day), attach: null }, auth);
  const problems = checkAnswer(answer, question);
  if (problems.length) throw new StepError('revoAsk', `${problems.join('; ')}: ${excerpt(JSON.stringify(answer))}`);
  await callable('revoClear', { what: 'history' }, auth);

  const verse = await request('worker', `${WORKER}/api/tcq/windows/1:1`, {
    headers: { Authorization: `Bearer ${auth.idToken}`, 'X-Revisely-Channel': 'production' },
  });
  const first = verse.body?.verses?.[0];
  if (verse.status !== 200 || first?.verse_key !== '1:1' || !isStr(first?.text)) {
    throw new StepError('worker', `HTTP ${verse.status} ${excerpt(verse.text)}`);
  }
  return { ok: true, secs: Math.round((Date.now() - started) / 1000), cached: answer.cached === true, replyChars: answer.reply.text.length };
}

async function report(outcome) {
  const { githubApi } = require('../sentry/api');
  const open = (await githubApi.issuesWithLabel(LABEL, 'open')).find((i) => i.title === TITLE);
  const run = env.RUN_URL ? ` ([run](${env.RUN_URL}))` : '';
  if (outcome.error) {
    const text = `${env.MENTION ? `${env.MENTION} ` : ''}The live smoke check failed${run}: \`${outcome.error.replace(/`/g, "'")}\``;
    if (open) return githubApi.comment(open.number, text);
    await githubApi.ensureLabel(LABEL, 'b60205', 'The daily live smoke check against production (scripts/smoke/live.js)');
    const issue = await githubApi.createIssue(
      TITLE,
      'The daily live smoke check (`.github/workflows/live-smoke.yml`, `scripts/smoke/live.js`) signs in as the smoke account, asks Revo one question and fetches a verse through the worker, all in production. It failed; each failing run comments here, and the first passing run closes this. TESTING.md says what each step needs.',
      [LABEL],
    );
    return githubApi.comment(issue.number, text);
  }
  if (open && outcome.ok) {
    await githubApi.comment(open.number, `Passing again${run}.`);
    await githubApi.update(open.number, { state: 'closed', state_reason: 'completed' });
  }
}

async function main() {
  let outcome;
  try {
    outcome = await run();
  } catch (err) {
    outcome = { error: err instanceof StepError ? err.message : `unexpected: ${excerpt(err.message)}` };
  }
  if (outcome.skipped) console.log(`::notice title=Live smoke check::Skipped, ${outcome.skipped} (TESTING.md).`);
  else if (outcome.error) console.log(`::error title=Live smoke check::${outcome.error}`);
  else console.log(`Live smoke check passed in ${outcome.secs} s (Revo answered${outcome.cached ? ' from the day’s kept answer' : ''}, ${outcome.replyChars} characters; the worker served 1:1).`);
  if (process.argv.includes('--report') && !outcome.skipped) await report(outcome);
  if (outcome.error) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`::error title=Live smoke check::${excerpt(err.message)}`);
    process.exit(1);
  });
}

module.exports = { checkAnswer, excerpt, smokeContext };
