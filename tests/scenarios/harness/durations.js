#!/usr/bin/env node
// Refreshes tests/scenarios/durations.json (what harness/sequencer.js balances the shards by) from
// a CI run's scenario shard logs: each file's time as Jest printed it ("PASS scenarios/x.tsx (40.8 s)";
// files Jest printed no time for took under 5 s and count 3).
//   node tests/scenarios/harness/durations.js <run id>      (gh, signed in)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const run = process.argv[2];
if (!run) {
  console.error('Usage: node tests/scenarios/harness/durations.js <run id>');
  process.exit(64);
}
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const jobs = JSON.parse(gh('run', 'view', run, '--json', 'jobs')).jobs.filter((j) => /Scenario tests \(\d\/\d\)/.test(j.name));
if (jobs.length === 0) throw new Error(`run ${run} has no scenario shards`);
const out = {};
for (const job of jobs) {
  const log = gh('api', `repos/{owner}/{repo}/actions/jobs/${job.databaseId}/logs`);
  for (const m of log.matchAll(/(?:PASS|FAIL)\s+((?:scenarios|properties)\/\S+)(?:\s+\(([\d.]+) s\))?/g)) {
    out[m[1]] = m[2] ? Math.round(Number(m[2])) : 3;
  }
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(path.join(__dirname, '..', 'durations.json'), `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} files, ${Object.values(sorted).reduce((a, b) => a + b, 0)} s in all`);
