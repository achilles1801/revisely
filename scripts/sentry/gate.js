#!/usr/bin/env node
// Release-health gate for promotion: the preview update must have run enough
// sessions, crash-free at or above the bar. Usage: node gate.js <update group>
// Env: MIN_SESSIONS (default 5), MIN_CRASH_FREE (default 0.99), STATS_PERIOD (14d).

const fs = require('fs');
const { sentryApi } = require('./api');
const { sessionsByRelease, updateHealth, gate } = require('./logic');

async function main() {
  const group = process.argv[2];
  if (!group) throw new Error('Usage: gate.js <update group>');
  const minSessions = Number(process.env.MIN_SESSIONS || 5);
  const minCrashFree = Number(process.env.MIN_CRASH_FREE || 0.99);
  const releases = sessionsByRelease(
    await sentryApi.sessionsByRelease({ environment: 'preview', statsPeriod: process.env.STATS_PERIOD || '14d' }),
  );
  const health = updateHealth(releases, group);
  const decision = gate(health, { minSessions, minCrashFree });
  const summary = `${decision.ok ? '✅' : '⛔'} ${decision.reason} (releases: ${health.releases.join(', ') || 'none'})`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Release health\n${summary}\n`);
  if (!decision.ok) process.exit(2);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
