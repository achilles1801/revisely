const fs = require('fs');
const os = require('os');
const path = require('path');
const { nextState, parseJob, readAttempts, render, stateOf, verdict } = require('../develop-red');

const run = (n) => ({ url: `https://github.com/o/r/actions/runs/${n}`, sha: `${n}abcdef0` });
const rec = (platform, flows) => ({ version: 1, platform, flows });
const flow = (name, ...attempts) => ({ flow: name, attempts, passed: attempts.some((a) => a.passed) });
const ok = { attempt: 0, passed: true, secs: 90 };
const miss = (reason) => ({ attempt: 0, passed: false, secs: 40, reason });

describe('develop-red', () => {
  it('reads a platform as red only when a flow failed every attempt, or the job failed', () => {
    const job = parseJob('true:true:failure');
    expect(job).toEqual({ flows: true, planned: true, result: 'failure' });
    expect(verdict(job, [rec('android', [flow('02-revision-session', ok), flow('09-revo', miss('Element not found: revo-answer'), miss('again'))])])).toEqual({
      red: true,
      flows: [{ flow: '09-revo', reason: 'Element not found: revo-answer' }],
    });
    // A pass on the retry is a flake (the weekly report), not red.
    expect(verdict(parseJob('true:true:success'), [rec('android', [flow('05-daily-log', miss('x'), ok)])])).toEqual({ red: false, flows: [] });
    // The job failed with no flow failing (the build, the emulator): red, said so.
    expect(verdict(parseJob('true:true:failure'), []).flows[0].flow).toBe('(the job)');
    // A push to develop builds iOS without flows: a failed build is red, a good one says nothing of the flows.
    expect(verdict(parseJob('false:true:failure'), []).flows[0].flow).toBe('(the native build)');
    expect(verdict(parseJob('false:true:success'), [])).toBeNull();
    // Cancelled by a newer push, or not in the plan: nothing to say.
    expect(verdict(parseJob('true:true:cancelled'), [])).toBeNull();
    expect(verdict(parseJob('false:false:skipped'), [])).toBeNull();
  });

  it('opens when a platform goes red, keeps when it was red since, and closes when every red platform is green', () => {
    const red = { red: true, flows: [{ flow: '09-revo', reason: 'Element not found' }] };
    const first = nextState(null, run(1), { android: red, ios: null });
    expect(first).toMatchObject({ opened: true, closed: false, changed: true });
    expect(first.state.android).toMatchObject({ red: true, since: run(1), last: run(1) });
    expect(first.state.ios).toBeNull();

    // Red again with the same flow: since stays, no change to comment on.
    const second = nextState(first.state, run(2), { android: red, ios: null });
    expect(second).toMatchObject({ opened: false, closed: false, changed: false });
    expect(second.state.android).toMatchObject({ since: run(1), last: run(2) });

    // The nightly run: iOS red too, a change.
    const iosRed = { red: true, flows: [{ flow: '06-offline', reason: 'Offline note is visible' }] };
    const third = nextState(second.state, run(3), { android: red, ios: iosRed });
    expect(third).toMatchObject({ changed: true, closed: false });

    // A push run green on Android only: still red on iOS, so it stays open.
    const fourth = nextState(third.state, run(4), { android: { red: false, flows: [] }, ios: null });
    expect(fourth).toMatchObject({ closed: false, changed: true });
    expect(fourth.state.ios.red).toBe(true);

    // The next nightly run green on both: closed.
    const fifth = nextState(fourth.state, run(5), { android: { red: false, flows: [] }, ios: { red: false, flows: [] } });
    expect(fifth).toMatchObject({ closed: true });
  });

  it('keeps its state in the issue body, with the failing steps as safe code spans', () => {
    const { state } = nextState(null, run(7), { android: { red: true, flows: [{ flow: '09-revo', reason: 'Assertion is false: `revo-answer` | visible' }] }, ios: null });
    const body = render(state);
    expect(body).toContain('## Android: red');
    expect(body).toContain("`Assertion is false: 'revo-answer' | visible`");
    expect(body).toContain('## iOS: not run yet');
    expect(stateOf({ body })).toEqual(JSON.parse(JSON.stringify(state)));
  });

  it('takes the nightly real-phone run as its own platform, leaving the E2E platforms as they were', () => {
    const red = { red: true, flows: [{ flow: '09-revo', reason: 'x' }] };
    const before = nextState(null, run(1), { android: red, ios: null }).state;
    const phones = verdict(parseJob('true:true:failure'), [rec('devices', [flow('Galaxy S23 (Android 14)', miss('Application crashed.'))])]);
    const after = nextState(before, run(2), { devices: phones });
    expect(after.state.android).toEqual(before.android);
    expect(after.state.devices).toMatchObject({ red: true, flows: [{ flow: 'Galaxy S23 (Android 14)', reason: 'Application crashed.' }] });
    expect(render(after.state)).toContain('## Real Android phones (Test Lab): red');
    // Not run yet: no section for it.
    expect(render(before)).not.toContain('Real Android phones');
  });

  it("reads every job's attempts.json from the downloaded artifacts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'develop-red-'));
    fs.mkdirSync(path.join(dir, 'e2e-android-attempts-0-1-1'));
    fs.mkdirSync(path.join(dir, 'e2e-android-attempts-1-1-1'));
    fs.writeFileSync(path.join(dir, 'e2e-android-attempts-0-1-1', 'attempts.json'), JSON.stringify(rec('android', [flow('02', ok)])));
    fs.writeFileSync(path.join(dir, 'e2e-android-attempts-1-1-1', 'attempts.json'), JSON.stringify(rec('android', [flow('09', miss('x'), miss('y'))])));
    const all = readAttempts(dir);
    expect(all.android).toHaveLength(2);
    expect(all.ios).toHaveLength(0);
    expect(readAttempts(path.join(dir, 'missing'))).toEqual({ android: [], ios: [], devices: [] });
  });
});
