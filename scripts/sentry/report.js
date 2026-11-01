#!/usr/bin/env node
// The daily health report, posted as a comment on the pinned "App health" issue
// (mentioning the owner, so GitHub emails it). Run by .github/workflows/health-report.yml.

const { sentryApi, githubApi, SENTRY } = require('./api');
const { sessionsByRelease, productionAlerts, dailyReport } = require('./logic');

const MENTION = process.env.MENTION || '';
const TITLE = 'App health (daily report)';

async function main() {
  const q = (s) => sentryApi.issues(s, '24h');
  const onPlatform = (os) => sentryApi.issues(`is:unresolved !issue.category:feedback os.name:${os}`, '24h', 100);
  const [newIssues, regressed, top, feedback, prod, preview, ios, android] = await Promise.all([
    q('is:unresolved firstSeen:-24h !issue.category:feedback'),
    q('is:unresolved is:regressed !issue.category:feedback'),
    sentryApi.issues('is:unresolved !issue.category:feedback', '24h', 5),
    q('issue.category:feedback'),
    sentryApi.sessionsByRelease({ environment: 'production', statsPeriod: '24h' }),
    sentryApi.sessionsByRelease({ environment: 'preview', statsPeriod: '24h' }),
    // Sentry groups sessions by release only, not by OS: the platform split comes from issues.
    onPlatform('iOS'),
    onPlatform('Android'),
  ]);
  const production = sessionsByRelease(prod);
  const alerts = productionAlerts(production, { minSessions: 50, minCrashFree: 0.99 });
  // Problem reports are users' own words: counted here, read in Sentry.
  const feedbackSummary = feedback.map((f) => ({
    shortId: f.shortId,
    permalink: `https://${SENTRY.org}.sentry.io/feedback/`,
    title: 'Problem report (read it in Sentry)',
    count: f.count,
    userCount: f.userCount,
  }));
  const body = dailyReport({
    date: new Date().toISOString().slice(0, 10),
    newIssues,
    regressed,
    top,
    feedback: feedbackSummary,
    production,
    preview: sessionsByRelease(preview),
    alerts,
    mention: MENTION,
    platforms: { ios, android },
  });

  const open = await githubApi.issuesWithLabel('health-report', 'open');
  let issue = open.find((i) => i.title === TITLE);
  if (!issue) {
    await githubApi.ensureLabel('health-report', '2f9e8f', 'Daily app health report');
    issue = await githubApi.createIssue(TITLE, 'Each day the health workflow adds a comment here with the last 24 hours from Sentry. Pin this issue; subscribe to get it by email.', ['health-report']);
  }
  await githubApi.comment(issue.number, body);
  console.log(`Posted the report on #${issue.number}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
