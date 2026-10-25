#!/usr/bin/env node
// New, regressed and escalating Sentry issues → GitHub issues labelled `sentry`. Also raises a
// `release-health` issue when a production release's crash-free rate drops below the bar.
// Run by .github/workflows/sentry.yml every 30 minutes.
//
// It never starts Claude: anyone can send events with the app's public DSN, so the owner decides
// which issues Claude works on (the `claude-fix` label, claude-fix.yml).
//
// State lives only in GitHub: each issue carries a marker with its Sentry id, found again on the
// next run. A run that fails halfway (an API error) leaves nothing a later run misreads: what was
// opened is found by its marker, what wasn't is opened next time.

const api = require('./api');
const { findTracked, issueTitle, issueBody, sessionsByRelease, productionAlerts, pct, safe, shortRelease, sanitize } = require('./logic');

const DEFAULTS = {
  maxNew: Number(process.env.MAX_NEW_ISSUES || 5),
  // No new issues while this many `sentry` issues are open (a flood of forged events stops here).
  maxOpen: Number(process.env.MAX_OPEN_ISSUES || 25),
  mention: process.env.MENTION || '',
  alertMinSessions: Number(process.env.ALERT_MIN_SESSIONS || 50),
  alertMinCrashFree: Number(process.env.ALERT_MIN_CRASH_FREE || 0.99),
};

// Problem reports (user feedback) hold users' own words: never copied into
// public GitHub issues. The daily report counts them.
const QUERIES = ['is:new', 'is:regressed', 'is:escalating'].map(
  (s) => `is:unresolved ${s} !issue.category:feedback`,
);

/** Seen in Sentry after the GitHub issue was closed. */
function seenSinceClosed(sentryIssue, ghIssue) {
  const last = Date.parse(sentryIssue.lastSeen);
  const closed = Date.parse(ghIssue.closed_at);
  return Number.isFinite(last) && Number.isFinite(closed) && last > closed;
}

async function syncIssues({ sentryApi, githubApi }, { maxNew, maxOpen }, log) {
  const tracked = await githubApi.issuesWithLabel('sentry');
  let open = tracked.filter((i) => !i.pull_request && i.state === 'open').length;
  const seen = new Set();
  const opened = [];
  const errors = [];
  for (const q of QUERIES) {
    for (const issue of await sentryApi.issues(q, '24h')) {
      if (!/^\d+$/.test(String(issue?.id)) || seen.has(issue.id)) continue;
      seen.add(issue.id);
      try {
        const existing = findTracked(tracked, issue.id);
        if (existing) {
          // Reopen only for events after it was closed: Sentry keeps an issue "regressed" for days,
          // and closing it on GitHub must stick unless it really happens again.
          if (existing.state === 'closed' && issue.substatus === 'regressed' && seenSinceClosed(issue, existing)) {
            await githubApi.reopen(existing.number);
            existing.state = 'open';
            open++;
            await githubApi.comment(
              existing.number,
              `Happened again in Sentry after this was closed (last seen ${safe(issue.lastSeen, 'date')}): reopened. ${safe(issue.permalink, 'link', '')}`,
            );
            log(`Reopened #${existing.number} for ${safe(issue.shortId, 'shortId', issue.id)}`);
          }
          continue;
        }
        if (opened.length >= maxNew || open >= maxOpen) {
          log(`Limit reached (${opened.length} opened this run, ${open} open); ${safe(issue.shortId, 'shortId', issue.id)} waits.`);
          continue;
        }
        const event = await sentryApi.latestEvent(issue.id).catch(() => null);
        const gh = await githubApi.createIssue(issueTitle(issue), issueBody(issue, event), ['sentry']);
        tracked.push(gh);
        opened.push(gh.number);
        open++;
        log(`Opened #${gh.number} for ${safe(issue.shortId, 'shortId', issue.id)} (${issue.substatus})`);
      } catch (err) {
        errors.push(`Sentry issue ${issue.id}: ${err.message || err}`);
      }
    }
  }
  return { opened, errors };
}

async function syncHealth({ sentryApi, githubApi }, { mention, alertMinSessions, alertMinCrashFree }, log) {
  const releases = sessionsByRelease(await sentryApi.sessionsByRelease({ environment: 'production', statsPeriod: '24h' }));
  // Release names come from the app's sessions (forgeable): only ones that look like ours.
  const alerts = productionAlerts(releases, { minSessions: alertMinSessions, minCrashFree: alertMinCrashFree }).filter(
    (r) => safe(r.release, 'release', null),
  );
  if (!alerts.length) return [];
  const open = await githubApi.issuesWithLabel('release-health', 'open');
  const raised = [];
  for (const r of alerts) {
    const key = `<!-- release-health:${r.release} -->`;
    if (open.some((i) => (i.body || '').includes(key))) continue;
    const body = [
      key,
      `${mention} Production release \`${r.release}\` is at ${pct(r.crashFree)} crash-free sessions over the last 24 h (${r.crashed} crashed of ${r.sessions}; bar ${pct(alertMinCrashFree)}).`,
      '',
      'Nothing was rolled back. To roll back to the previous production update: Actions → Promote to production → Run workflow → `group` = the previous production update group, `rollback` = true, then approve (CLAUDE.md, "Rolling back").',
    ].join('\n');
    const gh = await githubApi.createIssue(
      `[Release health] ${sanitize(shortRelease(r.release), { max: 80 })} at ${pct(r.crashFree)} crash-free`,
      body,
      ['release-health'],
    );
    raised.push(gh.number);
    log(`Opened release-health #${gh.number} for ${r.release}`);
  }
  return raised;
}

/**
 * One run. Issues and release health are handled separately, so a failure in one doesn't stop the
 * other; if anything failed, it throws at the end (the run shows red) after doing what it could.
 */
async function sync(deps, opts = {}, log = console.log) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
  const { githubApi } = deps;
  await githubApi.ensureLabel('sentry', 'e5484d', 'Raised from Sentry');
  await githubApi.ensureLabel('claude-fix', '7c3aed', 'The owner adds this to have Claude open a fix PR into develop');
  await githubApi.ensureLabel('release-health', 'f08c00', 'Crash-free rate below the bar');

  const errors = [];
  let opened = [];
  try {
    const r = await syncIssues(deps, o, log);
    opened = r.opened;
    errors.push(...r.errors);
  } catch (err) {
    errors.push(`Issues: ${err.message || err}`);
  }
  let raised = [];
  try {
    raised = await syncHealth(deps, o, log);
  } catch (err) {
    errors.push(`Release health: ${err.message || err}`);
  }
  if (errors.length) {
    const err = new Error(`Sync finished with errors:\n${errors.join('\n')}`);
    err.result = { opened, raised };
    throw err;
  }
  return { opened, raised };
}

if (require.main === module) {
  sync(api).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { sync };
