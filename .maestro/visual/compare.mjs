#!/usr/bin/env node
// Compares the screenshots a job's flows took with the approved baselines
// (.maestro/README.md, "Screenshots"):
//
//   node .maestro/visual/compare.mjs <ios|android> [--results <dir>] [--out <dir>]
//
// --results: the flows' results (.maestro/build/results); --out: where boards,
// normalised captures and results.json go (.maestro/build/visual/<platform>).
//
// A screen that differs from its baseline by more than screens.mjs's MATCH fails
// (exit 1), with a board (baseline | this run | differences). A screen with no
// baseline yet is reported, not failed. In GitHub Actions it writes a table to
// the job summary and an annotation for each changed screen.

import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  baselinePath,
  board,
  compareImages,
  findCaptures,
  normalise,
  pendingReason,
  readPng,
  writePng,
} from './lib.mjs';

const args = process.argv.slice(2);
const platform = args[0];
if (platform !== 'ios' && platform !== 'android') {
  console.error('usage: compare.mjs <ios|android> [--results <dir>] [--out <dir>]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
};
const results = opt('--results', path.join(ROOT, '.maestro/build/results'));
const out = opt('--out', path.join(ROOT, '.maestro/build/visual', platform));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const started = Date.now();
const captures = findCaptures(results, platform);
const rows = [];
for (const c of captures) {
  const cur = normalise(readPng(c.file), platform, c.name);
  writePng(path.join(out, 'captures', `${c.name}.png`), cur);
  const basePath = baselinePath(platform, c.name);
  const row = { name: c.name, flow: c.flow, attempt: c.attempt };
  if (!fs.existsSync(basePath)) {
    const why = pendingReason(c.name);
    rows.push({ ...row, status: why ? 'pending' : 'new', note: why ?? '' });
    continue;
  }
  const base = readPng(basePath);
  const r = compareImages(base, cur);
  row.status = r.status;
  row.pixels = r.pixels;
  row.share = r.pixels == null ? null : r.pixels / (cur.width * cur.height);
  if (r.status === 'size') {
    row.note = `baseline ${base.width}×${base.height}, this run ${cur.width}×${cur.height}: another device?`;
    writePng(path.join(out, 'boards', `${c.name}.png`), board(base, cur, null, null));
  } else if (r.pixels > 0) {
    // Any difference gets a board, a change past the tolerance and noise under it alike.
    writePng(path.join(out, 'boards', `${c.name}.png`), board(base, cur, r.diff, r.box));
  }
  rows.push(row);
}
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ platform, screens: rows }, null, 2));

const label = {
  same: 'same',
  changed: '**changed**',
  new: 'no baseline yet',
  pending: 'no baseline (being redesigned)',
  size: 'not compared (size)',
};
const pct = (s) => (s == null ? '' : `${(s * 100).toFixed(s < 0.001 ? 4 : 2)}%`);
let table = '| Screen | Flow | Result | Pixels changed | |\n| --- | --- | --- | --- | --- |\n';
for (const r of rows) {
  const px = r.pixels == null ? '' : `${r.pixels.toLocaleString('en')} (${pct(r.share)})`;
  const flow = r.attempt ? `${r.flow} (retry ${r.attempt})` : r.flow;
  table += `| ${r.name} | ${flow} | ${label[r.status]} | ${px} | ${r.note ?? ''} |\n`;
}
const changed = rows.filter((r) => r.status === 'changed');
const missing = rows.filter((r) => r.status === 'new' || r.status === 'size');
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(table);
console.log(`${rows.length} screens in ${secs}s: ${changed.length} changed, ${missing.length} without a usable baseline.`);

const runId = process.env.GITHUB_RUN_ID;
const approve = `node .maestro/visual/approve.mjs ${runId ?? '<run id>'}`;
if (process.env.GITHUB_STEP_SUMMARY) {
  let md = `### Screenshots (${platform})\n\n`;
  if (rows.length === 0) md += 'No screenshots in this job.\n';
  else md += table;
  if (changed.length || missing.length) {
    md +=
      '\nBoards (baseline | this run | differences in red, masked areas pink) and the captures are in the ' +
      `artifact \`e2e-${platform}-visual-…\` of this run.\n` +
      `If the change is intended, approve it on the branch: \`${approve}\`, then commit \`.maestro/baselines/\` ` +
      '(.maestro/README.md, "Screenshots").\n';
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}
if (process.env.GITHUB_ACTIONS) {
  for (const r of changed) {
    console.log(
      `::error title=Screenshot changed (${platform})::${r.name}: ${r.pixels} pixels (${pct(r.share)}) differ from ` +
        `.maestro/baselines/${platform}/${r.name}.png. Intended? ${approve}`,
    );
  }
  for (const r of rows.filter((x) => x.status === 'size')) {
    console.log(`::warning title=Screenshot not compared (${platform})::${r.name}: ${r.note}`);
  }
}
process.exit(changed.length ? 1 : 0);
