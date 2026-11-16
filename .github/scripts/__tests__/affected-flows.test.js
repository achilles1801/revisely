const fs = require('fs');
const os = require('os');
const path = require('path');
const { affected } = require('../affected-flows');

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flows-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

const root = repo({
  '.maestro/flows/02-revision-session.yaml': '---\n- runFlow:\n    file: ../subflows/new-account.yaml\n- runFlow: ../subflows/swipe-pages.yaml\n',
  '.maestro/flows/05-daily-log.yaml': '---\n- runFlow:\n    file: ../subflows/new-account.yaml\n- runFlow: ../subflows/open-log.yaml\n',
  '.maestro/flows/06-offline.yaml': "---\n- runFlow:\n    file: '../subflows/swipe-pages.yaml'\n- runScript:\n    file: ../scripts/server-session.js\n",
  '.maestro/subflows/new-account.yaml': '---\n- runFlow: launch.yaml\n',
  '.maestro/subflows/launch.yaml': '---\n- launchApp\n',
  '.maestro/subflows/swipe-pages.yaml': '---\n- runFlow: swipe-page.yaml\n',
  '.maestro/subflows/swipe-page.yaml': '---\n- swipe\n',
  '.maestro/subflows/open-log.yaml': '---\n- tapOn: x\n',
  '.maestro/scripts/server-session.js': '// x\n',
});

