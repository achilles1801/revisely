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

  it('reads the real flows of this repository', () => {
    const real = affected(['.maestro/subflows/swipe-page.yaml']);
    expect(real.flows).toEqual(expect.arrayContaining(['.maestro/flows/02-revision-session.yaml', '.maestro/flows/06-offline.yaml']));
    // The smoke set is four real flows, and a workflow change runs exactly those on iOS.
    expect(affected(['.github/workflows/e2e.yml']).ios.map((f) => path.basename(f).slice(0, 2))).toEqual(['02', '04', '05', '06']);
  });
});
