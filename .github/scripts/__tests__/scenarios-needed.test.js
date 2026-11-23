const { scenariosNeeded } = require('../scenarios-needed');

describe('scenariosNeeded: a PR skips the scenario run only when it changes nothing the suite reads', () => {
  it('skips for the website, store, E2E flows, the console, the worker and plain docs', () => {
    expect(scenariosNeeded(['docs/index.html', 'docs/assets/site.css'])).toBe(false);
    expect(scenariosNeeded(['store/listing.json', 'store/screenshots/1.png'])).toBe(false);
    expect(scenariosNeeded(['.maestro/flows/02-session.yaml'])).toBe(false);
    expect(scenariosNeeded(['admin/console.js'])).toBe(false);
    expect(scenariosNeeded(['worker/index.ts', 'wrangler.jsonc', 'wrangler.dev.jsonc'])).toBe(false);
    expect(scenariosNeeded(['README.md', 'CONTRIBUTING.md', 'TESTING.md', 'CLAUDE.md', 'LICENSE.md'])).toBe(false);
    expect(scenariosNeeded(['.github/pull_request_template.md'])).toBe(false);
    expect(scenariosNeeded(['scripts/lint/eslint.config.mjs', 'scripts/asc.js', 'scripts/stats/digest.js'])).toBe(false);
  });

  it('runs for anything the suite reads', () => {
    expect(scenariosNeeded(['src/lib/streak.ts'])).toBe(true);
    expect(scenariosNeeded(['App.tsx'])).toBe(true);
    expect(scenariosNeeded(['functions/src/revo/ask.ts'])).toBe(true);
    expect(scenariosNeeded(['firestore.rules'])).toBe(true);
    expect(scenariosNeeded(['storage.rules'])).toBe(true);
    expect(scenariosNeeded(['package.json'])).toBe(true);
    expect(scenariosNeeded(['jest.config.js'])).toBe(true);
    expect(scenariosNeeded(['metro/firestoreCompare.js'])).toBe(true);
    expect(scenariosNeeded(['tests/scenarios/scenarios/day.scenario.tsx'])).toBe(true);
  });

  it('runs for markdown the suite does read, or that sits beside code', () => {
    expect(scenariosNeeded(['BEHAVIOUR.md'])).toBe(true);
    expect(scenariosNeeded(['tests/scenarios/README.md'])).toBe(true);
    expect(scenariosNeeded(['src/i18n/README.md'])).toBe(true);
    expect(scenariosNeeded(['functions/README.md'])).toBe(true);
  });

  it('runs for the workflows, CI scripts and the emulator script', () => {
    expect(scenariosNeeded(['.github/workflows/ci.yml'])).toBe(true);
    expect(scenariosNeeded(['.github/workflows/scenarios.yml'])).toBe(true);
    expect(scenariosNeeded(['.github/scripts/scenarios-needed.js'])).toBe(true);
    expect(scenariosNeeded(['scripts/emulators.sh'])).toBe(true);
    expect(scenariosNeeded(['scripts/scenario-quran.js'])).toBe(true);
  });

  it('runs when one file of many is read, for unknown paths, and for an empty list', () => {
    expect(scenariosNeeded(['docs/index.html', 'src/lib/streak.ts'])).toBe(true);
    expect(scenariosNeeded(['something-new/file.txt'])).toBe(true);
    expect(scenariosNeeded([])).toBe(true);
    expect(scenariosNeeded(['', '  '])).toBe(true);
  });
});