describe('affected flows', () => {
  it('finds every flow that uses a changed subflow, through other subflows', () => {
    expect(affected(['.maestro/subflows/swipe-page.yaml'], root)).toEqual({
      flows: ['.maestro/flows/02-revision-session.yaml', '.maestro/flows/06-offline.yaml'],
      ios: ['.maestro/flows/02-revision-session.yaml', '.maestro/flows/06-offline.yaml'],
      scenarios: false,
    });
    expect(affected(['.maestro/subflows/launch.yaml'], root).flows).toEqual([
      '.maestro/flows/02-revision-session.yaml',
      '.maestro/flows/05-daily-log.yaml',
    ]);
    expect(affected(['.maestro/scripts/server-session.js'], root).flows).toEqual(['.maestro/flows/06-offline.yaml']);
  });

  it('a changed flow is affected itself, on both platforms (a Recite PR that edits 18 runs 18, not the smoke set too)', () => {
    expect(affected(['.maestro/flows/05-daily-log.yaml'], root)).toEqual({
      flows: ['.maestro/flows/05-daily-log.yaml'],
      ios: ['.maestro/flows/05-daily-log.yaml'],
      scenarios: false,
    });
  });

  it('run.sh, e2e.yml and ci.yml touch every flow on Android; on iOS the smoke set and what the other files touch', () => {
    const smoke = ['.maestro/flows/02-revision-session.yaml', '.maestro/flows/05-daily-log.yaml', '.maestro/flows/06-offline.yaml'];
    expect(affected(['src/x.ts', '.maestro/run.sh'], root)).toEqual({ flows: 'all', ios: smoke, scenarios: false });
    expect(affected(['.github/workflows/ci.yml'], root)).toEqual({ flows: 'all', ios: smoke, scenarios: false });
    const flows07 = repo({
      '.maestro/flows/02-revision-session.yaml': '---\n- launchApp\n',
      '.maestro/flows/07-recordings.yaml': '---\n- runFlow: ../subflows/record.yaml\n',
      '.maestro/flows/11-surah-names.yaml': '---\n- launchApp\n',
      '.maestro/subflows/record.yaml': '---\n- tapOn: rec\n',
    });
    expect(affected(['.github/workflows/e2e.yml', '.maestro/subflows/record.yaml'], flows07)).toEqual({
      flows: 'all',
      ios: ['.maestro/flows/02-revision-session.yaml', '.maestro/flows/07-recordings.yaml'],
      scenarios: false,
    });
  });

  it('app code alone touches no flow here (the usual plan covers it); the scenario harness is the suite', () => {
    expect(affected(['src/screens/x.tsx', 'docs/a.md'], root)).toEqual({ flows: [], ios: [], scenarios: false });
    expect(affected(['tests/scenarios/harness/phone.tsx'], root)).toEqual({ flows: [], ios: [], scenarios: true });
    expect(affected(['scripts/emulators.sh'], root).scenarios).toBe(true);
  });

  // The E2E job lists live in scripts/e2e/jobs.json (until Nov 16 2026 in e2e.yml, whose change runs every
  // flow): a change to them runs the flows whose job changed, so splitting a long flow costs only its job.
  describe('the E2E jobs file', () => {
    const jobs = (full) => ({ full, smoke_ios: [{ name: 'smoke: 02 05 06', flows: '.maestro/flows/0[256]-*.yaml' }] });
    const before = jobs([
      { name: '02 05', flows: '.maestro/flows/0[25]-*.yaml' },
      { name: '06', flows: '.maestro/flows/06-*.yaml' },
    ]);
    const withJobs = (after) => repo({
      '.maestro/flows/02-revision-session.yaml': '---\n- launchApp\n',
      '.maestro/flows/05-daily-log.yaml': '---\n- launchApp\n',
      '.maestro/flows/06-offline.yaml': '---\n- launchApp\n',
      '.maestro/flows/07-recordings.yaml': '---\n- launchApp\n',
      'scripts/e2e/jobs.json': JSON.stringify(after),
    });

    it('runs the flows of each job it changed, on both platforms', () => {
      // 05 moved into 06's job: both jobs changed.
      const moved = withJobs(jobs([
        { name: '02', flows: '.maestro/flows/02-*.yaml' },
        { name: '05 06', flows: '.maestro/flows/0[56]-*.yaml' },
      ]));
      const all = ['.maestro/flows/02-revision-session.yaml', '.maestro/flows/05-daily-log.yaml', '.maestro/flows/06-offline.yaml'];
      expect(affected(['scripts/e2e/jobs.json'], moved, before)).toEqual({ flows: all, ios: all, scenarios: false });
    });

    it('runs a new flow added to a job, and that job\'s other flows, and nothing else', () => {
      const added = withJobs(jobs([
        { name: '02 05', flows: '.maestro/flows/0[25]-*.yaml' },
        { name: '06 07', flows: '.maestro/flows/0[67]-*.yaml' },
      ]));
      expect(affected(['scripts/e2e/jobs.json', '.maestro/flows/07-recordings.yaml'], added, before).flows).toEqual([
        '.maestro/flows/06-offline.yaml',
        '.maestro/flows/07-recordings.yaml',
      ]);
    });

    it('runs nothing for a job renamed with the same flows, nor for a glob that runs the same flows', () => {
      const renamed = withJobs(jobs([
        { name: 'two and five', flows: '.maestro/flows/02-*.yaml .maestro/flows/05-*.yaml' },
        { name: '06', flows: '.maestro/flows/06-offline.yaml' },
      ]));
      expect(affected(['scripts/e2e/jobs.json'], renamed, before).flows).toEqual([]);
    });

    it('runs the flows of a job whose order changed (10 goes before the 09 seeds for a reason)', () => {
      const reordered = withJobs(jobs([
        { name: '05 02', flows: '.maestro/flows/05-*.yaml .maestro/flows/02-*.yaml' },
        { name: '06', flows: '.maestro/flows/06-*.yaml' },
      ]));
      expect(affected(['scripts/e2e/jobs.json'], reordered, before).flows).toEqual([
        '.maestro/flows/02-revision-session.yaml',
        '.maestro/flows/05-daily-log.yaml',
      ]);
    });

    it('runs the smoke flows when a smoke set changed', () => {
      const smoke = withJobs({ ...before, smoke_ios: [{ name: 'smoke: 02 05', flows: '.maestro/flows/0[25]-*.yaml' }, { name: 'smoke: 06', flows: '.maestro/flows/06-*.yaml' }] });
      expect(affected(['scripts/e2e/jobs.json'], smoke, before).flows).toEqual([
        '.maestro/flows/02-revision-session.yaml',
        '.maestro/flows/05-daily-log.yaml',
        '.maestro/flows/06-offline.yaml',
      ]);
    });

    it('runs every flow, as for e2e.yml, with no base file to compare (or none here)', () => {
      const same = withJobs(before);
      expect(affected(['scripts/e2e/jobs.json'], same, undefined).flows).toBe('all');
      expect(affected(['scripts/e2e/jobs.json'], repo({ '.maestro/flows/02-revision-session.yaml': '---\n' }), before).flows).toBe('all');
    });
  });

  it('reads the real flows of this repository', () => {
    const real = affected(['.maestro/subflows/swipe-page.yaml']);
    expect(real.flows).toEqual(expect.arrayContaining(['.maestro/flows/02-revision-session.yaml', '.maestro/flows/06-offline.yaml']));
    // The smoke set is four real flows, and a workflow change runs exactly those on iOS.
    expect(affected(['.github/workflows/e2e.yml']).ios.map((f) => path.basename(f).slice(0, 2))).toEqual(['02', '04', '05', '06']);
  });
});
