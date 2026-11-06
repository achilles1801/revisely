#!/usr/bin/env node
// The weekly stats digest (.github/workflows/stats-digest.yml): last week's App
// Store downloads against the week before, top countries and totals since
// launch, as a comment on the "App stats (weekly digest)" issue mentioning the
// owner (GitHub emails it). Google Play joins once the app is live there.
//
//   node scripts/stats/weekly.js            post the comment
//   node scripts/stats/weekly.js --dry-run  print it instead

const { salesSummary, token } = require('./appStore');
const D = require('./digest');

/**
 * The Ask coach's ledger days for the week (C6), from the coachDigestDays function. The workflow
 * proves who it is with its GitHub Actions OIDC token (id-token: write), audience revisely-coach-digest.
 * Returns null when the workflow has no token (a laptop run); throws on a failed call (the digest
 * still posts without the line).
 */
const COACH_DIGEST_URL = process.env.COACH_DIGEST_URL || 'https://us-central1-revision-buddy-3a398.cloudfunctions.net/coachDigestDays';
async function coachDays(start, end) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) return null;
  const idRes = await fetch(requestUrl + '&audience=revisely-coach-digest', { headers: { Authorization: 'Bearer ' + requestToken } });
  if (!idRes.ok) throw new Error('GitHub did not issue the token (HTTP ' + idRes.status + ')');
  const { value } = await idRes.json();
  const res = await fetch(COACH_DIGEST_URL + '?start=' + start + '&end=' + end, { headers: { Authorization: 'Bearer ' + value } });
  if (!res.ok) throw new Error('the coach ledger did not answer (HTTP ' + res.status + ')');
  const body = await res.json();
  return Array.isArray(body.days) ? body.days : [];
}

const TITLE = 'App stats (weekly digest)';
const LABEL = 'stats-digest';
/** 1.0's release (submitted Oct 4 2026, released on approval); earlier days hold nothing. */
const LAUNCH = process.env.STATS_LAUNCH_DATE || '2026-10-01';
const APPLE_ID = process.env.ASC_APP_ID || '6767990248';

/** The week, the week before and the totals since launch, from Sales and Trends. */
async function appStore(now, env = process.env, get) {
  const auth = get ? null : token(env);
  const fetchReport = get || ((date, frequency) => salesSummary(date, { frequency, env, auth }));
  const cache = new Map();
  const daily = (d) => {
    if (!cache.has(d)) cache.set(d, fetchReport(d, 'DAILY'));
    return cache.get(d);
  };
  const sumDays = async (days, missing) => {
    let t = D.EMPTY();
    for (const d of days) {
      const r = await daily(d);
      if (r.missing) missing?.push(d);
      else t = D.add(t, D.tally(r.rows, APPLE_ID));
    }
    return t;
  };

  const { week, previous } = D.weeks(now);
  const missing = [];
  const thisWeek = await sumDays(week, missing);
  const lastWeek = await sumDays(previous);

  const today = D.ymd(now);
  let total = D.EMPTY();
  for (const month of D.monthsSince(LAUNCH, now)) {
    // A month's report comes out days after it ends, and until then Apple answers
    // "no sales", as for an empty month. Either way its days give the answer.
    const r = await fetchReport(month, 'MONTHLY');
    const usable = !r.missing && r.rows.length > 0;
    total = D.add(total, usable ? D.tally(r.rows, APPLE_ID) : await sumDays(D.daysOfMonth(month, LAUNCH, today)));
  }
  total = D.add(total, await sumDays(D.daysOfMonth(today.slice(0, 7), LAUNCH, today)));

  return { weekDays: week, appStore: { week: thisWeek, previous: lastWeek, total, missing } };
}

/** Google Play installs, uninstalls and active devices: not live yet (see CLAUDE.md, Stats). */
async function play() {
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const now = new Date();
  let weekDays = D.weeks(now).week;
  let store = null;
  try {
    const r = await appStore(now);
    weekDays = r.weekDays;
    store = r.appStore;
  } catch (err) {
    // The digest still goes out (with Play, later); the run fails below so GitHub emails it.
    console.error(`::error title=App Store stats::${err.message}`);
  }
  const body = D.renderDigest({
    weekDays,
    launch: LAUNCH,
    appStore: store,
    play: await play(),
    mention: process.env.MENTION || '',
  });
  // The Ask coach line (C6), when the workflow gives the week's coachLedgerDay totals as JSON.
  let coach = '';
  try {
    const days = process.env.COACH_LEDGER_WEEK_JSON
      ? JSON.parse(process.env.COACH_LEDGER_WEEK_JSON)
      : await coachDays(weekDays[0], weekDays[weekDays.length - 1]);
    if (days) coach = '\n\n' + D.coachLine(days);
  } catch (err) {
    console.error('::warning title=Ask coach ledger::' + err.message);
  }
  const full = body + coach;
  if (dryRun) {
    console.log(full);
  } else {
    const { githubApi } = require('../sentry/api');
    const open = await githubApi.issuesWithLabel(LABEL, 'open');
    let issue = open.find((i) => i.title === TITLE);
    if (!issue) {
      await githubApi.ensureLabel(LABEL, '1d76db', 'Weekly app stats digest');
      issue = await githubApi.createIssue(
        TITLE,
        'Every Monday the stats workflow adds a comment here: App Store first-time downloads, re-downloads and updates for the week, against the week before, the top countries and totals since launch (Google Play once it is live). Pin this issue; subscribe to get it by email.',
        [LABEL],
      );
    }
    await githubApi.comment(issue.number, full);
    console.log(`Posted the digest on #${issue.number}`);
  }
  if (!store) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`::error title=Stats digest::${err.message}`);
    process.exit(1);
  });
}

module.exports = { appStore, LAUNCH };
