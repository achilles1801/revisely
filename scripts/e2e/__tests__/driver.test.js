// iOS flows reuse Maestro's driver (.maestro/run.sh, DRIVER). Installing it again before every flow
// cost much of the 35–160 s an iOS flow spent before its first step, and once the simulator refused
// to launch the fresh install, failing 09-revo-attach before it began (#328's run 42746203992).
//
// run.sh runs here against a stand-in maestro that records its arguments: the warm-up installs the
// driver, a flow after a pass reuses it, and the attempt after a failure installs it afresh. Android
// keeps Maestro's default.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const RUN = path.join(root, '.maestro', 'run.sh');

function run(platform, flows, { warmUpFails = false, retries = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-driver-'));
  const log = path.join(dir, 'calls.log');
  const fake = path.join(dir, 'maestro');
  // Fails a flow whose file name says so, and the warm-up when asked.
  fs.writeFileSync(
    fake,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${log}"
case "$*" in
  *warm-up.yaml*) ${warmUpFails ? 'exit 1' : 'exit 0'} ;;
  *fails*) exit 1 ;;
esac
exit 0
`,
    { mode: 0o755 },
  );
  const files = flows.map((name) => {
    const file = path.join(dir, `${name}.yaml`);
    fs.writeFileSync(file, 'appId: com.revisionbuddy.app\n---\n- launchApp\n');
    return file;
  });
  const env = { ...process.env, MAESTRO: fake, E2E_DEVICE: 'test-device', E2E_OUTPUT: path.join(dir, 'out') };
  env.E2E_RETRIES = String(retries);
  delete env.CI;
  delete env.GITHUB_ACTIONS;
  delete env.GITHUB_STEP_SUMMARY;
  delete env.E2E_REPEAT;
  // A stand-in adb, xcrun and curl (which empties the emulators before each attempt), so nothing
  // touches a real device or emulator.
  for (const tool of ['adb', 'xcrun', 'curl']) {
    fs.writeFileSync(path.join(dir, tool), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  }
  env.PATH = `${dir}:${env.PATH}`;
  spawnSync('bash', [RUN, platform, ...files], { env, encoding: 'utf8' });
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n');
  fs.rmSync(dir, { recursive: true, force: true });
  // Each call: the flow it ran, and whether it kept the driver.
  return calls.map((c) => ({
    flow: path.basename(c.split(' ').find((a) => a.endsWith('.yaml')) ?? '', '.yaml'),
    reuse: c.split(' ').includes('--no-reinstall-driver'),
  }));
}

describe('iOS flows reuse the driver the warm-up installed', () => {
  test('after a pass the driver is kept; after a failure it is installed afresh', () => {
    expect(run('ios', ['a', 'b-fails', 'c', 'd'], { retries: 1 })).toEqual([
      { flow: 'warm-up', reuse: false },
      { flow: 'a', reuse: true },
      { flow: 'b-fails', reuse: true },
      { flow: 'b-fails', reuse: false }, // its retry
      { flow: 'c', reuse: false }, // the attempt before failed
      { flow: 'd', reuse: true },
    ]);
  });

  test('a warm-up that failed leaves the first flow to install it', () => {
    expect(run('ios', ['a', 'b'], { warmUpFails: true })).toEqual([
      { flow: 'warm-up', reuse: false },
      { flow: 'a', reuse: false },
      { flow: 'b', reuse: true },
    ]);
  });

  test('Android keeps Maestro\'s default', () => {
    expect(run('android', ['a', 'b']).every((c) => !c.reuse)).toBe(true);
  });
});
