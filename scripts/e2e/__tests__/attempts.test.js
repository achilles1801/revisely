// .maestro/scripts/attempts.js: each flow's attempts from run.sh's attempts.tsv and Maestro's logs,
// with the stand-ins a passing attempt needed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build, standInsOf } = require('../../../.maestro/scripts/attempts');

function results(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attempts-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

describe('attempts.js', () => {
  it('records the stand-ins a passing attempt needed, once each', () => {
    const dir = results({
      'attempts.tsv': '06-offline\tAmerica/Chicago\t0\tpassed\t180\t06-offline\n02-revision-session\tAmerica/Chicago\t0\tpassed\t240\t02-revision-session\n',
      '06-offline/maestro.log': [
        'Running on emulator-5554',
        ' > Run script "${console.log(\'WARNING swipe-page - the page did not turn 10 s after the swipe; swiping again\')}"',
        '[WARNING swipe-page - the page did not turn 10 s after the swipe; swiping again]',
        'KNOWN BUG SYNC-4 - the new account stayed on loading, relaunching',
        '[Passed] 06-offline (3m 0s)',
      ].join('\n'),
      '02-revision-session/maestro.log': '[Passed] 02-revision-session (4m 0s)\n',
    });
    const out = build(dir, {});
    const [offline, session] = out.flows;
    expect(offline.attempts[0].standIns).toEqual([
      'WARNING swipe-page: the page did not turn 10 s after the swipe; swiping again',
      'KNOWN BUG SYNC-4: the new account stayed on loading, relaunching',
    ]);
    expect(session.attempts[0].standIns).toBeUndefined();
  });

  it('reads none from a missing log', () => {
    expect(standInsOf('/nonexistent/folder')).toEqual([]);
  });
});
