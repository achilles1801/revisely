#!/usr/bin/env node
// Approves a run's screenshots as the baselines (.maestro/README.md, "Screenshots"):
//
//   node .maestro/visual/approve.mjs <run id> [screen ...] [--platform ios|android] [--include-pending]
//   node .maestro/visual/approve.mjs --from .maestro/build/results [screen ...]   (a local run)
//
// Downloads the run's e2e-<platform>-screens-… artifacts (with `gh`), normalises each
// capture as the check does, and writes .maestro/baselines/<platform>/<name>.png. A
// baseline the capture still matches is left as it is (no churn). Screens being
// redesigned (PENDING in screens.mjs) are skipped unless named or --include-pending.
// Then commit .maestro/baselines/ in the same PR as the change.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { baselinePath, compareImages, findCaptures, normalise, pendingReason, readPng, writePng, ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const values = new Set([valueOf('--platform'), valueOf('--from'), valueOf('-R')].filter(Boolean));
const positional = args.filter((a) => !a.startsWith('--') && a !== '-R' && !values.has(a));
const from = valueOf('--from');
const runId = from ? null : positional.shift();
const only = new Set(positional.map((n) => n.replace(/\.png$/, '')));
const platforms = valueOf('--platform') ? [valueOf('--platform')] : ['ios', 'android'];
const repo = valueOf('-R');

if (!from && !/^\d+$/.test(runId ?? '')) {
  console.error(
    'usage: approve.mjs <run id> [screen ...] [--platform ios|android] [--include-pending] [-R owner/repo]\n' +
      '       approve.mjs --from <results dir> [screen ...] [--platform …]',
  );
  process.exit(2);
}

const gh = (...a) => execFileSync('gh', [...a, ...(repo ? ['-R', repo] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

let dir = from ? path.resolve(from) : null;
if (runId) {
  const run = JSON.parse(gh('run', 'view', runId, '--json', 'headBranch,headSha,status,conclusion,workflowName,url'));
  console.log(`Run ${runId} (${run.workflowName}) on ${run.headBranch} ${run.headSha.slice(0, 7)}: ${run.status} ${run.conclusion ?? ''}`);
  console.log(`  ${run.url}`);
  let branch = '';
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {}
  if (branch && run.headBranch !== branch) {
    console.warn(`  Note: this checkout is on ${branch}, the run on ${run.headBranch}.`);
  }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), `revisely-screens-${runId}-`));
  for (const p of platforms) {
    try {
      gh('run', 'download', runId, '-p', `e2e-${p}-screens-*`, '-D', path.join(dir, p));
    } catch {
      console.log(`  No ${p} screenshots in this run.`);
    }
  }
}

const done = { added: [], updated: [], unchanged: [], skipped: [] };
for (const platform of platforms) {
  for (const c of findCaptures(dir, platform)) {
    const id = `${platform}/${c.name}`;
    if (only.size && !only.has(c.name) && !only.has(id)) continue;
    const why = pendingReason(c.name);
    if (why && !only.size && !flags.has('--include-pending')) {
      done.skipped.push(`${id} (${why})`);
      continue;
    }
    const cur = normalise(readPng(c.file), platform, c.name);
    const file = baselinePath(platform, c.name);
    if (fs.existsSync(file)) {
      const r = compareImages(readPng(file), cur);
      if (r.status === 'same') {
        done.unchanged.push(id);
        continue;
      }
      writePng(file, cur);
      done.updated.push(`${id}${r.pixels != null ? ` (${r.pixels} pixels)` : ' (new size)'}`);
    } else {
      writePng(file, cur);
      done.added.push(id);
    }
  }
}
if (runId) fs.rmSync(dir, { recursive: true, force: true });

for (const [k, list] of Object.entries(done)) {
  if (list.length) console.log(`${k}:\n  ${list.join('\n  ')}`);
}
if (only.size) {
  const seen = new Set([...done.added, ...done.updated, ...done.unchanged].map((s) => s.split(' ')[0].split('/')[1]));
  const absent = [...only].filter((n) => !seen.has(n.split('/').pop()));
  if (absent.length) console.warn(`Not in this run: ${absent.join(', ')}`);
}
if (done.added.length || done.updated.length) {
  console.log('\nLook at them, then commit .maestro/baselines/ with the change.');
} else {
  console.log('\nNothing to change.');
}
