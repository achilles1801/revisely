// The E2E test clock (src/lib/e2e/clock.ts): the links flows send, and the Date
// it puts in place of the real one.

const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.set(this.uri, '');
    }
    write(text: string) {
      mockFiles.set(this.uri, text);
    }
    textSync() {
      return mockFiles.get(this.uri) ?? '';
    }
  }
  return { File, Paths: { document: { uri: 'documents' } } };
});

const RealDate = Date;

function freshClock(): typeof import('../clock') {
  let mod!: typeof import('../clock');
  jest.isolateModules(() => {
    mod = require('../clock');
  });
  return mod;
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  (globalThis as { Date: DateConstructor }).Date = RealDate;
  mockFiles.clear();
});

describe('parseClock', () => {
  const { parseClock } = freshClock();

  it('reads a wall time in the phone’s zone', () => {
    expect(parseClock('2026-11-04T03:00')).toBe(new RealDate(2026, 10, 4, 3, 0).getTime());
    expect(parseClock('2026-11-04 03:00:30')).toBe(new RealDate(2026, 10, 4, 3, 0, 30).getTime());
  });

  it('reads an instant', () => {
    expect(parseClock('2026-11-04T09:00Z')).toBe(RealDate.UTC(2026, 10, 4, 9, 0));
    expect(parseClock('2026-11-04T09:00+05:45')).toBe(RealDate.UTC(2026, 10, 4, 3, 15));
  });

  it('refuses anything else', () => {
    expect(parseClock('tomorrow')).toBeNull();
    expect(parseClock('2026-11-04')).toBeNull();
  });
});

describe('the clock', () => {
  it('moves new Date() and Date.now() to the time set, and time runs on', () => {
    const clock = freshClock();
    clock.installClock();
    const at = RealDate.UTC(2026, 10, 3, 6, 30);
    clock.setClock(at);
    expect(Math.abs(Date.now() - at)).toBeLessThan(1000);
    expect(Math.abs(new Date().getTime() - at)).toBeLessThan(1000);
    expect(typeof Date()).toBe('string');
    expect(new RealDate(Date()).getUTCDate()).toBe(3);
  });

  it('leaves Dates made from a value alone, and they are ordinary Dates', () => {
    const clock = freshClock();
    clock.installClock();
    clock.setClock(RealDate.UTC(2030, 0, 1));
    const d = new Date(2026, 10, 3, 12, 0);
    expect(d.getFullYear()).toBe(2026);
    expect(d).toBeInstanceOf(Date);
    expect(d).toBeInstanceOf(RealDate);
    expect(Object.prototype.toString.call(d)).toBe('[object Date]');
    expect(Date.UTC(2026, 0, 1)).toBe(RealDate.UTC(2026, 0, 1));
    expect(Date.parse('2026-01-01T00:00:00Z')).toBe(RealDate.UTC(2026, 0, 1));
  });

  it('works for subclasses of Date', () => {
    const clock = freshClock();
    clock.installClock();
    clock.setClock(RealDate.UTC(2026, 10, 3));
    class Stamp extends Date {
      label() {
        return 'stamp';
      }
    }
    const s = new Stamp();
    expect(s.label()).toBe('stamp');
    expect(s.getUTCFullYear()).toBe(2026);
  });

  it('keeps the offset for the next launch, and the links set it', () => {
    const first = freshClock();
    first.installClock();
    expect(first.handleClockLink('revisely://e2e/clock?at=2026-11-04T09%3A00Z')).toBe(true);
    (globalThis as { Date: DateConstructor }).Date = RealDate;

    const next = freshClock();
    next.installClock();
    expect(Math.abs(Date.now() - RealDate.UTC(2026, 10, 4, 9))).toBeLessThan(1000);
    expect(next.handleClockLink('revisely://e2e/clock?at=now')).toBe(true);
    expect(Math.abs(Date.now() - RealDate.now())).toBeLessThan(1000);
    expect(next.handleClockLink('revisely://today')).toBe(false);
  });
});
