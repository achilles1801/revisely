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
      scenarios: false,
    });
    expect(affected(['.maestro/subflows/launch.yaml'], root).flows).toEqual([
      '.maestro/flows/02-revision-session.yaml',
      '.maestro/flows/05-daily-log.yaml',
    ]);
    expect(affected(['.maestro/scripts/server-session.js'], root).flows).toEqual(['.maestro/flows/06-offline.yaml']);
  });

  it('a changed flow is affected itself; run.sh, e2e.yml and ci.yml touch every flow', () => {
    expect(affected(['.maestro/flows/05-daily-log.yaml'], root).flows).toEqual(['.maestro/flows/05-daily-log.yaml']);
    expect(affected(['src/x.ts', '.maestro/run.sh'], root)).toEqual({ flows: 'all', scenarios: false });
    expect(affected(['.github/workflows/ci.yml'], root).flows).toBe('all');
  });

  it('app code alone touches no flow here (the usual plan covers it); the scenario harness is the suite', () => {
    expect(affected(['src/screens/x.tsx', 'docs/a.md'], root)).toEqual({ flows: [], scenarios: false });
    expect(affected(['tests/scenarios/harness/phone.tsx'], root)).toEqual({ flows: [], scenarios: true });
    expect(affected(['scripts/emulators.sh'], root).scenarios).toBe(true);
  });

  it('reads the real flows of this repository', () => {
    const real = affected(['.maestro/subflows/swipe-page.yaml']);
    expect(real.flows).toEqual(expect.arrayContaining(['.maestro/flows/02-revision-session.yaml', '.maestro/flows/06-offline.yaml']));
  });
});
