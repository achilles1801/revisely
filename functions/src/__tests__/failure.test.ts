import { failure } from '../failure';

/** What the real firebase-functions logger writes for these arguments (one JSON line). */
function written(level: 'error', ...args: unknown[]): Record<string, unknown> {
  const lines: string[] = [];
  const spy = jest.spyOn(console, level).mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  try {
    // The logger keeps the console it found when loaded, so load it after the spy.
    jest.isolateModules(() => {
      const { logger } = require('firebase-functions/v2') as typeof import('firebase-functions/v2');
      logger[level](...args);
    });
  } finally {
    spy.mockRestore();
  }
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]);
}

describe('failure', () => {
  it('names the call and the reason', () => {
    const err = new Error('9 FAILED_PRECONDITION: The query requires an index.');
    expect(failure('adminConsole', err).message).toBe(
      'adminConsole failed: 9 FAILED_PRECONDITION: The query requires an index.',
    );
  });

  it("keeps the error's own frames, under the new first line", () => {
    const err = new Error('boom');
    const stack = failure('supportApply', err).stack!.split('\n');
    expect(stack[0]).toBe('Error: supportApply failed: boom');
    expect(stack.slice(1)).toEqual(err.stack!.split('\n').filter((l) => /^\s+at /.test(l)));
    expect(stack.length).toBeGreaterThan(1);
  });

  it('takes a thrown value that is not an Error', () => {
    expect(failure('supportStatus', 'offline').message).toBe('supportStatus failed: offline');
    expect(failure('supportStatus', { code: 7 }).message).toBe('supportStatus failed: [object Object]');
  });

  it('reaches Cloud Logging with the reason (the real logger)', () => {
    const entry = written('error', failure('supportApply', new Error('deadline exceeded')));
    expect(entry.severity).toBe('ERROR');
    expect(entry.message).toMatch(/^Error: supportApply failed: deadline exceeded\n\s+at /);
  });

  it('a { message } object loses the reason (why failure exists)', () => {
    const entry = written('error', 'supportApply failed', { message: 'deadline exceeded' });
    expect(String(entry.message)).not.toContain('deadline exceeded');
  });
});
