#!/usr/bin/env node
// Sends the hour's Sentry and App Store totals (totals.js) to the metricsTotals function, proving it is
// this repository's metrics.yml on main with the job's GitHub OIDC token (audience revisely-metrics),
// then posts any alarm that just started on the "Metrics alerts" issue, mentioning the owner (GitHub
// emails it and the GitHub app pushes it). Run by .github/workflows/metrics.yml.
//
//   node scripts/metrics/push.js metrics-totals.json

const fs = require('fs');
const { githubApi } = require('../sentry/api');

const URL = process.env.METRICS_TOTALS_URL || 'https://us-central1-revision-buddy-3a398.cloudfunctions.net/metricsTotals';
const TITLE = 'Metrics alerts';
const LABEL = 'metrics-alert';

async function oidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) throw new Error('No GitHub OIDC token (the job needs id-token: write)');
  const res = await fetch(`${url}&audience=revisely-metrics`, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!res.ok) throw new Error(`GitHub did not issue the token (HTTP ${res.status})`);
  return (await res.json()).value;
}

/** The alarm lines as posted: plain text, no mentions or markup from the values. */
function alertBody(alarms, mention) {
  const clean = (s) => String(s).replace(/[`<>@\r\n]/g, '').slice(0, 200);
  return [`${mention} ⚠️ ${alarms.length === 1 ? 'An alarm started' : `${alarms.length} alarms started`}:`, '', ...alarms.map((a) => `- **${clean(a.title)}**: ${clean(a.value)}`), '', '_Details on the metrics console._'].join('\n');
}

async function main() {
  const file = process.argv[2] || 'metrics-totals.json';
  const body = fs.readFileSync(file, 'utf8');
  const res = await fetch(URL, { method: 'POST', headers: { Authorization: `Bearer ${await oidcToken()}`, 'Content-Type': 'application/json' }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`metricsTotals answered ${res.status}: ${text.slice(0, 200)}`);
  const { newAlarms = [] } = JSON.parse(text);
  console.log(`Totals stored. New alarms: ${newAlarms.map((a) => a.id).join(', ') || 'none'}`);
  if (!newAlarms.length) return;
  const open = await githubApi.issuesWithLabel(LABEL, 'open');
  let issue = open.find((i) => i.title === TITLE);
  if (!issue) {
    await githubApi.ensureLabel(LABEL, 'd93f0b', 'Metrics console alarms');
    issue = await githubApi.createIssue(TITLE, 'The Metrics workflow posts here when an alarm starts (Revo failing, resting or capped, spend, function errors, crash-free). The metrics console has the detail. Subscribe to get them by email and in the GitHub app.', [LABEL]);
  }
  await githubApi.comment(issue.number, alertBody(newAlarms, process.env.MENTION || ''));
  console.log(`Posted on #${issue.number}`);
}

if (require.main === module) main().catch((err) => { console.error(`::error title=Metrics push::${err.message}`); process.exit(1); });

module.exports = { alertBody };
