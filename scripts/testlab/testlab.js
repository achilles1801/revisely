#!/usr/bin/env node
// Firebase Test Lab for the nightly real-phone run (testlab.yml, TESTING.md "Real devices").
//
//   node scripts/testlab/testlab.js devices <models.json>
//     From `gcloud firebase test android models list --format=json`: up to three physical phones
//     (a Pixel, a Samsung Galaxy S, a Samsung Galaxy A: different makers, sizes and skins), each at
//     its newest Android, printed as gcloud --device arguments, one per line.
//   node scripts/testlab/testlab.js results <outcomes.json> <models.json> <out dir>
//     From `gcloud firebase test android run … --format=json`: writes <out dir>/attempts.json in
//     the shape E2E jobs write (.maestro/scripts/attempts.js), platform `devices`, one "flow" per
//     phone, for the develop-red issue (scripts/e2e/develop-red.js). Prints `failed=true|false`.

const fs = require('fs');
const path = require('path');

const ANDROID = { 26: '8', 27: '8.1', 28: '9', 29: '10', 30: '11', 31: '12', 32: '12L', 33: '13', 34: '14', 35: '15', 36: '16', 37: '17' };
const MIN_API = 28;

const newest = (m) => Math.max(...(m.supportedVersionIds ?? []).map(Number).filter(Number.isFinite));

/** Up to three phones: a Pixel, a Galaxy S, a Galaxy A (else the newest others), physical, arm64. */
function pickDevices(models) {
  const phones = models.filter(
    (m) =>
      m.form === 'PHYSICAL' &&
      (m.formFactor ?? 'PHONE') === 'PHONE' &&
      (m.supportedAbis ?? ['arm64-v8a']).includes('arm64-v8a') &&
      newest(m) >= MIN_API,
  );
  const best = (pred) => phones.filter(pred).sort((a, b) => newest(b) - newest(a) || String(b.name).localeCompare(String(a.name)))[0];
  const picked = [];
  const add = (m) => m && !picked.includes(m) && picked.push(m);
  add(best((m) => /google/i.test(m.brand ?? m.manufacturer ?? '') && /^Pixel/i.test(m.name ?? '')));
  add(best((m) => /samsung/i.test(m.brand ?? m.manufacturer ?? '') && /Galaxy S/i.test(m.name ?? '')));
  add(best((m) => /samsung/i.test(m.brand ?? m.manufacturer ?? '') && /Galaxy A/i.test(m.name ?? '')));
  for (const m of phones.sort((a, b) => newest(b) - newest(a))) if (picked.length < 3) add(m);
  return picked.map((m) => ({ id: m.id, version: String(newest(m)), name: m.name ?? m.id }));
}

const label = (models, axis) => {
  // axis_value: <model>-<version>-<locale>-<orientation>
  const [id, version] = String(axis).split('-');
  const m = models.find((x) => x.id === id);
  return `${m?.name ?? id} (Android ${ANDROID[version] ?? `API ${version}`})`;
};

/** gcloud's outcomes as attempts.json: Failed is a failing flow; Inconclusive and Skipped are left out. */
function toAttempts(outcomes, models, run = null) {
  const flows = [];
  for (const o of outcomes) {
    const outcome = String(o.outcome ?? '');
    if (outcome !== 'Passed' && outcome !== 'Failed') continue;
    const passed = outcome === 'Passed';
    const attempt = { attempt: 0, passed, secs: 0 };
    if (!passed) attempt.reason = String(o.test_details ?? 'Failed').replace(/\s+/g, ' ').trim() || 'Failed';
    flows.push({ flow: label(models, o.axis_value), zone: '', attempts: [attempt], firstAttemptPassed: passed, passed });
  }
  return { version: 1, platform: 'devices', run, at: new Date().toISOString(), flows };
}

if (require.main === module) {
  const [cmd, a, b, c] = process.argv.slice(2);
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  if (cmd === 'devices') {
    const picked = pickDevices(read(a));
    if (picked.length === 0) {
      console.error('No physical phone in Test Lab matched');
      process.exit(1);
    }
    for (const d of picked) console.log(`--device=model=${d.id},version=${d.version},locale=en,orientation=portrait`);
    console.error(`Phones: ${picked.map((d) => `${d.name} (API ${d.version})`).join(', ')}`);
  } else if (cmd === 'results') {
    const outcomes = fs.existsSync(a) && fs.statSync(a).size > 0 ? read(a) : [];
    const env = process.env;
    const run = env.GITHUB_RUN_ID ? { id: Number(env.GITHUB_RUN_ID), url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` } : null;
    const rec = toAttempts(Array.isArray(outcomes) ? outcomes : [], read(b), run);
    fs.mkdirSync(c, { recursive: true });
    fs.writeFileSync(path.join(c, 'attempts.json'), JSON.stringify(rec, null, 2) + '\n');
    const failed = rec.flows.some((f) => !f.passed);
    for (const f of rec.flows) console.error(`${f.passed ? 'passed' : 'FAILED'}  ${f.flow}${f.passed ? '' : `: ${f.attempts[0].reason}`}`);
    console.log(`failed=${failed}`);
    console.log(`ran=${rec.flows.length > 0}`);
  } else {
    console.error('Usage: testlab.js devices <models.json> | results <outcomes.json> <models.json> <out dir>');
    process.exit(64);
  }
}

module.exports = { pickDevices, toAttempts };
