#!/usr/bin/env node
// Release-health gate for promotion: the preview update must have run enough
// sessions, crash-free at or above the bar. Usage: node gate.js <update group>
// Env: MIN_SESSIONS (default 5), MIN_CRASH_FREE (default 0.99), STATS_PERIOD (14d).
// Exit 0: may be promoted. 2: below the bar. 1: couldn't tell (a bad bar, Sentry unreachable).
// Anything but 0 stops the promotion.

const fs = require('fs');
const { sentryApi } = require('./api');
const { sessionsByRelease, updateHealth, gate, parseBar } = require('./logic');

async function main() {
  const group = process.argv[2];
  if (!group) throw new Error('Usage: gate.js <update group>');
  const bar = parseBar(process.env);
  const releases = sessionsByRelease(
    await sentryApi.sessionsByRelease({ environment: 'preview', statsPeriod: process.env.STATS_PERIOD || '14d' }),
  );
  const health = updateHealth(releases, group);
  const decision = gate(health, bar);
  const summary = `${decision.ok ? '✅' : '⛔'} ${decision.reason} (releases: ${health.releases.join(', ') || 'none'})`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Release health\n${summary}\n`);
  if (!decision.ok) process.exit(2);
}

main().catch((err) => {
  console.error(`::error title=Release health not checked::${err.message || err} Nothing was promoted.`);
  process.exit(1);
});
