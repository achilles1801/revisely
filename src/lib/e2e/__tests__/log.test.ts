// The E2E build's own log (src/lib/e2e/log.ts): console lines appended to a
// file in Documents, which run.sh keeps beside a failed flow's screenshot.

const mockFiles = new Map<string, Uint8Array>();
jest.mock('expo-file-system', () => {
  const concat = (a: Uint8Array, b: Uint8Array) => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  };
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    create() {
      mockFiles.set(this.uri, new Uint8Array());
    }
    write(text: string) {
      mockFiles.set(this.uri, new TextEncoder().encode(text));
    }
    open() {
      const uri = this.uri;
      return {
        offset: 0 as number | null,
        get size() {
          return mockFiles.get(uri)?.length ?? 0;
        },
        writeBytes(bytes: Uint8Array) {
          const now = mockFiles.get(uri) ?? new Uint8Array();
          mockFiles.set(uri, concat(now.slice(0, this.offset ?? 0), bytes));
        },
        close() {},
      };
    }
  }
  return { File, Paths: { document: { uri: 'documents' } } };
});

const text = () => new TextDecoder().decode(mockFiles.get('documents/e2e-log.txt'));

function freshLog(): typeof import('../log') {
  let mod!: typeof import('../log');
  jest.isolateModules(() => {
    mod = require('../log');
  });
  return mod;
}

const originals = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };

beforeEach(() => {
  mockFiles.clear();
  jest.useFakeTimers();
  for (const level of Object.keys(originals) as (keyof typeof originals)[]) console[level] = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  Object.assign(console, originals);
});

it('appends what the app logs, every level, and still passes it on', () => {
  const passedOn = console.warn as jest.Mock;
  const log = freshLog();
  log.installLog();
  console.log('[net] NetInfo: online');
  console.warn('Firestore', { code: 'unavailable' });
  jest.advanceTimersByTime(600);
  expect(text()).toMatch(/info \[e2e\] launch\n/);
  expect(text()).toMatch(/log \[net\] NetInfo: online\n/);
  expect(text()).toMatch(/warn Firestore \{"code":"unavailable"\}\n$/);
  expect(passedOn).toHaveBeenCalledWith('Firestore', { code: 'unavailable' });
  // Appended, not rewritten.
  console.error(new Error('boom'));
  log.flushE2ELog();
  expect(text().split('\n').filter(Boolean)).toHaveLength(4);
  expect(text()).toMatch(/error Error: boom/);
});

it('keeps each line to one line and a bounded length', () => {
  const log = freshLog();
  log.e2eLog('log', ['a\nb', 'x'.repeat(3000)]);
  log.flushE2ELog();
  const lines = text().split('\n').filter(Boolean);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('a ⏎ b');
  expect(lines[0].length).toBeLessThan(1700);
});
