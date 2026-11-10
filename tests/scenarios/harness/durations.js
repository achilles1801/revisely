#!/usr/bin/env node
// Refreshes tests/scenarios/durations.json (what harness/sequencer.js balances the shards by) from
// a CI run's scenario shard logs: each file's time as Jest printed it ("PASS scenarios/x.tsx (40.8 s)";
// files Jest printed no time for took under 5 s and count 3). A run that ran the suite twice (a PR that
// changes the harness) gives each file its mean.
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
const times = {};
for (const job of jobs) {
  // The logs hold Jest's colours, which gh refuses to print without this.
  const log = gh('api', '--allow-escape-sequences', `repos/{owner}/{repo}/actions/jobs/${job.databaseId}/logs`);
  for (const m of log.matchAll(/(?:PASS|FAIL)\s+((?:scenarios|properties)\/\S+)(?:\s+\(([\d.]+) s\))?/g)) {
    (times[m[1]] ??= []).push(m[2] ? Number(m[2]) : 3);
  }
}
const mean = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
const sorted = Object.fromEntries(
  Object.entries(times)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, xs]) => [file, mean(xs)]),
);
fs.writeFileSync(path.join(__dirname, '..', 'durations.json'), `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} files, ${Object.values(sorted).reduce((a, b) => a + b, 0)} s in all`);
