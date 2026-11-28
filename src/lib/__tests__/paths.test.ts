// Which path an account is on (BEHAVIOUR.md PATH-1): only setup's beginner answer puts one on the beginner path, and only
// while its switch is on; every other account, the ones set up before it included, is on today's.
import { isBeginner, pathFieldForSetup, pathOf } from '../paths';
import { setBeginnerPathForTests } from '../release/beginnerPath';

afterEach(() => setBeginnerPathForTests(undefined));

describe('[PATH-1] the path an account is on', () => {
  it('no path (every account set up before it, or with today’s answers) is today’s path, switch on or off', () => {
    for (const on of [true, false]) {
      setBeginnerPathForTests(on);
      expect([pathOf(null), pathOf(undefined), pathOf({}), pathOf({ path: undefined }), pathOf({ path: null })]).toEqual([
        'middle',
        'middle',
        'middle',
        'middle',
        'middle',
      ]);
    }
  });

  it('a beginner’s account is on the beginner path only while the switch is on (Revisely Dev)', () => {
    setBeginnerPathForTests(true);
    expect(pathOf({ path: 'beginner' })).toBe('beginner');
    expect(isBeginner({ path: 'beginner' })).toBe(true);
    setBeginnerPathForTests(false);
    expect(pathOf({ path: 'beginner' })).toBe('middle');
    expect(isBeginner({ path: 'beginner' })).toBe(false);
  });

  it('the hafiz path isn’t built: such an account gets today’s', () => {
    setBeginnerPathForTests(true);
    expect(pathOf({ path: 'hafiz' })).toBe('middle');
  });

  it('under Jest the switch is off unless a test turns it on, so every other test runs today’s setup and Home', () => {
    expect(pathOf({ path: 'beginner' })).toBe('middle');
  });
});

describe('[PATH-1] what setup’s last question writes', () => {
  it('the beginner’s path when chosen', () => {
    expect(pathFieldForSetup('beginner', null)).toEqual({ path: 'beginner' });
    expect(pathFieldForSetup('beginner', { path: 'beginner' })).toEqual({ path: 'beginner' });
  });

  it('nothing for an account that never had a path: its document is written as before', () => {
    expect(pathFieldForSetup(undefined, null)).toEqual({});
    expect(pathFieldForSetup(undefined, {})).toEqual({});
    expect(pathFieldForSetup(undefined, { path: null })).toEqual({});
  });

  it('null for a beginner setting up again with today’s answers, which takes them off it', () => {
    expect(pathFieldForSetup(undefined, { path: 'beginner' })).toEqual({ path: null });
  });
});
