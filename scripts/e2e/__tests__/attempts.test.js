const fs = require('fs');
const os = require('os');
const path = require('path');
const { build, lostTapsOf } = require('../../../.maestro/scripts/attempts');

// run.sh's results for one platform: attempts.tsv and each attempt's folder.
function results(files, tsv) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'attempts-')), 'ios');
  for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), '');
  }
  fs.writeFileSync(path.join(dir, 'attempts.tsv'), tsv.map((row) => row.join('\t')).join('\n') + '\n');
  return dir;
}

describe('attempts.json', () => {
  it('counts the taps tap-to-open found lost and tapped again, per attempt', () => {
    const dir = results(
      [
        '09-revo/run/2026-11-15_1/09-revo/takeScreenshot/lost-tap-1-revo-button.png',
        '09-revo/run/2026-11-15_1/09-revo/takeScreenshot/lost-tap-2-revo-button.png',
        '09-revo/run/2026-11-15_1/09-revo/takeScreenshot/r4-sheet.png',
        '09-revo-attach/run/2026-11-15_2/09-revo-attach/takeScreenshot/a1-sheet.png',
      ],
      [
        ['09-revo', 'America/Chicago', '0', 'passed', '700', '09-revo'],
        ['09-revo-attach', 'America/Chicago', '0', 'passed', '400', '09-revo-attach'],
      ],
    );
    expect(lostTapsOf(path.join(dir, '09-revo'))).toBe(2);
    const out = build(dir, {});
    expect(out.flows.find((f) => f.flow === '09-revo').attempts[0].lostTaps).toBe(2);
    // None: no field, as before.
    expect(out.flows.find((f) => f.flow === '09-revo-attach').attempts[0]).not.toHaveProperty('lostTaps');
  });
});
