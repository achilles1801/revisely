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
    const r = await fetchReport(month, 'MONTHLY');
    total = D.add(total, r.missing ? await sumDays(D.daysOfMonth(month, LAUNCH, today)) : D.tally(r.rows, APPLE_ID));
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
  if (dryRun) {
    console.log(body);
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
    await githubApi.comment(issue.number, body);
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
