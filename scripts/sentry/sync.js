#!/usr/bin/env node
// New, regressed and escalating Sentry issues → GitHub issues (labelled `sentry`,
// and `claude-fix` so Claude opens a fix PR). Also raises a `release-health`
// issue when a production release's crash-free rate drops below the bar.
// Run by .github/workflows/sentry.yml every 30 minutes.
//
// Writes `issues=<numbers>` to $GITHUB_OUTPUT for the issues it opened.

const fs = require('fs');
const api = require('./api');
const { findTracked, issueTitle, issueBody, sessionsByRelease, productionAlerts, pct } = require('./logic');

const DEFAULTS = {
  maxNew: Number(process.env.MAX_NEW_ISSUES || 5),
  autoFix: process.env.AUTO_FIX === 'true',
  mention: process.env.MENTION || '',
  alertMinSessions: Number(process.env.ALERT_MIN_SESSIONS || 50),
  alertMinCrashFree: Number(process.env.ALERT_MIN_CRASH_FREE || 0.99),
};

// Problem reports (user feedback) hold users' own words: never copied into
// public GitHub issues. The daily report counts them.
const QUERIES = ['is:new', 'is:regressed', 'is:escalating'].map(
  (s) => `is:unresolved ${s} !issue.category:feedback`,
);

async function sync({ sentryApi, githubApi }, opts = {}) {
  const MAX_NEW = opts.maxNew ?? DEFAULTS.maxNew;
  const AUTO_FIX = opts.autoFix ?? DEFAULTS.autoFix;
  const MENTION = opts.mention ?? DEFAULTS.mention;
  const ALERT_MIN_SESSIONS = opts.alertMinSessions ?? DEFAULTS.alertMinSessions;
  const ALERT_MIN_CRASH_FREE = opts.alertMinCrashFree ?? DEFAULTS.alertMinCrashFree;
  await githubApi.ensureLabel('sentry', 'e5484d', 'Raised from Sentry');
  await githubApi.ensureLabel('claude-fix', '7c3aed', 'Claude investigates and opens a fix PR into develop');
  await githubApi.ensureLabel('release-health', 'f08c00', 'Crash-free rate below the bar');

  const tracked = await githubApi.issuesWithLabel('sentry');
  const seen = new Set();
  const opened = [];
  for (const q of QUERIES) {
    for (const issue of await sentryApi.issues(q, '24h')) {
      if (seen.has(issue.id)) continue;
      seen.add(issue.id);
      const existing = findTracked(tracked, issue.id);
      if (existing) {
        if (existing.state === 'closed' && issue.substatus === 'regressed') {
          await githubApi.reopen(existing.number);
          await githubApi.comment(existing.number, `Regressed in Sentry (last seen ${issue.lastSeen}): reopened. ${issue.permalink}`);
          console.log(`Reopened #${existing.number} for ${issue.shortId}`);
        }
        continue;
      }
      if (opened.length >= MAX_NEW) {
        console.log(`More than ${MAX_NEW} new issues; ${issue.shortId} waits for the next run.`);
        continue;
      }
      const event = await sentryApi.latestEvent(issue.id).catch(() => null);
      const labels = ['sentry', ...(AUTO_FIX ? ['claude-fix'] : [])];
      const gh = await githubApi.createIssue(issueTitle(issue), issueBody(issue, event), labels);
      tracked.push(gh);
      opened.push(gh.number);
      console.log(`Opened #${gh.number} for ${issue.shortId} (${issue.substatus})`);
    }
  }

  // Production release health.
  const releases = sessionsByRelease(await sentryApi.sessionsByRelease({ environment: 'production', statsPeriod: '24h' }));
  const alerts = productionAlerts(releases, { minSessions: ALERT_MIN_SESSIONS, minCrashFree: ALERT_MIN_CRASH_FREE });
  if (alerts.length) {
    const open = await githubApi.issuesWithLabel('release-health', 'open');
    for (const r of alerts) {
      const key = `<!-- release-health:${r.release} -->`;
      if (open.some((i) => (i.body || '').includes(key))) continue;
      const body = [
        key,
        `${MENTION} Production release \`${r.release}\` is at ${pct(r.crashFree)} crash-free sessions over the last 24 h (${r.crashed} crashed of ${r.sessions}; bar ${pct(ALERT_MIN_CRASH_FREE)}).`,
        '',
        'Nothing was rolled back. To roll back to the previous production update: Actions → Promote to production → Run workflow → `group` = the previous production update group, `rollback` = true, then approve (CLAUDE.md, "Rolling back").',
      ].join('\n');
      const gh = await githubApi.createIssue(`[Release health] ${r.release.replace(/^com\.revisionbuddy\.app@/, '')} at ${pct(r.crashFree)} crash-free`, body, ['release-health']);
      console.log(`Opened release-health #${gh.number} for ${r.release}`);
    }
  }

  return opened;
}

if (require.main === module) {
  sync(api)
    .then((opened) => {
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `issues=${opened.join(',')}\n`);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}

module.exports = { sync };
