#!/usr/bin/env node
// Release-health gate for promotion: each preview update must have run enough sessions, crash-free
// at or above the bar. One update group per platform (iOS and Android have different runtimes, so a
// push publishes two groups), and every one must pass.
// Usage: node gate.js [<label>:]<update group> [...]   e.g. gate.js ios:ff76d17c-… android:51b39a90-…
// Env: MIN_SESSIONS (default 0: none needed; the sessions there are must still pass MIN_CRASH_FREE),
// MIN_CRASH_FREE (default 0.99), STATS_PERIOD (14d).
// Exit 0: may be promoted. 2: below the bar. 1: couldn't tell (a bad bar, Sentry unreachable).
// Anything but 0 stops the promotion.

const fs = require('fs');
const { sentryApi } = require('./api');
const { sessionsByRelease, updateHealth, gate, parseBar } = require('./logic');

/** "ios:<group>" → { label: 'ios', group }; a bare group is labelled by its first 8 characters. */
function parseTarget(arg) {
  const m = /^([a-z]+):(.+)$/i.exec(arg);
  return m ? { label: m[1], group: m[2] } : { label: arg.slice(0, 8), group: arg };
}

/** Each target's decision, and whether all passed. */
function gateAll(releases, targets, bar) {
  const results = targets.map((t) => {
    const health = updateHealth(releases, t.group);
    return { ...t, health, decision: gate(health, bar) };
  });
  return { ok: results.length > 0 && results.every((r) => r.decision.ok), results };
}

async function main() {
  const targets = process.argv.slice(2).filter(Boolean).map(parseTarget);
  if (!targets.length) throw new Error('Usage: gate.js [<label>:]<update group> [...]');
  const bar = parseBar(process.env);
  const releases = sessionsByRelease(
    await sentryApi.sessionsByRelease({ environment: 'preview', statsPeriod: process.env.STATS_PERIOD || '14d' }),
  );
  const { ok, results } = gateAll(releases, targets, bar);
  const lines = results.map(
    (r) => `- ${r.decision.ok ? '✅' : '⛔'} ${r.label}: ${r.decision.reason} (releases: ${r.health.releases.join(', ') || 'none'})`,
  );
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Release health\n${lines.join('\n')}\n`);
  if (!ok) process.exit(2);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`::error title=Release health not checked::${err.message || err} Nothing was promoted.`);
    process.exit(1);
  });
}

module.exports = { parseTarget, gateAll };
